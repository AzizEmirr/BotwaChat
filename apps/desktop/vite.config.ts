import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const packageJSONPath = path.join(rootDir, "package.json");
const packageVersion =
  JSON.parse(readFileSync(packageJSONPath, "utf8") as string)?.version?.toString?.().trim?.() || "0.0.0";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Absolute asset paths prevent white screen on hard refresh at nested SPA routes.
  base: "/",
  define: {
    __CATWA_APP_VERSION__: JSON.stringify(packageVersion)
  },
  build: {
    // Keep older hashed assets to avoid temporary blank screens when clients
    // still have a cached previous index.html.
    emptyOutDir: false
  },
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true
  }
});
