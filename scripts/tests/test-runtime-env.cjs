const assert = require("node:assert/strict");
const { resolve } = require("node:path");

process.env.TS_NODE_PROJECT = resolve(__dirname, "../../electron/tsconfig.json");
require(resolve(
  __dirname,
  "../../backend/node_modules/ts-node/register/transpile-only.js",
));

const {
  getRuntimeEnvValidationError,
  parseRuntimeEnvFile,
  shouldTreatBlankRuntimeEnvValueAsMissing,
  updateRuntimeEnvContent,
} = require("../../electron/src/runtime-env.ts");

for (const separator of ["\r\n", "\n", "\r"]) {
  const parsed = parseRuntimeEnvFile(
    [
      "BACKEND_PORT=3980",
      "DONGIL_MACHINE_TYPE_CODE=WASHING_MACHINE",
      "DONGIL_SERVER_URL=http://192.168.3.79:3979",
    ].join(separator),
  );
  assert.equal(parsed.values.BACKEND_PORT, "3980");
  assert.equal(parsed.values.DONGIL_MACHINE_TYPE_CODE, "WASHING_MACHINE");
  assert.equal(
    parsed.values.DONGIL_SERVER_URL,
    "http://192.168.3.79:3979",
  );
}

const edgeCases = parseRuntimeEnvFile(
  "\uFEFF# comment\rONLY_KEY\rINVALID-KEY=value\rTOKEN=a=b=c\rPORT=1\rPORT=2\rEMPTY=",
);
assert.deepEqual(edgeCases.duplicateKeys, ["PORT"]);
assert.deepEqual(edgeCases.issues, [
  { code: "INVALID_ASSIGNMENT", lineNumber: 2 },
  { code: "INVALID_KEY", key: "INVALID-KEY", lineNumber: 3 },
]);
assert.equal(edgeCases.values.TOKEN, "a=b=c");
assert.equal(edgeCases.values.PORT, "2");
assert.equal(edgeCases.values.EMPTY, "");

const updated = updateRuntimeEnvContent(
  "BACKEND_PORT=3000\nBACKEND_PORT=3001\nKEEP=value",
  { BACKEND_PORT: "3980", NEW_KEY: "new-value" },
);
assert.equal(
  updated,
  "BACKEND_PORT=3980\r\nKEEP=value\r\nNEW_KEY=new-value\r\n",
);
assert.equal(shouldTreatBlankRuntimeEnvValueAsMissing("BACKEND_PORT", ""), true);
assert.equal(shouldTreatBlankRuntimeEnvValueAsMissing("OPTIONAL_NOTE", ""), false);
assert.equal(getRuntimeEnvValidationError("BACKEND_PORT", "65536"), "must be between 1 and 65535");
assert.equal(getRuntimeEnvValidationError("DONGLE_CHECK_TIMEOUT_MS", "0"), "must be a positive integer");
assert.equal(getRuntimeEnvValidationError("DONGIL_MACHINE_TYPE_CODE", "WASHING_MACHINE"), null);
assert.equal(
  getRuntimeEnvValidationError(
    "DONGIL_SERVER_URL",
    "http://user:password@192.168.3.79:3979",
  ),
  "must not contain user information",
);

process.stdout.write("Electron runtime env tests passed.\n");
