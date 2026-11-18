import type { Asset, HealthBand, HealthPenalty, SiteNetworkStatus } from "./estate.js";
import { SEVERITIES, type Severity } from "./event.js";
import type { HealthRule, HealthRules } from "./health-rules.js";

export interface HealthInput {
  readonly assets: readonly Asset[];
  readonly sites: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly network: readonly SiteNetworkStatus[];
  /** Alert counts over the rules' alert window. */
  readonly alertsBySeverity: Readonly<Record<Severity, number>>;
}

export interface HealthResult {
  readonly score: number;
  readonly band: HealthBand;
  readonly rulesetVersion: string;
  readonly penalties: readonly HealthPenalty[];
  /** Rule ids that apply to each asset, for per-machine status in the views. */
  readonly assetFindings: Readonly<Record<string, readonly string[]>>;
}

interface Hit {
  readonly count: number;
  readonly items: readonly string[];
  readonly assetIds: readonly string[];
}

const HOURS = 3_600_000;
const MINUTES = 60_000;

export function isOnline(asset: Pick<Asset, "lastSeenAt">, rules: HealthRules, now: Date): boolean {
  return now.getTime() - Date.parse(asset.lastSeenAt) <= rules.onlineWithinMinutes * MINUTES;
}

export function bandOf(score: number, rules: HealthRules): HealthBand {
  if (score >= rules.bands.healthy) return "healthy";
  return score >= rules.bands.watch ? "watch" : "critical";
}

function ofAssets(assets: readonly Asset[]): Hit {
  return { count: assets.length, items: assets.map((a) => a.hostname), assetIds: assets.map((a) => a.id) };
}

/** One evaluator per rule kind: it only counts affected items; weights and thresholds come from the rule. */
const EVALUATORS: Record<HealthRule["kind"], (rule: HealthRule, input: HealthInput, rules: HealthRules, now: Date) => Hit> = {
  "backup.stale": (rule, input, _rules, now) => ofAssets(input.assets.filter((asset) =>
    asset.backupRequired && (asset.lastBackupSuccessAt === null
      || now.getTime() - Date.parse(asset.lastBackupSuccessAt) > (rule.targetHours ?? 0) * HOURS))),
  "assets.offline": (_rule, input, rules, now) => ofAssets(input.assets.filter((asset) => !isOnline(asset, rules, now))),
  "antivirus.unhealthy": (_rule, input) => ofAssets(input.assets.filter((asset) =>
    asset.antivirus !== "ok" || asset.firewall !== "ok")),
  "updates.pending": (_rule, input) => ofAssets(input.assets.filter((asset) => asset.criticalUpdates > 0)),
  "network.down": (_rule, input) => {
    const names = new Map(input.sites.map((site) => [site.id, site.name]));
    const down = input.network.filter((status) => status.box === "down" || status.vpn === "down" || status.internet === "down");
    return { count: down.length, items: down.map((s) => names.get(s.siteId) ?? s.siteId), assetIds: [] };
  },
  "alerts.recent": (rule, input) => {
    const from = SEVERITIES.indexOf(rule.minSeverity ?? "high");
    const count = SEVERITIES.reduce((sum, severity, index) => sum + (index >= from ? input.alertsBySeverity[severity] : 0), 0);
    return { count, items: [], assetIds: [] };
  }
};

const MAX_LISTED = 3;

function render(template: string, hit: Hit): string {
  const shown = hit.items.slice(0, MAX_LISTED).join(", ");
  const items = hit.items.length > MAX_LISTED ? `${shown} et ${hit.items.length - MAX_LISTED} autre(s)` : shown;
  return template.replaceAll("{count}", String(hit.count)).replaceAll("{items}", items);
}

/** score = max(0, 100 - sum of penalties); each rule is capped by its own `max`. Pure and deterministic. */
export function computeHealth(input: HealthInput, rules: HealthRules, now: Date): HealthResult {
  const penalties: HealthPenalty[] = [];
  const findings = new Map<string, string[]>();
  for (const rule of rules.rules) {
    const hit = EVALUATORS[rule.kind](rule, input, rules, now);
    const points = Math.min(rule.max, hit.count * rule.points);
    if (hit.count === 0 || points === 0) continue;
    penalties.push({ ruleId: rule.id, label: rule.label, detail: render(rule.detail, hit), points, assetIds: hit.assetIds });
    for (const assetId of hit.assetIds) findings.set(assetId, [...(findings.get(assetId) ?? []), rule.id]);
  }
  penalties.sort((a, b) => b.points - a.points || (a.ruleId < b.ruleId ? -1 : 1));
  const score = Math.max(0, 100 - penalties.reduce((sum, p) => sum + p.points, 0));
  return {
    score,
    band: bandOf(score, rules),
    rulesetVersion: rules.version,
    penalties,
    assetFindings: Object.fromEntries(findings)
  };
}
