/**
 * Generate a deterministic DICOM UID from an existing DICOM Instance UID and a Station Name.
 *
 * Notes:
 * - DICOM UIDs must be a dot-separated list of non-negative integers.
 * - Max length is 64 characters.
 * - This implementation produces a stable UID for the same (instanceUID, stationName) pair.
 *
 * Strategy:
 * - Use a fixed UID root under the "2.25" arc (decimal representation of a UUID/128-bit value).
 * - Hash `${instanceUID}|${stationName}` to 128 bits (MD5), interpret as an unsigned integer,
 *   then encode as a decimal integer per the 2.25 scheme: `2.25.<decimal>`.
 *
 * Practical considerations:
 * - While MD5 is not cryptographically secure, it is fine here for deterministic ID generation.
 * - Collision risk exists in theory; if you need even lower risk, you can switch to SHA-256 and
 *   truncate to 128 bits (still fits 2.25).
 */

function md5Bytes(input: string): Uint8Array {
  // Works in Node.js 18+ (including most TS backends). For browsers, replace with WebCrypto.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto: typeof import("crypto") = require("crypto");
  return crypto.createHash("md5").update(input, "utf8").digest();
}

function bytesToBigIntUnsigned(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  return n;
}

function normalizeStationName(stationName: string): string {
  // DICOM Station Name (0008,1010) is typically upper-case and limited in length,
  // but we normalize lightly to be consistent and avoid accidental whitespace differences.
  return stationName.trim();
}

function isValidDicomUid(uid: string): boolean {
  // Basic UID format check (not exhaustive, but catches obvious issues).
  // - dot-separated integers
  // - no leading '+' or '-'
  // - components must not be empty
  if (!uid || uid.length > 64) return false;
  if (uid.startsWith(".") || uid.endsWith(".")) return false;
  const parts = uid.split(".");
  if (parts.some((p) => p.length === 0)) return false;
  if (parts.some((p) => !/^\d+$/.test(p))) return false;
  // DICOM disallows leading zeros in components unless the component is exactly "0".
  if (parts.some((p) => p.length > 1 && p.startsWith("0"))) return false;
  return true;
}

/**
 * Generates a deterministic derived UID for the given instanceUID + stationName.
 *
 * @param instanceUID Existing DICOM SOP Instance UID (or any valid DICOM UID).
 * @param stationName DICOM Station Name (0008,1010) or similar identifier.
 * @returns A valid DICOM UID string.
 */
export function generateDicomUidFromInstanceAndStation(
  instanceUID: string,
  stationName: string
): string {
  if (!isValidDicomUid(instanceUID)) {
    throw new Error(`instanceUID is not a valid DICOM UID (or exceeds 64 chars): "${instanceUID}"`);
  }
  const station = normalizeStationName(stationName);
  if (!station) {
    throw new Error("stationName must be a non-empty string");
  }

  const input = `${instanceUID}|${station}`;
  const hash = md5Bytes(input); // 16 bytes
  const value = bytesToBigIntUnsigned(hash); // 0 .. 2^128-1
  const uid = `2.25.${value.toString(10)}`;

  // 2.25.<decimal> will always be <= 64 chars (39 digits max after 2.25.)
  // but keep a defensive check.
  if (!isValidDicomUid(uid)) {
    throw new Error(`Generated UID is invalid: "${uid}"`);
  }
  return uid;
}