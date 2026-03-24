param(
  [Parameter(Mandatory=$true)][string]$ZoneId,
  [string]$ApiToken,
  [string]$ApiEmail,
  [string]$ApiKey,
  [Parameter(Mandatory=$true)][string]$OriginIp
)

$ErrorActionPreference = 'Stop'
$ApiBase = 'https://api.cloudflare.com/client/v4'
$Headers = @{ 'Content-Type' = 'application/json' }
if (-not [string]::IsNullOrWhiteSpace($ApiToken)) {
  $Headers['Authorization'] = "Bearer $($ApiToken.Trim())"
  Write-Host "[INFO] Cloudflare auth: scoped API token"
} elseif (-not [string]::IsNullOrWhiteSpace($ApiEmail) -and -not [string]::IsNullOrWhiteSpace($ApiKey)) {
  $Headers['X-Auth-Email'] = $ApiEmail.Trim()
  $Headers['X-Auth-Key'] = $ApiKey.Trim()
  Write-Host "[INFO] Cloudflare auth: global API key + email"
} else {
  throw "Provide either -ApiToken OR both -ApiEmail and -ApiKey."
}

function Invoke-CfApi {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    [object]$Body
  )

  $uri = "$ApiBase$Path"
  $params = @{ Method = $Method; Uri = $uri; Headers = $Headers }
  if ($null -ne $Body) {
    $params['Body'] = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $raw = $reader.ReadToEnd()
      throw "Cloudflare API error for $Method $Path => $raw"
    }
    throw
  }
}

function Assert-CfSuccess {
  param([object]$Response, [string]$Context)
  if (-not $Response.success) {
    $err = ($Response.errors | ConvertTo-Json -Depth 6 -Compress)
    throw "$Context failed: $err"
  }
}

function Ensure-DnsRecord {
  param(
    [string]$Type,
    [string]$Name,
    [string]$Content,
    [bool]$Proxied
  )

  $list = Invoke-CfApi -Method GET -Path "/zones/$ZoneId/dns_records?type=$Type&name=$Name"
  Assert-CfSuccess $list "List DNS $Name"

  $payload = @{
    type = $Type
    name = $Name
    content = $Content
    ttl = 1
    proxied = $Proxied
  }

  if ($list.result.Count -gt 0) {
    $record = $list.result[0]
    if ($record.content -eq $Content -and [bool]$record.proxied -eq $Proxied) {
      Write-Host "[OK] DNS unchanged: $Type $Name -> $Content proxied=$Proxied"
      return
    }

    $updated = Invoke-CfApi -Method PUT -Path "/zones/$ZoneId/dns_records/$($record.id)" -Body $payload
    Assert-CfSuccess $updated "Update DNS $Name"
    Write-Host "[OK] DNS updated: $Type $Name -> $Content proxied=$Proxied"
    return
  }

  $created = Invoke-CfApi -Method POST -Path "/zones/$ZoneId/dns_records" -Body $payload
  Assert-CfSuccess $created "Create DNS $Name"
  Write-Host "[OK] DNS created: $Type $Name -> $Content proxied=$Proxied"
}

function Set-Setting {
  param([string]$Id, [object]$Value)
  $resp = Invoke-CfApi -Method PATCH -Path "/zones/$ZoneId/settings/$Id" -Body @{ value = $Value }
  Assert-CfSuccess $resp "Set setting $Id"
  Write-Host "[OK] Setting: $Id = $($resp.result.value | ConvertTo-Json -Compress)"
}

function Set-SettingOptional {
  param([string]$Id, [object]$Value)
  try {
    Set-Setting -Id $Id -Value $Value
  } catch {
    Write-Warning "Setting not applied ($Id): $($_.Exception.Message)"
  }
}

function Get-Entrypoint {
  param([string]$Phase)
  try {
    $resp = Invoke-CfApi -Method GET -Path "/zones/$ZoneId/rulesets/phases/$Phase/entrypoint"
    Assert-CfSuccess $resp "Get entrypoint $Phase"
    return $resp.result
  } catch {
    if ($_.Exception.Message -match 'does not exist' -or $_.Exception.Message -match '"code":7000' -or $_.Exception.Message -match '"code":10000') {
      return $null
    }
    if ($_.Exception.Message -match 'HTTP status code: 404') {
      return $null
    }
    return $null
  }
}

