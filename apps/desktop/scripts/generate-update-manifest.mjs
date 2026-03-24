import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function normalizeChannel(input) {
  const value = (input ?? process.env.CATWA_RELEASE_CHANNEL ?? "stable").trim().toLowerCase();
  if (value !== "stable") {
    throw new Error(`Geçersiz channel: ${value}. Bu projede sadece stable destekleniyor.`);
  }
  return value;
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}

function preferUpdaterArtifact(leftPath, rightPath) {
  const score = (filePath) => {
    const lower = filePath.toLowerCase();
    if (lower.endsWith("-setup.exe") || (lower.endsWith(".exe") && lower.includes("setup"))) {
      return 0;
    }
    if (lower.endsWith(".exe")) {
      return 1;
    }
    if (lower.endsWith(".msi")) {
      return 2;
    }
    if (lower.endsWith(".app.tar.gz")) {
      return 3;
    }
    if (lower.endsWith(".appimage.tar.gz")) {
      return 4;
    }
    if (lower.endsWith(".deb.tar.gz")) {
      return 5;
    }
    if (lower.endsWith(".zip")) {
      return 6;
    }
    return 100;
  };
  return score(leftPath) - score(rightPath);
}

function resolveUpdaterPlatform() {
  if (process.platform !== "win32") {
    if (process.platform === "darwin") {
      return process.arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64";
    }
    return process.arch === "arm64" ? "linux-aarch64" : "linux-x86_64";
  }

  if (process.arch === "arm64") {
    return "windows-aarch64";
  }
  if (process.arch === "ia32") {
    return "windows-i686";
  }
  return "windows-x86_64";
}

function resolveInstallerArchSuffix() {
  if (process.arch === "arm64") {
    return "arm64";
  }
  if (process.arch === "ia32") {
    return "x86";
  }
  return "x64";
}

async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function clearDirectoryContents(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => rm(path.join(dirPath, entry.name), { recursive: true, force: true }))
  );
}

async function readJSON(jsonPath) {
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw);
}

async function writeJSON(jsonPath, payload) {
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function filterPreferredVersion(files, version) {
  const normalized = String(version ?? "").trim();
  if (!normalized) {
    return files;
  }

  const preferred = files.filter((item) => path.basename(item).includes(normalized));
  return preferred.length > 0 ? preferred : files;
}

async function sortByNewest(paths) {
  const withStats = await Promise.all(
    paths.map(async (item) => ({
      item,
      stat: await stat(item)
    }))
  );

  withStats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || left.item.localeCompare(right.item));
  return withStats.map((entry) => entry.item);
}

async function pickInstallerFiles(bundleRoot, version) {
  const allFiles = await walkFiles(bundleRoot);
  const msiCandidates = await sortByNewest(
    filterPreferredVersion(allFiles.filter((item) => item.toLowerCase().endsWith(".msi")), version)
  );
  const exeCandidates = await sortByNewest(
    filterPreferredVersion(allFiles.filter((item) => item.toLowerCase().endsWith(".exe")), version)
  );

  return {
    msi: msiCandidates[0] ?? null,
    exe: exeCandidates.find((item) => item.toLowerCase().includes("setup")) ?? exeCandidates[0] ?? null
  };
}

function isValidUpdaterArtifact(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".exe") ||
    lower.endsWith(".msi") ||
    lower.endsWith(".app.tar.gz") ||
    lower.endsWith(".appimage.tar.gz") ||
    lower.endsWith(".deb.tar.gz") ||
    lower.endsWith(".zip")
  );
}

async function pickUpdaterArtifact(bundleRoot, version) {
  const allFiles = await walkFiles(bundleRoot);
  const signatureFiles = allFiles.filter((item) => item.toLowerCase().endsWith(".sig"));

  let pairs = signatureFiles
    .map((sigPath) => ({
      sigPath,
      artifactPath: sigPath.slice(0, -4)
    }))
    .filter((pair) => isValidUpdaterArtifact(pair.artifactPath));

  const normalized = String(version ?? "").trim();
  if (normalized) {
    const preferred = pairs.filter((pair) => path.basename(pair.artifactPath).includes(normalized));
    if (preferred.length > 0) {
      pairs = preferred;
    }
  }

  const withStats = await Promise.all(
    pairs.map(async (pair) => ({
      pair,
      stat: await stat(pair.artifactPath)
    }))
  );

  withStats.sort(
    (left, right) =>
      preferUpdaterArtifact(left.pair.artifactPath, right.pair.artifactPath) ||
      right.stat.mtimeMs - left.stat.mtimeMs ||
      left.pair.artifactPath.localeCompare(right.pair.artifactPath)
  );

  pairs = withStats.map((entry) => entry.pair);

  if (!pairs.length) {
    return null;
  }

  return pairs[0];
}

