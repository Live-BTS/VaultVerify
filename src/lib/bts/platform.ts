import { db } from "@/lib/db";

// ── Platform command switches ──────────────────────────────────────
// Key/value flags stored in PlatformConfig, read server-only. A short
// in-memory TTL keeps hot paths from hammering the DB while still making
// console changes effective within seconds.

const TTL_MS = 15_000;
const cache = new Map<string, { value: string; at: number }>();

export const MAINTENANCE_KEY = "MAINTENANCE_MODE";

export async function getPlatformFlag(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await db.platformConfig.findUnique({ where: { key } });
  const value = row?.value ?? null;
  if (value !== null) cache.set(key, { value, at: Date.now() });
  else cache.delete(key);
  return value;
}

export async function setPlatformFlag(key: string, value: string, updatedBy = "superadmin"): Promise<void> {
  await db.platformConfig.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
  cache.set(key, { value, at: Date.now() });
}

export async function deletePlatformFlag(key: string): Promise<void> {
  await db.platformConfig.deleteMany({ where: { key } });
  cache.delete(key);
}

export const maintenanceMode = async (): Promise<boolean> =>
  (await getPlatformFlag(MAINTENANCE_KEY)) === "1";

// Guard for mutating user-facing routes while the platform is upgrading.
// Superadmin routes deliberately bypass this check.
// A failing flag lookup (e.g. unreachable DATABASE_URL on a fresh deploy)
// must read as an owner action item, never as an unhandled 500.
export async function assertPlatformWritable(): Promise<{ ok: boolean; error?: string }> {
  let maintenance: boolean;
  try {
    maintenance = await maintenanceMode();
  } catch (e) {
    console.error("[platform] flag lookup failed — database unreachable?", e);
    return {
      ok: false,
      error: "Database unreachable — the deployment cannot read its configuration store. Verify DATABASE_URL (host, password, sslmode) under Vercel → Settings → Environment Variables, then redeploy.",
    };
  }
  if (maintenance) {
    return { ok: false, error: "VaultVerify is briefly upgrading — the platform is in maintenance mode. Try again in a few minutes." };
  }
  return { ok: true };
}
