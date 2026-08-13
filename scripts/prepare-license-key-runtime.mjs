import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, "external", "license-key", "electron");
const targetRoot = path.join(repoRoot, "electron", "dist", "license-key", "electron");
const runtimeFiles = ["machineId.js"];

if (!fs.existsSync(sourceRoot)) {
  throw new Error("Read-only License-Key runtime was not found under external/license-key/electron");
}

fs.rmSync(path.dirname(targetRoot), { recursive: true, force: true });
fs.mkdirSync(targetRoot, { recursive: true });

for (const fileName of runtimeFiles) {
  const sourceFile = path.join(sourceRoot, fileName);
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`License-Key runtime file is missing: ${fileName}`);
  }
  fs.copyFileSync(sourceFile, path.join(targetRoot, fileName));
}

console.log(`[license] Prepared ${runtimeFiles.length} read-only runtime files`);
