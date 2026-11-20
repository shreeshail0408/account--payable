import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; the Pages workflow sets VITE_BASE. Local dev stays at /.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  // Dev only: forward API and uploaded-file requests to Django so the app works from any device
  // that can reach this dev server (e.g. http://<your-PC-IP>:5173 on a phone). The Host header is
  // kept, so file URLs Django returns point back through this proxy.
  server: {
    proxy: {
      "/api": { target: process.env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000", xfwd: true },
      "/media": { target: process.env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000", xfwd: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
