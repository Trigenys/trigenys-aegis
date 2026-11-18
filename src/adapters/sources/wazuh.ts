import { createHash } from "node:crypto";
import {
  EVENT_SCHEMA_VERSION, isRecord,
  type AttributeValue, type NormalizedEventDraft, type Severity
} from "../../domain/event.js";
import { AdapterError, type SourceAdapter } from "./contract.js";

const ADAPTER_ID = "wazuh";
const ADAPTER_VERSION = "1.0.0";
const MAX_BATCH = 500;

/**
 * Wazuh rule level (0-15) to normalized severity.
 * 0-3 informational, 4-6 low, 7-11 medium, 12-14 high, 15 critical.
 */
export function wazuhLevelToSeverity(level: number): Severity {
  if (level >= 15) return "critical";
  if (level >= 12) return "high";
  if (level >= 7) return "medium";
  if (level >= 4) return "low";
  return "info";
}

/**
 * Transforms Wazuh alerts (the alerts.json / integration payload format) into
 * normalized security alerts. Accepts one alert or an array of alerts.
 *
 * Privacy: `full_log` and the free-form `data` object are not carried over;
 * only a short allowlist of fields is kept as attributes.
 */
export class WazuhAdapter implements SourceAdapter {
  readonly id = ADAPTER_ID;
  readonly version = ADAPTER_VERSION;

  normalize(payload: unknown): NormalizedEventDraft[] {
    const alerts = Array.isArray(payload) ? payload : [payload];
    if (alerts.length === 0) throw new AdapterError(ADAPTER_ID, "empty batch");
    if (alerts.length > MAX_BATCH) throw new AdapterError(ADAPTER_ID, `batch exceeds ${MAX_BATCH} alerts`);
    return alerts.map((alert, index) => this.normalizeOne(alert, index));
  }

  private normalizeOne(alert: unknown, index: number): NormalizedEventDraft {
    const fail = (reason: string) => new AdapterError(ADAPTER_ID, `alert[${index}]: ${reason}`);
    if (!isRecord(alert)) throw fail("not an object");

    const rule = alert.rule;
    if (!isRecord(rule)) throw fail("missing rule");
    const ruleId = asString(rule.id);
    if (!ruleId) throw fail("missing rule.id");
    const level = typeof rule.level === "number" ? rule.level : Number(rule.level);
    if (!Number.isInteger(level) || level < 0 || level > 15) throw fail("rule.level must be an integer 0-15");

    const occurredAt = parseWazuhTimestamp(alert.timestamp);
    if (!occurredAt) throw fail("missing or invalid timestamp");

    const description = asString(rule.description) ?? `Wazuh rule ${ruleId}`;
    const mitre = isRecord(rule.mitre) ? rule.mitre : {};
    const agent = isRecord(alert.agent) ? alert.agent : null;

    const attributes: Record<string, AttributeValue> = { "wazuh.rule.level": level };
    putString(attributes, "wazuh.location", alert.location);
    putString(attributes, "wazuh.decoder", isRecord(alert.decoder) ? alert.decoder.name : undefined);
    putString(attributes, "wazuh.manager", isRecord(alert.manager) ? alert.manager.name : undefined);
    if (typeof rule.firedtimes === "number") attributes["wazuh.rule.firedtimes"] = rule.firedtimes;

    return {
      schemaVersion: EVENT_SCHEMA_VERSION,
      source: {
        type: ADAPTER_ID,
        adapterVersion: ADAPTER_VERSION,
        eventId: asString(alert.id) ?? fallbackEventId(alert)
      },
      category: "security_alert",
      severity: wazuhLevelToSeverity(level),
      occurredAt,
      title: description.slice(0, 512),
      asset: agent ? {
        id: asString(agent.id),
        hostname: asString(agent.name),
        ip: asString(agent.ip)
      } : null,
      rule: {
        id: ruleId,
        description,
        groups: stringArray(rule.groups),
        mitreTechniques: stringArray(mitre.id),
        mitreTactics: stringArray(mitre.tactic)
      },
      attributes
    };
  }
}

/** Wazuh emits "2026-11-18T09:12:44.123+0000"; normalize to a UTC ISO instant. */
export function parseWazuhTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const withColon = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(withColon)) return null;
  const time = Date.parse(withColon);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function fallbackEventId(alert: Record<string, unknown>): string {
  return "sha256:" + createHash("sha256").update(JSON.stringify(alert)).digest("hex");
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function putString(target: Record<string, AttributeValue>, key: string, value: unknown): void {
  const s = asString(value);
  if (s) target[key] = s.slice(0, 256);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 32) : [];
}
