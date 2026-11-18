import { openPersistence } from "../composition.js";
import { runInventorySync } from "./inventory-sync-cli.js";

// Pulls the inventory of the configured clients from Tactical RMM into the
// PostgreSQL database named by AEGIS_DATABASE_URL. The API key is read from the
// environment variable named in the configuration (AEGIS_TRMM_API_KEY by default).
// Usage: sync:inventory [--config <file>] [--dry-run] [--json]
try {
  process.exitCode = await runInventorySync({
    argv: process.argv.slice(2),
    env: process.env,
    openPersistence,
    out: (line) => console.log(line),
    err: (line) => console.error(line)
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "inventory sync failed");
  process.exitCode = 1;
}
