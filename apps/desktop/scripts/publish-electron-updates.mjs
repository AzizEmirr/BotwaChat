import { existsSync } from "node:fs";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function printUsage() {
  console.log(`
[catwa] publish-electron-updates

Usage:
  npm run publish:updates -- --host 109.236.48.161 --user root
  npm run publish:updates -- --dry-run --host 109.236.48.161 --user root

Options:
  --host <hostname_or_ip>              Default: CATWA_PUBLISH_HOST or 109.236.48.161
  --user <ssh_user>                    Default: CATWA_PUBLISH_USER or root
  --password <ssh_password>            Optional (or CATWA_PUBLISH_PASSWORD)
  --host-key <fingerprint>             Optional (or CATWA_PUBLISH_HOST_KEY). Example: 77:ca:...
  --plink-path <path_to_plink>         Optional Windows override (or CATWA_PUBLISH_PLINK)
  --pscp-path <path_to_pscp>           Optional Windows override (or CATWA_PUBLISH_PSCP)
  --base-dir <remote_dir>              Default: CATWA_PUBLISH_BASE_DIR or /var/www/html
  --source-dir <local_dir>             Default: <repo>/apps/desktop/release-electron
  --channel <name>                     Default: stable
  --port <ssh_port>                    Optional (or CATWA_PUBLISH_PORT)
  --identity-file <path>               Optional SSH key file (or CATWA_PUBLISH_IDENTITY_FILE)
  --chown <user:group>                 Optional post-publish chown (or CATWA_PUBLISH_CHOWN)
  --dry-run                            Print commands only
  --help                               Show this help
`);
}

function parseArgs(argv) {
  const options = {
    host: process.env.CATWA_PUBLISH_HOST ?? "109.236.48.161",
    user: process.env.CATWA_PUBLISH_USER ?? "root",
    password: process.env.CATWA_PUBLISH_PASSWORD ?? "",
    hostKey: process.env.CATWA_PUBLISH_HOST_KEY ?? "",
    plinkPath: process.env.CATWA_PUBLISH_PLINK ?? "",
    pscpPath: process.env.CATWA_PUBLISH_PSCP ?? "",
    baseDir: process.env.CATWA_PUBLISH_BASE_DIR ?? "/var/www/html",
    sourceDir: process.env.CATWA_PUBLISH_SOURCE_DIR ?? "",
    channel: process.env.CATWA_PUBLISH_CHANNEL ?? "stable",
    port: process.env.CATWA_PUBLISH_PORT ?? "",
    identityFile: process.env.CATWA_PUBLISH_IDENTITY_FILE ?? "",
    chown: process.env.CATWA_PUBLISH_CHOWN ?? "",
    dryRun: false,
    help: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--help" || current === "-h") {
      options.help = true;
      continue;
    }
    if (current === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (current === "--host" && next) {
      options.host = next;
      index += 1;
      continue;
    }
    if (current === "--user" && next) {
      options.user = next;
      index += 1;
      continue;
    }
    if (current === "--password" && next) {
      options.password = next;
      index += 1;
      continue;
    }
    if (current === "--host-key" && next) {
      options.hostKey = next;
      index += 1;
      continue;
    }
    if (current === "--plink-path" && next) {
      options.plinkPath = next;
      index += 1;
      continue;
    }
    if (current === "--pscp-path" && next) {
      options.pscpPath = next;
      index += 1;
      continue;
    }
    if (current === "--base-dir" && next) {
      options.baseDir = next;
      index += 1;
      continue;
    }
    if (current === "--source-dir" && next) {
      options.sourceDir = next;
      index += 1;
      continue;
    }
    if (current === "--channel" && next) {
      options.channel = next;
      index += 1;
      continue;
    }
    if (current === "--port" && next) {
      options.port = next;
      index += 1;
      continue;
    }
    if (current === "--identity-file" && next) {
      options.identityFile = next;
      index += 1;
      continue;
    }
    if (current === "--chown" && next) {
      options.chown = next;
      index += 1;
      continue;
    }

    throw new Error(`Bilinmeyen arguman: ${current}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const dryRun = options.dryRun === true;
  const printable = `${command} ${args.join(" ")}`.trim();

  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${printable} komutu ${code} koduyla bitti.`));
      }
    });
  });
}

