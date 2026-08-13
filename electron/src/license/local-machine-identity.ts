import { createRequire } from "node:module";
import path from "node:path";

type MachineIdSdk = {
  getMachineId: () => Promise<string>;
};

export type LocalMachineIdentity = {
  machineId: string;
  licenseStatus: "LICENSED";
};

const runtimeRequire = createRequire(__filename);
let cachedSdk: MachineIdSdk | null = null;

function getSdk() {
  if (!cachedSdk) {
    cachedSdk = runtimeRequire(
      path.join(__dirname, "..", "license-key", "electron", "machineId.js"),
    ) as MachineIdSdk;
  }
  return cachedSdk;
}

export async function getLocalMachineIdentity(): Promise<LocalMachineIdentity> {
  return {
    machineId: await getSdk().getMachineId(),
    licenseStatus: "LICENSED",
  };
}
