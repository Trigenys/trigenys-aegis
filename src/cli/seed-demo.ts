import { openPersistence } from "../composition.js";
import { seedDemo } from "./demo-seed.js";

// Loads the fictional demonstration estate into the PostgreSQL database named by
// AEGIS_DATABASE_URL. Refused unless AEGIS_ALLOW_DEMO_SEED=1 and refused when a
// non-demo client already exists. Usage: demo:seed [--as-of 2026-11-18T09:00:00Z]
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const databaseUrl = process.env.AEGIS_DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("AEGIS_DATABASE_URL is required: the in-memory demo is seeded by `npm run demo`.");
  process.exit(2);
}

const asOfText = argument("--as-of");
const asOf = asOfText ? new Date(asOfText) : new Date();
const persistence = await openPersistence(databaseUrl);
try {
  const report = await seedDemo(persistence, asOf, process.env);
  console.log(`demo seed as of ${asOf.toISOString()}: created=${report.created} updated=${report.updated} unchanged=${report.unchanged}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "demo seed failed");
  process.exitCode = 1;
} finally {
  await persistence.close();
}
