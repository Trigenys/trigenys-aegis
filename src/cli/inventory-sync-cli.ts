import { createTrmmApi, TrmmApiError } from "../adapters/inventory/trmm-client.js";
import { loadTrmmSyncConfig, type TrmmSyncConfig } from "../adapters/inventory/trmm-config.js";
import { syncInventory, type SyncReport } from "../application/inventory-sync.js";
import type { Clock } from "../application/tenancy-service.js";
import type { Persistence } from "../composition.js";

/** Exit codes of `npm run sync:inventory`. */
export const SYNC_EXIT = {
  ok: 0,
  /** At least one client was refused or failed; the others were processed. */
  clientError: 1,
  /** Invalid configuration file or missing environment variable. */
  config: 2,
  /** Tactical RMM unreachable, or the client list was refused (401/403). */
  source: 3
} as const;

export interface InventorySyncCliDeps {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly openPersistence: (databaseUrl: string) => Promise<Persistence>;
  readonly fetch?: typeof fetch;
  readonly clock?: Clock;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

const USAGE = "usage: sync:inventory [--config <file>] [--dry-run] [--json] (or AEGIS_TRMM_CONFIG=<file>)";

/** Runs one inventory sync and returns the process exit code. The API key never reaches any output. */
export async function runInventorySync(deps: InventorySyncCliDeps): Promise<number> {
  const args = [...deps.argv];
  const dryRun = take(args, "--dry-run");
  const json = take(args, "--json");
  const configIndex = args.indexOf("--config");
  const configPath = configIndex === -1 ? deps.env.AEGIS_TRMM_CONFIG?.trim() : args[configIndex + 1]?.trim();
  if (configIndex !== -1) args.splice(configIndex, 2);
  if (args.length > 0) {
    deps.err(`unknown argument ${args[0]}. ${USAGE}`);
    return SYNC_EXIT.config;
  }
  if (!configPath) {
    deps.err(`no configuration file. ${USAGE}`);
    return SYNC_EXIT.config;
  }

  let config: TrmmSyncConfig;
  try {
    config = loadTrmmSyncConfig(configPath);
  } catch (error) {
    deps.err(error instanceof Error ? error.message : "invalid configuration");
    return SYNC_EXIT.config;
  }
  const databaseUrl = deps.env.AEGIS_DATABASE_URL?.trim();
  if (!databaseUrl) {
    deps.err("AEGIS_DATABASE_URL is required: the inventory is written to the durable store.");
    return SYNC_EXIT.config;
  }
  const apiKey = deps.env[config.apiKeyEnv]?.trim();
  if (!apiKey) {
    deps.err(`environment variable ${config.apiKeyEnv} (Tactical RMM API key) is not set`);
    return SYNC_EXIT.config;
  }

  const api = createTrmmApi({ baseUrl: config.baseUrl, apiKey, fetch: deps.fetch });
  const persistence = await deps.openPersistence(databaseUrl);
  try {
    let report: SyncReport;
    try {
      report = await syncInventory({
        api, config, tenancy: persistence.tenancyStore, estate: persistence.estateStore, clock: deps.clock, dryRun
      });
    } catch (error) {
      if (error instanceof TrmmApiError) {
        deps.err(error.unauthorized ? `${error.message} (check the API key and its permissions)` : error.message);
        return SYNC_EXIT.source;
      }
      throw error;
    }
    if (json) deps.out(JSON.stringify(report, null, 2));
    else for (const line of formatReport(report)) deps.out(line);
    return report.clients.some((client) => client.status === "error") ? SYNC_EXIT.clientError : SYNC_EXIT.ok;
  } finally {
    await persistence.close();
  }
}

export function formatReport(report: SyncReport): string[] {
  const lines: string[] = [];
  const prefix = report.dryRun ? "[dry-run] " : "";
  for (const client of report.clients) {
    const head = `${prefix}trmm client ${client.trmmClientId} "${client.trmmClientName}" -> ${client.aegisClientId}`;
    lines.push(client.status === "error"
      ? `${head}: ERROR ${client.error}`
      : `${head}: created=${client.created} updated=${client.updated} unchanged=${client.unchanged} ` +
        `skipped=${client.skipped.length} missing=${client.missing.length}`);
    for (const skip of client.skipped) lines.push(`  skipped ${skip.hostname ?? skip.agentId ?? "?"}: ${skip.reason}`);
    for (const missing of client.missing) lines.push(`  missing ${missing.hostname} (${missing.assetId}): no longer reported`);
    for (const warning of client.warnings) lines.push(`  warning ${warning}`);
  }
  for (const unmapped of report.unmappedClients) {
    lines.push(`${prefix}trmm client ${unmapped.trmmClientId} "${unmapped.name}": not mapped, ignored`);
  }
  return lines;
}

function take(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}
