import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";

const certDir = path.resolve(".cert");
const caCertPath = path.join(certDir, "table-synth-local-ca.cert.pem");
const caKeyPath = path.join(certDir, "table-synth-local-ca.key.pem");
const certPath = path.join(certDir, "table-synth-local-server.cert.pem");
const keyPath = path.join(certDir, "table-synth-local-server.key.pem");

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

if (fs.existsSync(caCertPath) && fs.existsSync(caKeyPath) && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log(`Local TLS cert already exists in ${certDir}`);
  process.exit(0);
}

const hosts = new Set(["localhost", "127.0.0.1", "::1", os.hostname()]);
for (const network of Object.values(os.networkInterfaces())) {
  for (const address of network ?? []) {
    if (!address.internal) {
      hosts.add(address.address);
    }
  }
}

function serialNumber() {
  const hex = forge.util.bytesToHex(forge.random.getBytesSync(16));
  return hex[0] < "8" ? hex : `0${hex.slice(1)}`;
}

function validity(days) {
  const notBefore = new Date();
  notBefore.setDate(notBefore.getDate() - 1);
  const notAfter = new Date(notBefore);
  notAfter.setDate(notAfter.getDate() + days);
  return { notBefore, notAfter };
}

function subject(commonName) {
  return [
    { name: "commonName", value: commonName },
    { name: "organizationName", value: "Table Synth" }
  ];
}

const caKeys = forge.pki.rsa.generateKeyPair(2048);
const caCert = forge.pki.createCertificate();
caCert.serialNumber = serialNumber();
caCert.publicKey = caKeys.publicKey;
caCert.validity = validity(3650);
caCert.setSubject(subject("Table Synth Local CA"));
caCert.setIssuer(subject("Table Synth Local CA"));
caCert.setExtensions([
  { name: "basicConstraints", cA: true, critical: true },
  { name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
  { name: "subjectKeyIdentifier" }
]);
caCert.sign(caKeys.privateKey, forge.md.sha256.create());

const serverKeys = forge.pki.rsa.generateKeyPair(2048);
const serverCert = forge.pki.createCertificate();
serverCert.serialNumber = serialNumber();
serverCert.publicKey = serverKeys.publicKey;
serverCert.validity = validity(365);
serverCert.setSubject(subject("Table Synth Local Server"));
serverCert.setIssuer(caCert.subject.attributes);
serverCert.setExtensions([
  { name: "basicConstraints", cA: false, critical: true },
  { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
  { name: "extKeyUsage", serverAuth: true },
  {
    name: "subjectAltName",
    altNames: [...hosts].map((host) =>
      host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host) ? { type: 7, ip: host } : { type: 2, value: host }
    )
  }
]);
serverCert.sign(caKeys.privateKey, forge.md.sha256.create());

fs.writeFileSync(caCertPath, forge.pki.certificateToPem(caCert));
fs.writeFileSync(caKeyPath, forge.pki.privateKeyToPem(caKeys.privateKey));
fs.writeFileSync(certPath, forge.pki.certificateToPem(serverCert));
fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(serverKeys.privateKey));

console.log(`Wrote ${caCertPath}`);
console.log(`Wrote ${caKeyPath}`);
console.log(`Wrote ${certPath}`);
console.log(`Wrote ${keyPath}`);
console.log("Install and fully trust the CA cert on the iPhone before using HTTPS/WSS from Safari.");
