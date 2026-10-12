const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { app, safeStorage } = require("electron");

const testRoot = resolve(
  tmpdir(),
  `ahso-remembered-login-store-${process.pid}`,
);
const expectedPrefix = "ahso-remembered-login-store-";

if (
  resolve(testRoot) === resolve(tmpdir()) ||
  !basename(testRoot).startsWith(expectedPrefix)
) {
  throw new Error("Refusing to use an unsafe remembered-login test directory");
}

mkdirSync(testRoot, { recursive: true });
app.setPath("userData", testRoot);

app
  .whenReady()
  .then(() => {
    if (process.platform !== "win32") {
      throw new Error("This verification harness requires Windows");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows safeStorage encryption is unavailable");
    }

    const staleTemporaryPath = join(testRoot, "remembered-login.json.tmp");
    writeFileSync(staleTemporaryPath, "{}", "utf8");
    const legacyAcl = spawnSync(
      "icacls.exe",
      [
        staleTemporaryPath,
        "/inheritance:r",
        "/grant:r",
        "*S-1-5-32-544:F",
        "*S-1-5-18:F",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (legacyAcl.status !== 0) {
      throw new Error("Could not prepare the legacy ACL test artifact");
    }

    const store = require("../dist/auth/remembered-login-store.js");
    const testToken = "phase9c-local-safe-storage-verification-token";
    store.saveRememberedLogin(testToken);
    const loaded = store.loadRememberedLogin();
    if (
      loaded.status !== "REMEMBER_TOKEN_LOADED" ||
      loaded.token !== testToken
    ) {
      throw new Error("Remembered-login token did not round-trip");
    }

    const credentialPath = join(testRoot, "remembered-login.json");
    if (!existsSync(credentialPath) || existsSync(staleTemporaryPath)) {
      throw new Error("Remembered-login artifact state is invalid after save");
    }

    store.clearRememberedLogin();
    if (
      existsSync(credentialPath) ||
      existsSync(staleTemporaryPath) ||
      existsSync(`${credentialPath}.bak`)
    ) {
      throw new Error("Remembered-login artifacts were not cleared");
    }

    process.stdout.write(
      `${JSON.stringify({
        safeStorageAvailable: true,
        legacyTemporaryFileRecovered: true,
        encryptedTokenRoundTrip: true,
        cleanupComplete: true,
      })}\n`,
    );
  })
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(testRoot, { force: true, recursive: true });
    } finally {
      app.quit();
    }
  });
