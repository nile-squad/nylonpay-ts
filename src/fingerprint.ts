/**
 * Server fingerprint generation for SDK requests.
 * Provides a stable identifier based on runtime environment.
 *
 * @see Spec 2 section 1 - "a server fingerprint based on runtime, os, etc"
 */

import { arch, hostname, platform, release, type } from "node:os";
import { createHash } from "node:crypto";

/**
 * Generate a server fingerprint based on runtime environment.
 * This provides a stable identifier for the server making requests.
 * The fingerprint is a SHA-256 hash of system characteristics.
 *
 * @returns Hex-encoded SHA-256 hash of system info
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
    `node:${process.versions.node}`,
    `v8:${process.versions.v8}`,
  ].join("|");

  return createHash("sha256").update(components).digest("hex");
}
