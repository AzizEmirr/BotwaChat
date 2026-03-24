import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseChannel(argv) {
  const channel = (argv[2] ?? "stable").trim().toLowerCase();
  if (channel !== "stable") {
    throw new Error(`Geçersiz release channel: ${channel}. Bu projede sadece stable destekleniyor.`);
  }
  return channel;
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
            cwd,
            env,
            stdio: "inherit",
            shell: false
          })
        : spawn(command, args, {
            cwd,
            env,
            stdio: "inherit",
            shell: false
          });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} komutu ${code} koduyla bitti.`));
      }
    });
  });
}

async function resolveSigningKeyValue(desktopRoot) {
  const explicitPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH?.trim();
  if (!explicitPath) {
    return null;
  }

  const localKeyPath = path.isAbsolute(explicitPath) ? explicitPath : path.join(desktopRoot, explicitPath);
  try {
    const raw = await readFile(localKeyPath, "utf8");
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

async function main() {
  const channel = parseChannel(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const desktopRoot = path.resolve(scriptDir, "..");
  const releaseConfigPath = "src-tauri/config/release.stable.json";

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const mergedEnv = {
    ...process.env
  };

  if (!mergedEnv.TAURI_SIGNING_PRIVATE_KEY) {
    const fileKeyValue = await resolveSigningKeyValue(desktopRoot);
    if (fileKeyValue) {
      mergedEnv.TAURI_SIGNING_PRIVATE_KEY = fileKeyValue;
      console.log("[catwa] İmza anahtarı TAURI_SIGNING_PRIVATE_KEY_PATH dosyasından yüklendi.");
    } else {
      console.warn(
        "[catwa] Uyarı: TAURI_SIGNING_PRIVATE_KEY veya TAURI_SIGNING_PRIVATE_KEY_PATH tanımlı değil. createUpdaterArtifacts adımı imza gerektirdiği için build başarısız olabilir."
      );
    }
  }

  console.log(`[catwa] ${channel} release build başlatılıyor...`);
  await run(npmCmd, ["run", "tauri:build", "--", "--config", releaseConfigPath], desktopRoot, mergedEnv);

  console.log("[catwa] updater manifest hazırlanıyor...");
  const manifestEnv = { ...mergedEnv };
  delete manifestEnv.TAURI_SIGNING_PRIVATE_KEY;
  delete manifestEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  const nodeCmd = process.platform === "win32" ? "node.exe" : "node";
  await run(nodeCmd, [path.join(scriptDir, "generate-update-manifest.mjs"), channel], desktopRoot, {
    ...manifestEnv,
    CATWA_RELEASE_CHANNEL: channel
  });

  console.log(`[catwa] ${channel} release hazır.`);
}

main().catch((error) => {
  console.error(`[catwa] release build başarısız: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

