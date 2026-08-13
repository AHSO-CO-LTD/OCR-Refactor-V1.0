// machineId.js — Sinh Machine ID cho app Electron.
// Machine ID = SMBIOS System UUID (mainboard), fallback MachineGuid khi rác.
// Cần: npm i systeminformation
//
// Lưu ý: đọc UUID nên chạy trong main process (Node), không phải renderer.

const crypto = require("crypto");
const fs = require("fs");
const si = require("systeminformation");
const { execSync } = require("child_process");

const GARBAGE_UUIDS = new Set([
  "",
  "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
  "00000000-0000-0000-0000-000000000000",
  "03000200-0400-0500-0006-000700080009", // default UUID trùng lặp nổi tiếng
  "NOT SETTINGS",
]);

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readMachineGuidWindows() {
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { windowsHide: true }
    ).toString();
    const m = out.match(/MachineGuid\s+REG_SZ\s+([A-Za-z0-9-]+)/);
    return m ? m[1].toUpperCase().trim() : "";
  } catch {
    return "";
  }
}

function readPlatformUUIDMac() {
  try {
    const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice").toString();
    const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    return m ? m[1].toUpperCase().trim() : "";
  } catch {
    return "";
  }
}

function readMachineIdLinux() {
  // Thứ tự PHẢI khớp _linux_machine_id() trong python/license_client.py:
  // product_uuid (gắn mainboard) trước, rồi mới tới machine-id (gắn OS image,
  // dễ trùng giữa các máy clone từ cùng template/container).
  for (const p of [
    "/sys/class/dmi/id/product_uuid",
    "/etc/machine-id",
    "/var/lib/dbus/machine-id",
  ]) {
    try {
      const v = fs.readFileSync(p, "utf8").trim();
      if (v) return v.toUpperCase();
    } catch {
      // thử file tiếp theo
    }
  }
  return "";
}

async function getMachineId() {
  let uuid = "";
  try {
    const u = await si.uuid(); // { hardware: SMBIOS System UUID, ... }
    uuid = (u.hardware || "").toUpperCase().trim();
  } catch {
    uuid = "";
  }

  // Fallback khi UUID rác/trùng — áp dụng cho mọi OS, không chỉ Windows,
  // vì máy ảo/clone macOS và Linux cũng có thể trả UUID SMBIOS mặc định trùng nhau.
  if (GARBAGE_UUIDS.has(uuid) || !uuid) {
    if (process.platform === "win32") {
      uuid = readMachineGuidWindows();
    } else if (process.platform === "darwin") {
      uuid = readPlatformUUIDMac();
    } else {
      uuid = readMachineIdLinux();
    }
  }

  const src = (uuid || "UNKNOWN-HARDWARE").toUpperCase().trim();
  const hex = sha256(src).slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g).join("-"); // XXXX-XXXX-XXXX-XXXX
}

module.exports = { getMachineId };

// Chạy thử: node machineId.js
if (require.main === module) {
  getMachineId().then((id) => console.log("Machine ID máy này:", id));
}
