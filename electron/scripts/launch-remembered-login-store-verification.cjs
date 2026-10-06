const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(
  electronPath,
  [resolve(__dirname, "verify-remembered-login-store.cjs")],
  {
    cwd: resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