async function main() {
  const channel = normalizeChannel(process.argv[2]);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const desktopRoot = path.resolve(scriptDir, "..");
  const rootDir = path.resolve(desktopRoot, "..", "..");

  const tauriConf = await readJSON(path.join(desktopRoot, "src-tauri", "tauri.conf.json"));
  const version = String(tauriConf.version ?? "0.0.0");
  const bundleRoot = path.join(desktopRoot, "src-tauri", "target", "release", "bundle");
  const releaseChannelDir = path.join(rootDir, "release", "updates", channel);

  await ensureDirectory(releaseChannelDir);
  await clearDirectoryContents(releaseChannelDir);

  const updaterPair = await pickUpdaterArtifact(bundleRoot, version);
  if (!updaterPair) {
    throw new Error("Updater artifact bulunamadı. createUpdaterArtifacts=true ile release build alınmalı.");
  }

  const updaterFileName = path.basename(updaterPair.artifactPath);
  const updaterSigName = `${updaterFileName}.sig`;
  const updaterTargetPath = path.join(releaseChannelDir, updaterFileName);
  const updaterSigTargetPath = path.join(releaseChannelDir, updaterSigName);

  await copyFile(updaterPair.artifactPath, updaterTargetPath);
  await copyFile(updaterPair.sigPath, updaterSigTargetPath);

  const signature = (await readFile(updaterPair.sigPath, "utf8")).trim();
  const downloadBase = (process.env.CATWA_DOWNLOAD_BASE_URL ?? "https://downloads.catwa.chat").replace(/\/+$/, "");
  const updatesBase = `${downloadBase}/updates`;
  const platform = resolveUpdaterPlatform();
  const installerArch = resolveInstallerArchSuffix();

  const updaterManifest = {
    version,
    notes: `Catwa ${channel} update package`,
    pub_date: new Date().toISOString(),
    platforms: {
      [platform]: {
        signature,
        url: `${updatesBase}/${channel}/${updaterFileName}`
      }
    }
  };

  await writeJSON(path.join(releaseChannelDir, "latest.json"), updaterManifest);

  const installers = await pickInstallerFiles(bundleRoot, version);
  let primaryInstallerURL = `${updatesBase}/${channel}/${updaterFileName}`;

  if (installers.exe) {
    const normalizedExeName = `Catwa_Installer_${installerArch}.exe`;
    await copyFile(installers.exe, path.join(releaseChannelDir, normalizedExeName));
    primaryInstallerURL = `${updatesBase}/${channel}/${normalizedExeName}`;
  } else if (installers.msi) {
    const normalizedMsiName = `Catwa_Installer_${installerArch}.msi`;
    await copyFile(installers.msi, path.join(releaseChannelDir, normalizedMsiName));
    primaryInstallerURL = `${updatesBase}/${channel}/${normalizedMsiName}`;
  }

  const channelsSummaryPath = path.join(rootDir, "release", "updates", "channels.json");
  let channelsSummary = {
    stable: `${updatesBase}/stable/Catwa_Installer_x64.exe`,
    portable: `${updatesBase}/portable/Catwa_Portable_x64.zip`
  };

  try {
    const existing = await readJSON(channelsSummaryPath);
    channelsSummary = {
      ...channelsSummary,
      ...existing
    };
  } catch {
    // ignore
  }

  channelsSummary[channel] = primaryInstallerURL;
  await writeJSON(channelsSummaryPath, channelsSummary);

  console.log(`[catwa] ${channel} manifest üretildi: ${path.join(releaseChannelDir, "latest.json")}`);
}

main().catch((error) => {
  console.error(`[catwa] updater manifest üretilemedi: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});


