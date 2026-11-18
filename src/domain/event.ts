/**
 * Normalized event schema, version 1.
 *
 * Source adapters produce a {@link NormalizedEventDraft}: it has no tenant
 * fields at all. The ingestion core stamps `clientId`, `siteId`, `id` and
 * `receivedAt` from the authenticated principal, so an adapter (or a payload)
 * cannot choose which client an event belongs to.
 */

export const EVENT_SCHEMA_VERSION = "1.0" as const;

export const EVENT_CATEGORIES = [
  "security_alert",
  "availability",
  "inventory",
  "patch",
  "network",
  "other"
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type AttributeValue = string | number | boolean;

export interface EventAsset {
  readonly id: string | null;
  readonly hostname: string | null;
  readonly ip: string | null;
}

export interface EventRule {
  readonly id: string;
  readonly description: string;
  readonly groups: readonly string[];
  readonly mitreTechniques: readonly string[];
  readonly mitreTactics: readonly string[];
}

export interface EventSource {
  /** Adapter identifier, e.g. "wazuh". */
  readonly type: string;
  readonly adapterVersion: string;
  /** Identifier assigned by the source tool; the deduplication key within a client. */
  readonly eventId: string;
}

export interface NormalizedEventDraft {
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly source: EventSource;
  readonly category: EventCategory;
  readonly severity: Severity;
  readonly occurredAt: string;
  readonly title: string;
  readonly asset: EventAsset | null;
  readonly rule: EventRule | null;
  /** Allowlisted scalar attributes only; raw logs are deliberately not carried. */
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export interface NormalizedEvent extends NormalizedEventDraft {
  readonly id: string;
  readonly clientId: string;
  readonly siteId: string | null;
  readonly receivedAt: string;
}

const DRAFT_KEYS = new Set([
  "schemaVersion", "source", "category", "severity", "occurredAt",
  "title", "asset", "rule", "attributes"
]);

const MAX_TITLE = 512;
const MAX_ATTRIBUTES = 64;
const MAX_STRING = 2048;

/**
 * Validates an adapter output against schema 1.0. Returns the list of
 * violations (empty when valid). Unknown keys are rejected so that tenant
 * fields can never slip through a draft.
 */
export function validateDraft(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["event must be an object"];

  for (const key of Object.keys(value)) {
    if (!DRAFT_KEYS.has(key)) errors.push(`unexpected field: ${key}`);
  }
  if (value.schemaVersion !== EVENT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EVENT_SCHEMA_VERSION}`);
  }

  const source = value.source;
  if (!isRecord(source)) {
    errors.push("source must be an object");
  } else {
    for (const field of ["type", "adapterVersion", "eventId"] as const) {
      if (!isNonEmptyString(source[field])) errors.push(`source.${field} must be a non-empty string`);
    }
  }

  if (!EVENT_CATEGORIES.includes(value.category as EventCategory)) errors.push("category is invalid");
  if (!SEVERITIES.includes(value.severity as Severity)) errors.push("severity is invalid");
  if (typeof value.occurredAt !== "string" || !isIsoInstant(value.occurredAt)) {
    errors.push("occurredAt must be an ISO-8601 UTC instant");
  }
  if (!isNonEmptyString(value.title) || value.title.length > MAX_TITLE) {
    errors.push(`title must be a non-empty string of at most ${MAX_TITLE} characters`);
  }

  if (value.asset !== null) {
    if (!isRecord(value.asset)) {
      errors.push("asset must be an object or null");
    } else {
      for (const field of ["id", "hostname", "ip"] as const) {
        const v = value.asset[field];
        if (v !== null && typeof v !== "string") errors.push(`asset.${field} must be a string or null`);
      }
    }
  }

  if (value.rule !== null) {
    if (!isRecord(value.rule)) {
      errors.push("rule must be an object or null");
    } else {
      if (!isNonEmptyString(value.rule.id)) errors.push("rule.id must be a non-empty string");
      if (typeof value.rule.description !== "string") errors.push("rule.description must be a string");
      for (const field of ["groups", "mitreTechniques", "mitreTactics"] as const) {
        const v = value.rule[field];
        if (!Array.isArray(v) || !v.every((item) => typeof item === "string")) {
          errors.push(`rule.${field} must be an array of strings`);
        }
      }
    }
  }

  if (!isRecord(value.attributes)) {
    errors.push("attributes must be an object");
  } else {
    const entries = Object.entries(value.attributes);
    if (entries.length > MAX_ATTRIBUTES) errors.push(`attributes must have at most ${MAX_ATTRIBUTES} entries`);
    for (const [key, v] of entries) {
      const scalar = typeof v === "number" ? Number.isFinite(v)
        : typeof v === "boolean" || (typeof v === "string" && v.length <= MAX_STRING);
      if (!scalar) errors.push(`attributes.${key} must be a bounded scalar`);
    }
  }

  return errors;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoInstant(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}
