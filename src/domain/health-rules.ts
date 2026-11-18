import { SEVERITIES, type Severity } from "./event.js";

/**
 * Declarative health-score rules. Nothing about thresholds or weights lives in
 * the evaluators: they only know how to count affected items for a rule kind.
 * `points` is the penalty per affected item (machine, site or alert) and `max`
 * caps the total taken by the rule, so a single noisy rule cannot zero a score.
 */
export const RULE_KINDS = [
  "backup.stale",
  "assets.offline",
  "antivirus.unhealthy",
  "updates.pending",
  "network.down",
  "alerts.recent"
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export interface HealthRule {
  readonly id: string;
  readonly kind: RuleKind;
  /** Short French label shown in the score breakdown. */
  readonly label: string;
  /** French sentence template; `{count}` and `{items}` are substituted. */
  readonly detail: string;
  readonly points: number;
  readonly max: number;
  /** backup.stale: a required backup older than this many hours is stale. */
  readonly targetHours?: number;
  /** alerts.recent: alerts at or above this severity are counted. */
  readonly minSeverity?: Severity;
}

export interface HealthRules {
  readonly version: string;
  /** Minimum scores: score >= healthy is "healthy", >= watch is "watch", otherwise "critical". */
  readonly bands: { readonly healthy: number; readonly watch: number };
  /** A machine seen within this many minutes is online. */
  readonly onlineWithinMinutes: number;
  /** Window used for "recent alerts". */
  readonly alertWindowHours: number;
  /** Alerts at or above this severity count as threats in the monthly report. */
  readonly threatMinSeverity: Severity;
  readonly rules: readonly HealthRule[];
}

export const DEFAULT_HEALTH_RULES: HealthRules = {
  version: "2026.11-default",
  bands: { healthy: 80, watch: 50 },
  onlineWithinMinutes: 30,
  alertWindowHours: 24,
  threatMinSeverity: "high",
  rules: [
    {
      id: "backup.stale", kind: "backup.stale", points: 8, max: 20, targetHours: 48,
      label: "Sauvegardes en retard",
      detail: "{count} poste(s) sans sauvegarde récente : {items}."
    },
    {
      id: "assets.offline", kind: "assets.offline", points: 5, max: 15,
      label: "Postes hors ligne",
      detail: "{count} poste(s) injoignable(s) : {items}."
    },
    {
      id: "antivirus.unhealthy", kind: "antivirus.unhealthy", points: 10, max: 25,
      label: "Protection à corriger",
      detail: "{count} poste(s) dont l'antivirus ou le pare-feu n'est pas à jour : {items}."
    },
    {
      id: "updates.pending", kind: "updates.pending", points: 4, max: 15,
      label: "Mises à jour critiques en attente",
      detail: "{count} poste(s) avec des mises à jour critiques en attente : {items}."
    },
    {
      id: "network.down", kind: "network.down", points: 10, max: 20,
      label: "Réseau en panne",
      detail: "{count} site(s) avec la box, le VPN ou Internet en panne : {items}."
    },
    {
      id: "alerts.recent", kind: "alerts.recent", points: 2, max: 10, minSeverity: "high",
      label: "Alertes de sécurité récentes",
      detail: "{count} alerte(s) importante(s) sur la période récente."
    }
  ]
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function nonEmptyString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`health rules: ${where} must be a non-empty string`);
  return value;
}

function boundedInt(value: unknown, where: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`health rules: ${where} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function severity(value: unknown, where: string): Severity {
  if (typeof value !== "string" || !(SEVERITIES as readonly string[]).includes(value)) {
    throw new Error(`health rules: ${where} must be one of ${SEVERITIES.join(", ")}`);
  }
  return value as Severity;
}

/** Validates untrusted configuration (a JSON file) and returns typed rules; throws a descriptive Error. */
export function validateHealthRules(input: unknown): HealthRules {
  if (!isRecord(input)) throw new Error("health rules: the configuration must be a JSON object");
  const bands = input.bands;
  if (!isRecord(bands)) throw new Error("health rules: bands must be an object");
  const healthy = boundedInt(bands.healthy, "bands.healthy", 1, 100);
  const watch = boundedInt(bands.watch, "bands.watch", 0, 99);
  if (watch >= healthy) throw new Error("health rules: bands.watch must be lower than bands.healthy");
  if (!Array.isArray(input.rules) || input.rules.length === 0) throw new Error("health rules: rules must be a non-empty array");

  const seen = new Set<string>();
  const rules = input.rules.map((raw: unknown, index: number): HealthRule => {
    const where = `rules[${index}]`;
    if (!isRecord(raw)) throw new Error(`health rules: ${where} must be an object`);
    const kind = raw.kind;
    if (typeof kind !== "string" || !(RULE_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`health rules: ${where}.kind must be one of ${RULE_KINDS.join(", ")}`);
    }
    const id = nonEmptyString(raw.id, `${where}.id`);
    if (seen.has(id)) throw new Error(`health rules: duplicate rule id "${id}"`);
    seen.add(id);
    return {
      id,
      kind: kind as RuleKind,
      label: nonEmptyString(raw.label, `${where}.label`),
      detail: nonEmptyString(raw.detail, `${where}.detail`),
      points: boundedInt(raw.points, `${where}.points`, 0, 100),
      max: boundedInt(raw.max, `${where}.max`, 0, 100),
      ...(kind === "backup.stale" ? { targetHours: boundedInt(raw.targetHours, `${where}.targetHours`, 1, 24 * 365) } : {}),
      ...(kind === "alerts.recent" ? { minSeverity: severity(raw.minSeverity, `${where}.minSeverity`) } : {})
    };
  });

  return {
    version: nonEmptyString(input.version, "version"),
    bands: { healthy, watch },
    onlineWithinMinutes: boundedInt(input.onlineWithinMinutes, "onlineWithinMinutes", 1, 60 * 24 * 30),
    alertWindowHours: boundedInt(input.alertWindowHours, "alertWindowHours", 1, 24 * 365),
    threatMinSeverity: severity(input.threatMinSeverity, "threatMinSeverity"),
    rules
  };
}