function New-RuleObject {
  param(
    [string]$Description,
    [string]$Expression,
    [string]$Action,
    [object]$ActionParameters,
    [object]$RateLimit
  )

  $rule = @{
    enabled = $true
    description = $Description
    expression = $Expression
    action = $Action
  }

  if ($null -ne $ActionParameters) { $rule['action_parameters'] = $ActionParameters }
  if ($null -ne $RateLimit) { $rule['ratelimit'] = $RateLimit }

  return $rule
}

function Ensure-PhaseRule {
  param(
    [string]$Phase,
    [string]$Description,
    [string]$Expression,
    [string]$Action,
    [object]$ActionParameters = $null,
    [object]$RateLimit = $null
  )

  $ruleObj = New-RuleObject -Description $Description -Expression $Expression -Action $Action -ActionParameters $ActionParameters -RateLimit $RateLimit
  $entry = Get-Entrypoint -Phase $Phase

  if ($null -eq $entry) {
    $createPayload = @{
      name = "$Phase entry"
      kind = 'zone'
      phase = $Phase
      rules = @($ruleObj)
    }
    $created = Invoke-CfApi -Method POST -Path "/zones/$ZoneId/rulesets" -Body $createPayload
    Assert-CfSuccess $created "Create phase entrypoint $Phase"
    Write-Host "[OK] Rule created (new phase $Phase): $Description"
    return
  }

  $rulesetId = $entry.id
  $existing = $entry.rules | Where-Object { $_.description -eq $Description } | Select-Object -First 1

  if ($null -ne $existing) {
    $updated = Invoke-CfApi -Method PATCH -Path "/zones/$ZoneId/rulesets/$rulesetId/rules/$($existing.id)" -Body $ruleObj
    Assert-CfSuccess $updated "Update rule $Description in $Phase"
    Write-Host "[OK] Rule updated: $Description"
  } else {
    $createdRule = Invoke-CfApi -Method POST -Path "/zones/$ZoneId/rulesets/$rulesetId/rules" -Body $ruleObj
    Assert-CfSuccess $createdRule "Create rule $Description in $Phase"
    Write-Host "[OK] Rule created: $Description"
  }
}

function Ensure-PhaseRuleOptional {
  param(
    [string]$Phase,
    [string]$Description,
    [string]$Expression,
    [string]$Action,
    [object]$ActionParameters = $null,
    [object]$RateLimit = $null
  )

  try {
    Ensure-PhaseRule -Phase $Phase -Description $Description -Expression $Expression -Action $Action -ActionParameters $ActionParameters -RateLimit $RateLimit
  } catch {
    Write-Warning "Optional rule skipped ($Description): $($_.Exception.Message)"
  }
}

Write-Host "== DNS upsert =="
Ensure-DnsRecord -Type A -Name 'catwa.chat' -Content $OriginIp -Proxied $true
Ensure-DnsRecord -Type CNAME -Name 'www.catwa.chat' -Content 'catwa.chat' -Proxied $true
Ensure-DnsRecord -Type A -Name 'cdn.catwa.chat' -Content $OriginIp -Proxied $true
Ensure-DnsRecord -Type A -Name 'api.catwa.chat' -Content $OriginIp -Proxied $true
Ensure-DnsRecord -Type A -Name 'ws.catwa.chat' -Content $OriginIp -Proxied $true
Ensure-DnsRecord -Type A -Name 'downloads.catwa.chat' -Content $OriginIp -Proxied $true

