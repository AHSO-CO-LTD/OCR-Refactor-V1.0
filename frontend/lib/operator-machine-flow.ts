import type { MachineRuntimeStatus } from "./api";

export function isPlcStopAwaitingStart(
  state: MachineRuntimeStatus["state"],
  idleReason: MachineRuntimeStatus["idleReason"],
) {
  return (
    idleReason === "machine_stop" &&
    (state === "stopping" || state === "idle_machine_stop")
  );
}

export function areRuntimeControlsActive(
  state: MachineRuntimeStatus["state"],
) {
  return state === "running";
}

export function areMachineControlsLocked(
  state: MachineRuntimeStatus["state"],
) {
  return (
    state === "stopping" ||
    state === "idle_machine_stop" ||
    state === "resuming" ||
    state === "waiting_camera"
  );
}

export function isCameraRecoveryInProgress(
  state: MachineRuntimeStatus["state"],
) {
  return state === "resuming" || state === "waiting_camera";
}

export function canStartPendingProductSession(
  state: MachineRuntimeStatus["state"],
) {
  return (
    state === "resuming" || state === "waiting_camera" || state === "running"
  );
}
