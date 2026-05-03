import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export type TlsMaterial = {
  cert: Buffer;
  key: Buffer;
  certPath: string;
  keyPath: string;
};

const certDir = path.resolve(".cert");
const defaultCertPath = path.join(certDir, "table-synth-local-server.cert.pem");
const defaultKeyPath = path.join(certDir, "table-synth-local-server.key.pem");

function ensureGeneratedCert(certPath: string, keyPath: string): void {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }

  execFileSync(process.execPath, ["scripts/generate-certs.mjs"], { stdio: "inherit" });
}

export function loadTlsMaterial(): TlsMaterial {
  const certPath = process.env.TABLE_SYNTH_TLS_CERT || defaultCertPath;
  const keyPath = process.env.TABLE_SYNTH_TLS_KEY || defaultKeyPath;
  ensureGeneratedCert(certPath, keyPath);

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    certPath,
    keyPath
  };
}