Write-Host "== Core TLS / performance settings =="
Set-Setting -Id 'ssl' -Value 'strict'
Set-Setting -Id 'always_use_https' -Value 'on'
Set-Setting -Id 'automatic_https_rewrites' -Value 'on'
Set-Setting -Id 'min_tls_version' -Value '1.2'
Set-Setting -Id 'tls_1_3' -Value 'on'
Set-Setting -Id 'opportunistic_encryption' -Value 'on'
Set-Setting -Id 'brotli' -Value 'on'
Set-Setting -Id 'http3' -Value 'on'
Set-Setting -Id 'early_hints' -Value 'on'
Set-Setting -Id 'always_online' -Value 'on'
Set-Setting -Id 'security_level' -Value 'medium'
Set-Setting -Id 'browser_check' -Value 'on'
Set-Setting -Id 'challenge_ttl' -Value 1800
Set-Setting -Id 'rocket_loader' -Value 'off'
Set-Setting -Id 'minify' -Value @{ html='on'; css='on'; js='on' }
Set-Setting -Id '0rtt' -Value 'off'

# Optional features depending on plan/account
Set-SettingOptional -Id 'bot_fight_mode' -Value 'on'

Write-Host "== Optional tiered cache endpoint =="
try {
  $tier = Invoke-CfApi -Method POST -Path "/zones/$ZoneId/cache/tiered_cache_smart_topology_enable"
  Assert-CfSuccess $tier "Enable tiered cache smart topology"
  Write-Host "[OK] Tiered cache smart topology enabled"
} catch {
  Write-Warning "Tiered cache not enabled: $($_.Exception.Message)"
}

Write-Host "== Redirect rules =="
try {
  Ensure-PhaseRuleOptional -Phase 'http_request_dynamic_redirect' -Description 'Canonicalize www to apex' -Expression '(http.host eq "www.catwa.chat")' -Action 'redirect' -ActionParameters @{
    from_value = @{
      status_code = 301
      target_url = @{ expression = 'concat("https://catwa.chat", http.request.uri.path)' }
      preserve_query_string = $true
    }
  }
} catch {
  Write-Warning "Redirect rule skipped (optional): $($_.Exception.Message)"
}

Write-Host "== Cache rules =="
Ensure-PhaseRuleOptional -Phase 'http_request_cache_settings' -Description 'Bypass API cache' -Expression '(http.host eq "api.catwa.chat")' -Action 'set_cache_settings' -ActionParameters @{ cache = $false }

Ensure-PhaseRuleOptional -Phase 'http_request_cache_settings' -Description 'Bypass CDN uploads cache' -Expression '(http.host eq "cdn.catwa.chat" and starts_with(http.request.uri.path, "/uploads/"))' -Action 'set_cache_settings' -ActionParameters @{ cache = $false }

Ensure-PhaseRuleOptional -Phase 'http_request_cache_settings' -Description 'CDN assets aggressive cache 30d' -Expression '(http.host eq "cdn.catwa.chat" and starts_with(http.request.uri.path, "/assets/"))' -Action 'set_cache_settings' -ActionParameters @{
  cache = $true
  edge_ttl = @{ mode = 'override_origin'; default = 2592000 }
  browser_ttl = @{ mode = 'override_origin'; default = 2592000 }
}

Ensure-PhaseRuleOptional -Phase 'http_request_cache_settings' -Description 'Downloads binaries cache 1d' -Expression '(http.host eq "downloads.catwa.chat" and (ends_with(lower(http.request.uri.path), ".msi") or ends_with(lower(http.request.uri.path), ".exe") or ends_with(lower(http.request.uri.path), ".zip") or ends_with(lower(http.request.uri.path), ".7z") or ends_with(lower(http.request.uri.path), ".dmg") or ends_with(lower(http.request.uri.path), ".pkg")))' -Action 'set_cache_settings' -ActionParameters @{
  cache = $true
  edge_ttl = @{ mode = 'override_origin'; default = 86400 }
  browser_ttl = @{ mode = 'override_origin'; default = 86400 }
}

