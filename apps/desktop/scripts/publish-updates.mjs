import { access, constants, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHANNELS = ["stable"];

function printUsage() {
  console.log(`
[catwa] publish-updates

Usage:
  npm run publish:updates -- --host 109.236.48.161 --user root
  npm run publish:updates -- --channel stable --host 109.236.48.161 --user root
  npm run publish:updates -- --dry-run --host 109.236.48.161 --user root

Options:
  --channel <stable|all>                Default: all
  --host <hostname_or_ip>              Required (or CATWA_PUBLISH_HOST)
  --user <ssh_user>                    Default: root (or CATWA_PUBLISH_USER)
  --base-dir <remote_dir>              Default: /var/www/html (or CATWA_PUBLISH_BASE_DIR)
  --source-dir <local_dir>             Default: <repo>/release/updates (or CATWA_PUBLISH_SOURCE_DIR)
  --port <ssh_port>                    Optional (or CATWA_PUBLISH_PORT)
  --identity-file <path>               Optional SSH key file (or CATWA_PUBLISH_IDENTITY_FILE)
  --chown <user:group>                 Optional post-publish chown (or CATWA_PUBLISH_CHOWN)
  --no-legacy-mirror                   Do not mirror to /<channel> and /releases/<channel>
  --dry-run                            Print commands only
  --help                               Show this help
`);
}

function parseChannels(input) {
  if (!input || input === "all") {
    return [...CHANNELS];
  }

  const items = input
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (items.length === 0) {
    return [...CHANNELS];
  }

  const invalid = items.filter((item) => !CHANNELS.includes(item));
  if (invalid.length > 0) {
    throw new Error(`Geçersiz channel: ${invalid.join(", ")}`);
  }

  return Array.from(new Set(items));
}

function parseArgs(argv) {
  const options = {
    channelsRaw: process.env.CATWA_PUBLISH_CHANNEL ?? "all",
    host: process.env.CATWA_PUBLISH_HOST ?? "",
    user: process.env.CATWA_PUBLISH_USER ?? "root",
    baseDir: process.env.CATWA_PUBLISH_BASE_DIR ?? "/var/www/html",
    sourceDir: process.env.CATWA_PUBLISH_SOURCE_DIR ?? "",
    port: process.env.CATWA_PUBLISH_PORT ?? "",
    identityFile: process.env.CATWA_PUBLISH_IDENTITY_FILE ?? "",
    chown: process.env.CATWA_PUBLISH_CHOWN ?? "",
    legacyMirror: true,
    dryRun: false
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
    if (current === "--no-legacy-mirror") {
      options.legacyMirror = false;
      continue;
    }
    if (current === "--channel" && next) {
      options.channelsRaw = next;
      index += 1;
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

    throw new Error(`Bilinmeyen argüman: ${current}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const dryRun = options.dryRun === true;
  const cwd = options.cwd;
  const printable = `${command} ${args.join(" ")}`.trim();

  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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
  return `'${input.replace(/'/g, `'\"'\"'`)}'`;
}

async function ensurePathExists(filePath) {
  await access(filePath, constants.F_OK);
}

async function collectFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(full);
      files.push(...nested.map((item) => path.join(entry.name, item)));
      continue;
    }
    files.push(entry.name);
  }

  return files;
}

function toPosixPath(input) {
  return input.split(path.sep).join(path.posix.sep);
}

function buildSSHArgs(options) {
  const args = [];
  if (options.port) {
    args.push("-p", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  return args;
}

function buildSCPArgs(options) {
  const args = [];
  if (options.port) {
    args.push("-P", options.port);
  }
  if (options.identityFile) {
    args.push("-i", options.identityFile);
  }
  return args;
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
  const defaultSourceDir = path.resolve(scriptDir, "..", "..", "..", "release", "updates");
  const sourceDir = parsed.sourceDir.trim() ? path.resolve(parsed.sourceDir.trim()) : defaultSourceDir;
  const channels = parseChannels(parsed.channelsRaw.trim().toLowerCase());
  const remote = `${parsed.user}@${parsed.host}`;
  const baseDir = parsed.baseDir.replace(/\/+$/, "");
  const sshCommonArgs = buildSSHArgs(parsed);
  const scpCommonArgs = buildSCPArgs(parsed);

  await ensurePathExists(sourceDir);
  await ensurePathExists(path.join(sourceDir, "channels.json"));

  console.log(`[catwa] Publish başlıyor (${channels.join(", ")})`);
  console.log(`[catwa] Kaynak: ${sourceDir}`);
  console.log(`[catwa] Hedef: ${remote}:${baseDir}`);

  for (const channel of channels) {
    const localChannelDir = path.join(sourceDir, channel);
    await ensurePathExists(localChannelDir);
    await ensurePathExists(path.join(localChannelDir, "latest.json"));

    const files = await collectFiles(localChannelDir);
    if (files.length === 0) {
      throw new Error(`${channel} için yayınlanacak dosya bulunamadı: ${localChannelDir}`);
    }

    const remoteBases = [`${baseDir}/updates/${channel}`];
    if (parsed.legacyMirror) {
      remoteBases.push(`${baseDir}/${channel}`, `${baseDir}/releases/${channel}`);
    }

    const remoteDirs = new Set();
    for (const remoteBase of remoteBases) {
      remoteDirs.add(remoteBase);
      for (const relative of files) {
        const relativePosix = toPosixPath(relative);
        const parent = path.posix.dirname(relativePosix);
        if (parent !== ".") {
          remoteDirs.add(path.posix.join(remoteBase, parent));
        }
      }
    }

    const mkdirScript = `mkdir -p ${Array.from(remoteDirs).map(shellQuote).join(" ")}`;
    await run("ssh", [...sshCommonArgs, remote, mkdirScript], { dryRun: parsed.dryRun });

    for (const relative of files) {
      const localFile = path.join(localChannelDir, relative);
      const relativePosix = toPosixPath(relative);
      for (const remoteBase of remoteBases) {
        const remotePath = path.posix.join(remoteBase, relativePosix);
        await run("scp", [...scpCommonArgs, localFile, `${remote}:${remotePath}`], { dryRun: parsed.dryRun });
      }
    }

    console.log(`[catwa] ${channel} yayınlandı (${files.length} dosya).`);
  }

  const channelsJsonPath = path.join(sourceDir, "channels.json");
  const channelsTargets = [`${baseDir}/updates/channels.json`];
  if (parsed.legacyMirror) {
    channelsTargets.push(`${baseDir}/channels.json`);
  }

  const channelsDirScript = `mkdir -p ${Array.from(new Set(channelsTargets.map((item) => path.posix.dirname(item)))).map(shellQuote).join(" ")}`;
  await run("ssh", [...sshCommonArgs, remote, channelsDirScript], { dryRun: parsed.dryRun });

  for (const target of channelsTargets) {
    await run("scp", [...scpCommonArgs, channelsJsonPath, `${remote}:${target}`], { dryRun: parsed.dryRun });
  }

  if (parsed.chown.trim()) {
    const chownTargets = [`${baseDir}/updates`, ...channels.map((item) => `${baseDir}/${item}`), `${baseDir}/releases`];
    const chownScript = `chown -R ${shellQuote(parsed.chown.trim())} ${chownTargets.map(shellQuote).join(" ")}`;
    await run("ssh", [...sshCommonArgs, remote, chownScript], { dryRun: parsed.dryRun });
  }

  console.log("[catwa] Publish tamamlandı.");
}

main().catch((error) => {
  console.error(`[catwa] Publish başarısız: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
