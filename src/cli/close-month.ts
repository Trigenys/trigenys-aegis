import { createCockpit, openPersistence } from "../composition.js";
import { loadHealthRules } from "../adapters/config/health-rules-file.js";

// Freezes the health score of every client for a past or current UTC month.
// Idempotent: a month already closed is left as it is.
// Usage: report:close-month --period 2026-10   (AEGIS_DATABASE_URL selects the database)
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const period = argument("--period");
if (!period) {
  console.error("usage: report:close-month --period YYYY-MM");
  process.exit(2);
}

const persistence = await openPersistence(process.env.AEGIS_DATABASE_URL);
try {
  const { cockpit, tenancy } = createCockpit({ ...persistence, healthRules: loadHealthRules(process.env.AEGIS_HEALTH_RULES_PATH) });
  let created = 0;
  let unchanged = 0;
  for (const client of await tenancy.listClients()) {
    const result = await cockpit.closeMonth(client.id, period);
    if (result.created) created += 1;
    else unchanged += 1;
  }
  console.log(`period ${period}: closed=${created} already-closed=${unchanged}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "close-month failed");
  process.exitCode = 1;
} finally {
  await persistence.close();
}