Ensure-PhaseRuleOptional -Phase 'http_request_cache_settings' -Description 'Apex static assets cache 7d' -Expression '(http.host in {"catwa.chat" "www.catwa.chat"} and (starts_with(http.request.uri.path, "/assets/") or starts_with(http.request.uri.path, "/static/")) and (ends_with(lower(http.request.uri.path), ".js") or ends_with(lower(http.request.uri.path), ".css") or ends_with(lower(http.request.uri.path), ".png") or ends_with(lower(http.request.uri.path), ".jpg") or ends_with(lower(http.request.uri.path), ".jpeg") or ends_with(lower(http.request.uri.path), ".gif") or ends_with(lower(http.request.uri.path), ".svg") or ends_with(lower(http.request.uri.path), ".webp") or ends_with(lower(http.request.uri.path), ".ico") or ends_with(lower(http.request.uri.path), ".woff") or ends_with(lower(http.request.uri.path), ".woff2") or ends_with(lower(http.request.uri.path), ".ttf")))' -Action 'set_cache_settings' -ActionParameters @{
  cache = $true
  edge_ttl = @{ mode = 'override_origin'; default = 604800 }
  browser_ttl = @{ mode = 'override_origin'; default = 604800 }
}

Write-Host "== WAF custom rules =="
Ensure-PhaseRuleOptional -Phase 'http_request_firewall_custom' -Description 'Block common WP exploit paths' -Expression '(http.request.uri.path contains "/wp-admin" or http.request.uri.path contains "/wp-login.php" or http.request.uri.path contains "/xmlrpc.php")' -Action 'block'
Ensure-PhaseRuleOptional -Phase 'http_request_firewall_custom' -Description 'Block traversal and null-byte probes' -Expression '(http.host in {"api.catwa.chat" "cdn.catwa.chat" "ws.catwa.chat"} and (lower(http.request.uri.path) contains ".." or lower(http.request.uri.path) contains "%2e%2e" or lower(http.request.uri.path) contains "%00" or lower(http.request.uri.query) contains "%00"))' -Action 'block'
Ensure-PhaseRuleOptional -Phase 'http_request_firewall_custom' -Description 'Challenge suspicious API scanner methods' -Expression '(http.host eq "api.catwa.chat" and starts_with(http.request.uri.path, "/api/") and not (http.request.method in {"GET" "POST" "PATCH" "DELETE" "OPTIONS"}))' -Action 'managed_challenge'
Write-Host "[INFO] API auth managed challenge skipped to avoid breaking XHR login flows."

Write-Host "== Rate limit rules =="
Ensure-PhaseRuleOptional -Phase 'http_ratelimit' -Description 'Rate limit API auth endpoints' -Expression '(http.host eq "api.catwa.chat" and ((http.request.uri.path eq "/api/v1/auth/login") or (http.request.uri.path eq "/api/v1/auth/register") or (http.request.uri.path eq "/api/v1/auth/refresh") or (http.request.uri.path eq "/api/v1/uploads") or (http.request.method eq "POST" and http.request.uri.path eq "/api/v1/dms")))' -Action 'block' -RateLimit @{
  characteristics = @('ip.src','cf.colo.id')
  period = 10
  requests_per_period = 8
  mitigation_timeout = 10
}

Write-Host "== Response header transform rules =="
Ensure-PhaseRuleOptional -Phase 'http_response_headers_transform' -Description 'Set anti-clickjacking headers for web app' -Expression '(http.host in {"catwa.chat" "www.catwa.chat"})' -Action 'rewrite' -ActionParameters @{
  headers = @{
    'X-Frame-Options' = @{
      operation = 'set'
      value = 'DENY'
    }
    'Content-Security-Policy' = @{
      operation = 'set'
      value = "frame-ancestors 'none'"
    }
  }
}
Ensure-PhaseRuleOptional -Phase 'http_response_headers_transform' -Description 'Allow CORS for downloads update manifests' -Expression '(http.host eq "downloads.catwa.chat" and starts_with(lower(http.request.uri.path), "/updates/") and ends_with(lower(http.request.uri.path), "/latest.json"))' -Action 'rewrite' -ActionParameters @{
  headers = @{
    'Access-Control-Allow-Origin' = @{
      operation = 'set'
      value = '*'
    }
    'Access-Control-Allow-Methods' = @{
      operation = 'set'
      value = 'GET, OPTIONS'
    }
    'Access-Control-Allow-Headers' = @{
      operation = 'set'
      value = 'Content-Type'
    }
    'Vary' = @{
      operation = 'set'
      value = 'Origin'
    }
  }
}

Write-Host "== Done =="


