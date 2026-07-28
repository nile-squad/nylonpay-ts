import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "../../../../backend");

let ensuredLocalAdmin = false;

/** Seeds a platform sub-admin for local integration admin actions. */
export function ensureLocalIntegrationAdmin(): void {
  if (ensuredLocalAdmin) {
    return;
  }
  if (!process.env.NYLONPAY_BASE_URL?.includes("localhost")) {
    return;
  }
  if (
    !(
      process.env.NYLONPAY_INTEGRATION_ADMIN_PASSWORD ??
      process.env.NYLONPAY_ROOT_ADMIN_PASSWORD
    )
  ) {
    return;
  }

  const result = spawnSync(
    "bun",
    ["run", "scripts/ensure-integration-admin.ts"],
    {
      cwd: backendRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error("Failed to ensure integration admin for local tests");
  }

  ensuredLocalAdmin = true;
}

export default async function globalSetup(): Promise<void> {
  ensureLocalIntegrationAdmin();
}
