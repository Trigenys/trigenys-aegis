import { isDeepStrictEqual } from "node:util";
import type { TrmmApi } from "../adapters/inventory/trmm-client.js";
import type { TrmmClientMapping, TrmmSyncConfig } from "../adapters/inventory/trmm-config.js";
import { isNonWindowsAgent, isTrmmSkip, mapTrmmAgent, TRMM_SOURCE, trmmAssetId } from "../adapters/inventory/trmm-mapping.js";
import type { TrmmAgent, TrmmClient, TrmmWinUpdate } from "../adapters/inventory/trmm-types.js";
import type { Asset, UpsertResult } from "../domain/estate.js";
import type { EstateStore, TenancyStore } from "../ports/stores.js";
import { systemClock, type Clock } from "./tenancy-service.js";

export interface SkippedAgent {
  readonly agentId: string | null;
  readonly hostname: string | null;
  readonly reason: string;
}

export interface MissingAsset {
  readonly assetId: string;
  readonly hostname: string;
}

export interface ClientSyncReport {
  readonly trmmClientId: number;
  readonly trmmClientName: string;
  readonly aegisClientId: string;
  readonly status: "ok" | "error";
  /** Why the whole client was refused; nothing was written for it. */
  readonly error: string | null;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: readonly SkippedAgent[];
  /** Assets previously synced from Tactical RMM and no longer reported. Reported only, never deleted. */
  readonly missing: readonly MissingAsset[];
  readonly warnings: readonly string[];
}

export interface SyncReport {
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly clients: readonly ClientSyncReport[];
  /** Tactical RMM clients absent from the configuration: listed, never read. */
  readonly unmappedClients: readonly { readonly trmmClientId: number; readonly name: string }[];
}

export interface SyncInventoryOptions {
  readonly api: TrmmApi;
  readonly config: TrmmSyncConfig;
  readonly tenancy: TenancyStore;
  readonly estate: EstateStore;
  readonly clock?: Clock;
  /** Computes the same report without writing anything. */
  readonly dryRun?: boolean;
}

class ClientRefused extends Error {}

/**
 * Pulls the inventory of every configured client from Tactical RMM and
 * reconciles it into the estate store. The Aegis client always comes from the
 * configuration; a client whose Tactical RMM data does not match its mapping
 * is refused as a whole before any write, while the other clients proceed.
 * Failing to list the Tactical RMM clients aborts the run (TrmmApiError).
 */
export async function syncInventory(options: SyncInventoryOptions): Promise<SyncReport> {
  const { api, config, tenancy, estate } = options;
  const clock = options.clock ?? systemClock;
  const dryRun = options.dryRun === true;

  const trmmClients = await api.listClients();
  const configured = new Set(config.clients.map((mapping) => mapping.trmmClientId));
  const unmappedClients = trmmClients
    .filter((client) => !configured.has(client.id))
    .map((client) => ({ trmmClientId: client.id, name: client.name }));

  const clients: ClientSyncReport[] = [];
  for (const mapping of config.clients) {
    const trmmClient = trmmClients.find((client) => client.id === mapping.trmmClientId) ?? null;
    clients.push(await syncClient({ api, config, tenancy, estate, dryRun }, mapping, trmmClient));
  }
  return { generatedAt: clock.now().toISOString(), dryRun, clients, unmappedClients };
}

interface ClientContext {
  readonly api: TrmmApi;
  readonly config: TrmmSyncConfig;
  readonly tenancy: TenancyStore;
  readonly estate: EstateStore;
  readonly dryRun: boolean;
}

