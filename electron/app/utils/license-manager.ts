/**
 * License Manager for Presenton Desktop – Device-Locked Licensing
 *
 * How it works:
 *  1. Owner generates an RSA-2048 key pair (private key stays on owner's server).
 *  2. Customer requests a license; owner issues a signed JWT containing the
 *     customer's hardware fingerprint, expiry (or "permanent"), and tier.
 *  3. The app verifies the JWT signature against the bundled PUBLIC key on every
 *     startup, plus optionally calls the owner's activation server for
 *     online validation.
 *  4. If the hardware fingerprint in the JWT does not match the current machine,
 *     the license is rejected.
 *
 * The private signing key NEVER leaves the owner's server.
 * Customers receive only the signed JWT (a license key string).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { app } from "electron";
import { getHardwareFingerprint, getDisplayMachineId } from "./hardware-fingerprint";
import { safeLog, safeWarn, safeError } from "./safe-console";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Owner's RSA PUBLIC key (PEM format).
 * The matching PRIVATE key is kept on the owner's license server.
 * Replace this with your actual generated public key.
 *
 * Generate your key pair:
 *   openssl genrsa -out private.pem 2048
 *   openssl rsa -in private.pem -pubout -out public.pem
 */
const OWNER_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0000PLACEHOLDER000000
REPLACE_THIS_WITH_YOUR_ACTUAL_RSA_2048_PUBLIC_KEY_IN_PEM_FORMAT_AFTER
RUNNING_OPENSSL_GENRSA_AND_OPENSSL_RSA_PUBOUT_COMMANDS_AS_DOCUMENTED
ABOVE_IN_THIS_FILE_COMMENT_BLOCK_THE_PRIVATE_KEY_STAYS_ON_YOUR_SERVER
00000000000000000000000000000000000000000000000000000000000000000000
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIDa
QIDAQAB
-----END PUBLIC KEY-----`;

/** URL of the owner's license activation server. */
const LICENSE_SERVER_URL =
  process.env.PRESENTON_LICENSE_SERVER_URL ?? "https://licenses.your-domain.com";

/** How often to re-validate the license online (ms). Set to 0 to disable. */
const ONLINE_REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export type LicenseTier = "trial" | "standard" | "professional" | "enterprise";

export type LicensePayload = {
  /** Short customer name / email */
  customer: string;
  /** Hardware fingerprint of the authorized machine */
  fingerprint: string;
  /** ISO-8601 expiry date, or "permanent" */
  expires: string;
  /** License tier */
  tier: LicenseTier;
  /** Unique license ID (UUID) for revocation */
  licenseId: string;
  /** Issued-at (Unix timestamp) */
  iat: number;
};

export type LicenseStatus =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: string };

// ─── JWT Helpers (no external dependency) ─────────────────────────────────────

function base64UrlDecode(str: string): Buffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function verifyRsaJwt(token: string, publicKeyPem: string): LicensePayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify RS256 signature
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(signingInput);

  if (!verify.verify(publicKeyPem, signature)) {
    throw new Error("Invalid license signature");
  }

  // Decode payload
  const payloadJson = base64UrlDecode(payloadB64).toString("utf8");
  return JSON.parse(payloadJson) as LicensePayload;
}

// ─── LicenseManager ───────────────────────────────────────────────────────────

export class LicenseManager {
  private licenseFilePath: string;
  private cachedStatus: LicenseStatus | null = null;
  private revalidationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(appDataDir: string) {
    this.licenseFilePath = path.join(appDataDir, "license.jwt");
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Returns the current machine's hardware fingerprint for display. */
  getMachineId(): string {
    return getDisplayMachineId();
  }

  /** Returns the raw hardware fingerprint (SHA-256 hex). */
  getFingerprint(): string {
    return getHardwareFingerprint();
  }

  /**
   * Load and validate the saved license (if any).
   * Returns the current license status.
   */
  checkLicense(): LicenseStatus {
    if (!fs.existsSync(this.licenseFilePath)) {
      return { valid: false, reason: "No license file found" };
    }

    let token: string;
    try {
      token = fs.readFileSync(this.licenseFilePath, "utf8").trim();
    } catch (err) {
      return { valid: false, reason: `Cannot read license file: ${String(err)}` };
    }

    return this.validateToken(token);
  }

  /**
   * Activate the app with a license key string (JWT).
   * Saves the license if valid for this machine.
   */
  activateLicense(licenseKey: string): LicenseStatus {
    const status = this.validateToken(licenseKey.trim());
    if (status.valid) {
      fs.writeFileSync(this.licenseFilePath, licenseKey.trim(), "utf8");
      this.cachedStatus = status;
      safeLog("[License] License activated successfully.");
    } else {
      safeWarn("[License] Activation failed:", status.reason);
    }
    return status;
  }

  /**
   * Remove the saved license (deactivate).
   */
  deactivateLicense(): void {
    try {
      if (fs.existsSync(this.licenseFilePath)) {
        fs.unlinkSync(this.licenseFilePath);
      }
    } catch (err) {
      safeWarn("[License] Failed to remove license file:", err);
    }
    this.cachedStatus = null;
    safeLog("[License] License deactivated.");
  }

  /**
   * Start periodic online re-validation.
   * Call this after the app window is ready.
   */
  startRevalidation(onRevoked: () => void): void {
    if (ONLINE_REVALIDATION_INTERVAL_MS <= 0) return;
    this.revalidationTimer = setInterval(async () => {
      try {
        const token = fs.existsSync(this.licenseFilePath)
          ? fs.readFileSync(this.licenseFilePath, "utf8").trim()
          : "";
        if (!token) return;

        const isValid = await this.checkOnlineActivation(token);
        if (!isValid) {
          safeWarn("[License] Online revalidation failed – license revoked.");
          onRevoked();
        }
      } catch (err) {
        // Network error: treat as valid (offline grace period)
        safeWarn("[License] Online revalidation error (offline?):", err);
      }
    }, ONLINE_REVALIDATION_INTERVAL_MS);
  }

  stopRevalidation(): void {
    if (this.revalidationTimer) {
      clearInterval(this.revalidationTimer);
      this.revalidationTimer = null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private validateToken(token: string): LicenseStatus {
    // 1. Verify RSA signature
    let payload: LicensePayload;
    try {
      payload = verifyRsaJwt(token, OWNER_PUBLIC_KEY_PEM);
    } catch (err) {
      return { valid: false, reason: `Signature invalid: ${String(err)}` };
    }

    // 2. Check hardware fingerprint
    const currentFingerprint = getHardwareFingerprint();
    if (payload.fingerprint !== currentFingerprint) {
      safeWarn(
        `[License] Fingerprint mismatch.\n  Expected: ${payload.fingerprint}\n  Current:  ${currentFingerprint}`
      );
      return {
        valid: false,
        reason:
          "This license is locked to a different machine. Contact support to transfer your license.",
      };
    }

    // 3. Check expiry
    if (payload.expires !== "permanent") {
      const expiry = new Date(payload.expires);
      if (isNaN(expiry.getTime()) || expiry < new Date()) {
        return {
          valid: false,
          reason: `License expired on ${payload.expires}. Please renew your license.`,
        };
      }
    }

    return { valid: true, payload };
  }

  private async checkOnlineActivation(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${LICENSE_SERVER_URL}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fingerprint: getHardwareFingerprint(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { valid: boolean };
      return data.valid === true;
    } catch {
      // On network error, allow offline usage (grace period)
      return true;
    }
  }
}
