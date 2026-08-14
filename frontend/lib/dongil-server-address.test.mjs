import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDongilServerUrl,
  getDongilServerIp,
  normalizeDongilServerIp,
} from "./dongil-server-address.ts";

test("normalizes a valid Dongil Server IPv4 address", () => {
  assert.equal(normalizeDongilServerIp(" 192.168.003.004 "), "192.168.3.4");
  assert.equal(normalizeDongilServerIp("256.168.3.4"), null);
  assert.equal(normalizeDongilServerIp("http://192.168.3.4"), null);
});

test("builds the fixed pilot server URL from only an IP", () => {
  assert.equal(
    buildDongilServerUrl("192.168.3.4"),
    "http://192.168.3.4:3979",
  );
});

test("extracts the IP from an existing saved server URL", () => {
  assert.equal(
    getDongilServerIp("http://192.168.3.4:3979"),
    "192.168.3.4",
  );
});
