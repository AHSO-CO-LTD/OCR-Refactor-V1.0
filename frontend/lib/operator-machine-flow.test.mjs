import assert from "node:assert/strict";
import test from "node:test";
import {
  areMachineControlsLocked,
  areRuntimeControlsActive,
  canStartPendingProductSession,
  isCameraRecoveryInProgress,
  isPlcStopAwaitingStart,
} from "./operator-machine-flow.ts";

test("PLC STOP remains active until the runtime leaves its stop states", () => {
  assert.equal(isPlcStopAwaitingStart("stopping", "machine_stop"), true);
  assert.equal(
    isPlcStopAwaitingStart("idle_machine_stop", "machine_stop"),
    true,
  );
  assert.equal(isPlcStopAwaitingStart("resuming", "machine_stop"), false);
  assert.equal(isPlcStopAwaitingStart("running", null), false);
});

test("runtime controls are active only while the machine is actually running", () => {
  assert.equal(areRuntimeControlsActive("running"), true);
  assert.equal(areRuntimeControlsActive("inactive"), false);
  assert.equal(areRuntimeControlsActive("waiting_camera"), false);
  assert.equal(areRuntimeControlsActive("idle_machine_stop"), false);
});

test("machine controls stay locked through STOP and camera recovery", () => {
  assert.equal(areMachineControlsLocked("stopping"), true);
  assert.equal(areMachineControlsLocked("idle_machine_stop"), true);
  assert.equal(areMachineControlsLocked("resuming"), true);
  assert.equal(areMachineControlsLocked("waiting_camera"), true);
  assert.equal(areMachineControlsLocked("running"), false);
  assert.equal(areMachineControlsLocked("inactive"), false);
});

test("camera recovery states override stale preview connection warnings", () => {
  assert.equal(isCameraRecoveryInProgress("resuming"), true);
  assert.equal(isCameraRecoveryInProgress("waiting_camera"), true);
  assert.equal(isCameraRecoveryInProgress("idle_machine_stop"), false);
  assert.equal(isCameraRecoveryInProgress("running"), false);
  assert.equal(isCameraRecoveryInProgress("error"), false);
});

test("a pending product session starts only after PLC START begins recovery", () => {
  assert.equal(canStartPendingProductSession("idle_machine_stop"), false);
  assert.equal(canStartPendingProductSession("resuming"), true);
  assert.equal(canStartPendingProductSession("waiting_camera"), true);
  assert.equal(canStartPendingProductSession("running"), true);
});
