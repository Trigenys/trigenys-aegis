import { sourceRecordId, type Asset, type AssetKind } from "../../domain/estate.js";
import type { TrmmAgent, TrmmWinUpdate } from "./trmm-types.js";

/** Value of Asset.source for every record owned by this adapter. */
export const TRMM_SOURCE = "tacticalrmm";

export interface TrmmMappingContext {
  /** Aegis client, taken from the sync configuration and never from the agent payload. */
  readonly clientId: string;
  /** Aegis site resolved by the caller from the agent's site name, or null when unmapped. */
  readonly siteId: string | null;
  /** The asset as currently stored, if any: fields Tactical RMM does not report are kept from it. */
  readonly existing?: Asset | null;
  /** Windows updates of the agent, or null when they were not fetched. */
  readonly updates?: readonly TrmmWinUpdate[] | null;
  readonly backupRequiredKinds: readonly AssetKind[];
}

export interface TrmmSkip {
  readonly skip: string;
}

/** Stable asset id of a Tactical RMM agent within a client. */
export function trmmAssetId(clientId: string, agentId: string): string {
  return sourceRecordId(clientId, TRMM_SOURCE, agentId);
}

/**
 * Pure mapping of one Tactical RMM agent to an Aegis asset. Tactical RMM owns
 * identity, system, user, presence and update fields; antivirus, firewall and
 * backup fields are not reported by it and are carried over from the stored
 * asset (the store rewrites the whole record). observedAt is the agent's own
 * last contact, never the sync time, so replaying an unchanged agent is a no-op.
 */
export function mapTrmmAgent(agent: TrmmAgent, context: TrmmMappingContext): Asset | TrmmSkip {
  const agentId = text(agent.agent_id);
  if (!agentId) return { skip: "missing agent_id" };
  const hostname = text(agent.hostname);
  if (!hostname) return { skip: "missing hostname" };
  const lastSeenAt = isoInstant(agent.last_seen);
  if (!lastSeenAt) return { skip: "missing or invalid last_seen" };

  const kind: AssetKind = agent.monitoring_type === "server" ? "server" : "workstation";
  const existing = context.existing ?? null;
  const user = text(agent.logged_username);
  const { pending, critical } = countUpdates(agent, context.updates ?? null);

  return {
    id: trmmAssetId(context.clientId, agentId),
    clientId: context.clientId,
    siteId: context.siteId,
    kind,
    hostname,
    os: text(agent.operating_system) ?? text(agent.plat) ?? "unknown",
    hardware: text(agent.make_model),
    user: user === "-" ? null : user,
    lastSeenAt,
    antivirus: existing?.antivirus ?? "unknown",
    firewall: existing?.firewall ?? "unknown",
    pendingUpdates: pending,
    criticalUpdates: critical,
    lastBackupSuccessAt: existing?.lastBackupSuccessAt ?? null,
    backupRequired: existing?.backupRequired ?? context.backupRequiredKinds.includes(kind),
    source: TRMM_SOURCE,
    observedAt: lastSeenAt
  };
}

export function isTrmmSkip(result: Asset | TrmmSkip): result is TrmmSkip {
  return "skip" in result;
}

/** True when the agent is known to run something other than Windows. */
export function isNonWindowsAgent(agent: TrmmAgent): boolean {
  const plat = text(agent.plat);
  return plat !== null && plat.toLowerCase() !== "windows";
}

function countUpdates(agent: TrmmAgent, updates: readonly TrmmWinUpdate[] | null): { pending: number; critical: number } {
  if (isNonWindowsAgent(agent)) return { pending: 0, critical: 0 };
  if (updates === null) return { pending: agent.has_patches_pending === true ? 1 : 0, critical: 0 };
  const pending = updates.filter((update) => update.installed !== true && update.action !== "ignore");
  return { pending: pending.length, critical: pending.filter((update) => update.severity === "Critical").length };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Normalizes an API timestamp to a UTC ISO instant with millisecond precision
 * (the API may send microseconds; storage and comparison use milliseconds).
 * A timestamp without an offset is read as UTC.
 */
function isoInstant(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(raw);
  if (!match) return null;
  const fraction = match[2] ? match[2].slice(0, 4).padEnd(4, "0") : "";
  const offset = (match[3] ?? "Z").toUpperCase().replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const parsed = new Date(`${match[1]!.replace(" ", "T")}${fraction}${offset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
