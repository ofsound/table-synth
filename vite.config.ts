import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const certDir = path.resolve(".cert");
const certPath = path.join(certDir, "table-synth-local-server.cert.pem");
const keyPath = path.join(certDir, "table-synth-local-server.key.pem");
const hasLocalCert = fs.existsSync(certPath) && fs.existsSync(keyPath);

export default defineConfig({
  plugins: [react(), !hasLocalCert && basicSsl()].filter(Boolean),
  server: {
    host: "0.0.0.0",
    port: 5173,
    https: hasLocalCert
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        }
      : undefined
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    https: hasLocalCert
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        }
      : undefined
  },
  test: {
    environment: "node"
  }
});
