import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function stampServiceWorkerVersion(): Plugin {
  let outDir = "dist";
  return {
    name: "stamp-service-worker-version",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const swPath = resolve(outDir, "sw.js");
      const source = readFileSync(swPath, "utf8");
      const version = new Date().toISOString().replace(/[-:.TZ]/g, "");
      writeFileSync(swPath, source.replaceAll("__BUILD_VERSION__", version));
    },
  };
}

export default defineConfig({
  base: "/manga-shelf/",
  server: { port: Number(process.env.PORT) || 5173 },
  plugins: [react(), stampServiceWorkerVersion()],
});
