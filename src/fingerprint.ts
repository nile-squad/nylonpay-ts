/**
 * Server fingerprint generation for SDK requests.
 *
 * A stable, opaque identifier for the machine a process is running on. It is
 * sent as `_fingerprint` in the request body and is the first component of
 * `signatureInput`, so the value signed and the value sent must be identical.
 *
 * The server treats it as opaque: it reads `_fingerprint` out of the body and
 * feeds that value into its own HMAC. It never recomputes one, so what goes
 * into the hash is an implementation choice and can change without breaking
 * older clients, which sign with whatever they sent.
 *
 * Only OS-level inputs are used. Runtime and language versions were removed on
 * 2026-09-08 because they are not something every SDK can obtain the same way,
 * and they made the value churn on every runtime upgrade for no benefit.
 *
 * @see Spec 2 section 1
 */

import { createHash } from "node:crypto";
import { arch, hostname, platform, release, type } from "node:os";

/**
 * Generate a server fingerprint from OS metadata.
 *
 * @returns Hex-encoded SHA-256 hash of system info, 64 lowercase characters
 *
 * @example
 * ```ts
 * const fingerprint = generateFingerprint();
 * // => "e3b0c44298fc1c149afbf4c8996fb924..."
 * ```
 */
export function generateFingerprint(): string {
  const components = [
    `type:${type()}`,
    `platform:${platform()}`,
    `arch:${arch()}`,
    `release:${release()}`,
    `hostname:${hostname()}`,
  ].join("|");

  return createHash("sha256").update(components).digest("hex");
}
