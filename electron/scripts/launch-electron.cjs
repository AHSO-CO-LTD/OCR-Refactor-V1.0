const { spawn } = require("node:child_process");
const electronPath = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.AHSO_ELECTRON_SKIP_ADMIN_RELAUNCH ??= "1";
env.BACKEND_PORT ??= "3979";
env.FRONTEND_PORT ??= "3969";

const child = spawn(electronPath, ["."], {
  cwd: require("node:path").resolve(__dirname, ".."),
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.once("error", (error) => {
  console.error("Failed to launch Electron", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 0;
});
