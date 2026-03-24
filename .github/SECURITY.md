# Security Policy

## Supported Branches

- `main`: actively maintained

## Reporting a Vulnerability

Do not open public issues for security problems.

Use one of these channels:

1. Email: `azizemirr@users.noreply.github.com`
2. Private message to repository owner (`azizemirr`)

When reporting, include:

- Affected component (`apps/server`, `apps/desktop`, `packages/shared`)
- Reproduction steps
- Impact and expected risk
- Suggested fix (if available)

## Response Targets

- Initial acknowledgement: within 72 hours
- Triage decision: within 7 days
- Patch release for confirmed critical issues: as soon as possible

## Security Baseline in This Repo

- Secret scanning in CI (`.github/workflows/security.yml`)
- Go vulnerability scanning (`govulncheck`)
- Static analysis (`gosec`)
- Local secret files ignored by git (`.env`, local dumps, temp artifacts)

