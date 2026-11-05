/**
 * Hardware Fingerprint Generator for Device-Locked Licensing
 *
 * Generates a stable, unique device ID from:
 *   - CPU brand + logical core count
 *   - Primary network adapter MAC address
 *   - OS drive volume serial number (Windows)
 *   - Platform + architecture
 *
 * The fingerprint is hashed with SHA-256 so it is stable across reboots
 * but cannot be used to reconstruct the original hardware values.
 */

import os from "os";
import crypto from "crypto";
import { execSync } from "child_process";

// ─── Raw Component Getters ─────────────────────────────────────────────────────

function getCpuInfo(): string {
  try {
    const cpus = os.cpus();
    const brand = cpus[0]?.model ?? "unknown-cpu";
    return `${brand}:${cpus.length}`;
  } catch {
    return "cpu-unknown";
  }
}

function getPrimaryMac(): string {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const iface = ifaces[name];
      if (!iface) continue;
      for (const entry of iface) {
        if (!entry.internal && entry.mac && entry.mac !== "00:00:00:00:00:00") {
          return entry.mac.toLowerCase();
        }
      }
    }
  } catch {
    // ignore
  }
  return "mac-unknown";
}

function getWindowsVolumeSerial(): string {
  if (process.platform !== "win32") return "non-windows";
  try {
    const result = execSync(
      `powershell -NonInteractive -Command "(Get-WmiObject Win32_LogicalDisk -Filter \\"DriveType=3\\" | Where-Object {$_.DeviceID -eq 'C:'}).VolumeSerialNumber"`,
      { encoding: "utf8", timeout: 5000 }
    );
    return (result || "").trim() || "vol-unknown";
  } catch {
    try {
      // Fallback: use vol command
      const vol = execSync("vol C:", { encoding: "utf8", timeout: 5000 });
      const match = vol.match(/Serial Number is\s+([0-9A-F-]+)/i);
      return match ? match[1].replace(/-/g, "") : "vol-fallback";
    } catch {
      return "vol-error";
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a stable SHA-256 hardware fingerprint (hex, 64 chars).
 * The same machine will produce the same fingerprint across reboots.
 */
export function getHardwareFingerprint(): string {
  const components = [
    process.platform,
    process.arch,
    getCpuInfo(),
    getPrimaryMac(),
    getWindowsVolumeSerial(),
  ].join("|");

  return crypto.createHash("sha256").update(components).digest("hex");
}

/**
 * Returns a short (12-char) machine ID suitable for display to customers.
 * This is NOT used for signing – only for display in UI and admin panel.
 */
export function getDisplayMachineId(): string {
  return getHardwareFingerprint().slice(0, 12).toUpperCase();
}