function shellQuote(input) {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

async function ensurePathExists(filePath) {
  await access(filePath, constants.F_OK);
}

function parseLatestArtifactFileName(latestYmlRaw) {
  const match = latestYmlRaw.match(/^path:\s*(.+)\s*$/m);
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function buildSSHArgs(options) {
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"];
  if (options.port) {
    args.push("-p", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  return args;
}

function buildSCPArgs(options) {
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"];
  if (options.port) {
    args.push("-P", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  return args;
}

function buildPlinkArgs(options) {
  const args = ["-batch", "-ssh"];
  if (options.hostKey) {
    args.push("-hostkey", options.hostKey);
  }
  if (options.port) {
    args.push("-P", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  if (options.password) {
    args.push("-pw", options.password);
  }
  return args;
}

function buildPscpArgs(options) {
  const args = ["-batch", "-ssh"];
  if (options.hostKey) {
    args.push("-hostkey", options.hostKey);
  }
  if (options.port) {
    args.push("-P", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  if (options.password) {
    args.push("-pw", options.password);
  }
  return args;
}

function resolveWindowsPuttyExecutable(explicitPath, executableFileName) {
  const candidates = [];
  const normalizedExplicit = explicitPath.trim();
  if (normalizedExplicit) {
    candidates.push(normalizedExplicit);
  }

  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFiles) {
    candidates.push(path.join(programFiles, "PuTTY", executableFileName));
  }
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, "PuTTY", executableFileName));
  }

  candidates.push(executableFileName);

  for (const candidate of candidates) {
    const looksLikePath = candidate.includes("\\") || candidate.includes("/") || /^[a-zA-Z]:/.test(candidate);
    if (!looksLikePath) {
      return candidate;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`${executableFileName} bulunamadi. --${executableFileName.startsWith("plink") ? "plink-path" : "pscp-path"} ver veya PuTTY kurulumunu kontrol et.`);
}

function createTransport(options) {
  const hasPassword = options.password.trim().length > 0;

  if (!hasPassword) {
    return {
      runRemoteCommand: (remote, command, runOptions) => run("ssh", [...buildSSHArgs(options), remote, command], runOptions),
      uploadFile: (localFile, remote, remoteDir, runOptions) =>
        run("scp", [...buildSCPArgs(options), localFile, `${remote}:${remoteDir}/`], runOptions)
    };
  }

  if (process.platform !== "win32") {
    throw new Error("Password-auth su an sadece Windows ortaminda plink/pscp ile destekleniyor.");
  }

  const plinkCommand = resolveWindowsPuttyExecutable(options.plinkPath, "plink.exe");
  const pscpCommand = resolveWindowsPuttyExecutable(options.pscpPath, "pscp.exe");

  return {
    runRemoteCommand: (remote, command, runOptions) => run(plinkCommand, [...buildPlinkArgs(options), remote, command], runOptions),
    uploadFile: (localFile, remote, remoteDir, runOptions) =>
      run(pscpCommand, [...buildPscpArgs(options), localFile, `${remote}:${remoteDir}/`], runOptions)
  };
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printUsage();
    return;
  }

  if (!parsed.host.trim()) {
    throw new Error("Host gerekli. --host ver veya CATWA_PUBLISH_HOST set et.");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultSourceDir = path.resolve(scriptDir, "..", "release-electron");
  const sourceDir = parsed.sourceDir.trim() ? path.resolve(parsed.sourceDir.trim()) : defaultSourceDir;
  const remote = `${parsed.user}@${parsed.host}`;
  const channel = parsed.channel.trim().toLowerCase() || "stable";
  const baseDir = parsed.baseDir.replace(/\/+$/, "");
  const remoteChannelDir = `${baseDir}/updates/${channel}`;

  await ensurePathExists(sourceDir);
  const latestYmlPath = path.join(sourceDir, "latest.yml");
  await ensurePathExists(latestYmlPath);

  const latestYmlRaw = await readFile(latestYmlPath, "utf8");
  const setupFile = parseLatestArtifactFileName(latestYmlRaw);
  if (!setupFile) {
    throw new Error("latest.yml icinden setup dosya adi cozumlenemedi (path alani eksik).");
  }

  const artifactFiles = ["latest.yml", setupFile, `${setupFile}.blockmap`];
  for (const fileName of artifactFiles) {
    await ensurePathExists(path.join(sourceDir, fileName));
  }
  const optionalArtifacts = ["latest.json"];
  for (const fileName of optionalArtifacts) {
    if (existsSync(path.join(sourceDir, fileName))) {
      artifactFiles.push(fileName);
    }
  }

  const transport = createTransport(parsed);

  console.log(`[catwa] Electron publish basliyor (${channel})`);
  console.log(`[catwa] Kaynak: ${sourceDir}`);
  console.log(`[catwa] Hedef: ${remote}:${remoteChannelDir}`);
  if (parsed.password.trim()) {
    console.log("[catwa] Password-auth modu: aktif");
  }

  await transport.runRemoteCommand(remote, `mkdir -p ${shellQuote(remoteChannelDir)}`, { dryRun: parsed.dryRun });

  for (const fileName of artifactFiles) {
    const localFile = path.join(sourceDir, fileName);
    await transport.uploadFile(localFile, remote, remoteChannelDir, { dryRun: parsed.dryRun });
  }

  const aliasFileNames = ["Catwa_Latest_x64_Setup.exe", "Catwa_Installer_x64.exe", "Catwa_0.1.15_x64-setup.exe"];
  const symlinkCommands = aliasFileNames
    .filter((aliasName) => aliasName !== setupFile)
    .map((aliasName) => `ln -sfn ${shellQuote(setupFile)} ${shellQuote(path.posix.join(remoteChannelDir, aliasName))}`);
  if (symlinkCommands.length > 0) {
    await transport.runRemoteCommand(remote, symlinkCommands.join(" && "), { dryRun: parsed.dryRun });
  }

  if (parsed.chown.trim()) {
    const chownScript = `chown -R ${shellQuote(parsed.chown.trim())} ${shellQuote(remoteChannelDir)}`;
    await transport.runRemoteCommand(remote, chownScript, { dryRun: parsed.dryRun });
  }

  console.log(`[catwa] Publish tamamlandi. ${artifactFiles.length} dosya yuklendi.`);
}

main().catch((error) => {
  console.error(`[catwa] Publish basarisiz: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
