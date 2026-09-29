import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Framework code changes rarely, so it gets its own long-cached chunk.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) return "vendor-axios";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Lets the dev server talk to FastAPI without CORS surprises.
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/ws": { target: "http://127.0.0.1:8000", ws: true, changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