async function syncClient(context: ClientContext, mapping: TrmmClientMapping, trmmClient: TrmmClient | null): Promise<ClientSyncReport> {
  const { api, config, tenancy, estate, dryRun } = context;
  const clientId = mapping.aegisClientId;
  const counts = { created: 0, updated: 0, unchanged: 0 };
  const skipped: SkippedAgent[] = [];
  const warnings: string[] = [];
  const base = {
    trmmClientId: mapping.trmmClientId, trmmClientName: mapping.trmmClientName, aegisClientId: clientId
  };

  try {
    // Every guard runs before the first write: a refused client is left untouched.
    if (!(await tenancy.getClient(clientId))) throw new ClientRefused(`Aegis client ${clientId} does not exist`);
    for (const site of mapping.sites) {
      if (!(await tenancy.getSite(clientId, site.aegisSiteId))) {
        throw new ClientRefused(`Aegis site ${site.aegisSiteId} does not belong to client ${clientId}`);
      }
    }
    if (!trmmClient) throw new ClientRefused(`Tactical RMM client ${mapping.trmmClientId} not found`);
    if (trmmClient.name.trim() !== mapping.trmmClientName) {
      throw new ClientRefused(
        `Tactical RMM client ${mapping.trmmClientId} is named "${trmmClient.name}", expected "${mapping.trmmClientName}"`);
    }

    const agents = await api.listAgents(mapping.trmmClientId);
    const foreign = agents.filter((agent) => (agent.client_name ?? "").trim() !== mapping.trmmClientName);
    if (foreign.length > 0) {
      throw new ClientRefused(`${foreign.length} agent(s) reported for client ${mapping.trmmClientId} belong to another client`);
    }

    const siteIds = new Map(mapping.sites.map((site) => [site.trmmSiteName, site.aegisSiteId]));
    const existing = new Map((await estate.listAssets(clientId)).map((asset) => [asset.id, asset]));
    const seen = new Set<string>();
    const assets: Asset[] = [];
    for (const agent of agents) {
      const agentId = typeof agent.agent_id === "string" && agent.agent_id.trim() !== "" ? agent.agent_id.trim() : null;
      if (agentId) seen.add(trmmAssetId(clientId, agentId));
      const siteName = (agent.site_name ?? "").trim();
      const siteId = siteIds.get(siteName) ?? null;
      if (siteId === null && agentId) {
        warnings.push(`agent ${agent.hostname ?? agentId}: Tactical RMM site "${siteName}" is not mapped, stored without site`);
      }
      const updates = agentId ? await windowsUpdates(api, config, agent, agentId, warnings) : null;
      const result = mapTrmmAgent(agent, {
        clientId,
        siteId,
        existing: agentId ? existing.get(trmmAssetId(clientId, agentId)) ?? null : null,
        updates,
        backupRequiredKinds: config.backupRequiredKinds
      });
      if (isTrmmSkip(result)) {
        skipped.push({ agentId, hostname: typeof agent.hostname === "string" ? agent.hostname : null, reason: result.skip });
      } else {
        assets.push(result);
      }
    }

    for (const asset of assets) {
      const outcome: UpsertResult = dryRun ? predict(existing.get(asset.id), asset) : await estate.upsertAsset(clientId, asset);
      counts[outcome] += 1;
    }

    const missing = [...existing.values()]
      .filter((asset) => asset.source === TRMM_SOURCE && !seen.has(asset.id))
      .map((asset) => ({ assetId: asset.id, hostname: asset.hostname }));
    return { ...base, status: "ok", error: null, ...counts, skipped, missing, warnings };
  } catch (error) {
    return {
      ...base, status: "error", error: error instanceof Error ? error.message : "unknown error",
      ...counts, skipped, missing: [], warnings
    };
  }
}

async function windowsUpdates(
  api: TrmmApi, config: TrmmSyncConfig, agent: TrmmAgent, agentId: string, warnings: string[]
): Promise<readonly TrmmWinUpdate[] | null> {
  if (!config.fetchWindowsUpdates || isNonWindowsAgent(agent)) return null;
  try {
    return await api.listWinUpdates(agentId);
  } catch (error) {
    warnings.push(`agent ${agent.hostname ?? agentId}: Windows updates unavailable (${error instanceof Error ? error.message : "unknown error"}), using the pending-patch flag`);
    return null;
  }
}

function predict(existing: Asset | undefined, asset: Asset): UpsertResult {
  if (!existing) return "created";
  return isDeepStrictEqual(existing, asset) ? "unchanged" : "updated";
}
