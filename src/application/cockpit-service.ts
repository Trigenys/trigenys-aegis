import type { Asset, Contact, HealthBand, HealthPenalty, HealthSnapshot, SiteNetworkStatus, Ticket } from "../domain/estate.js";
import { SEVERITIES, type NormalizedEvent, type Severity } from "../domain/event.js";
import { bandOf, computeHealth, isOnline, type HealthResult } from "../domain/health.js";
import type { HealthRules } from "../domain/health-rules.js";
import { DomainError, type Client, type Site } from "../domain/tenancy.js";
import type { EstateStore, EventStore, HealthSnapshotStore, SupportStore } from "../ports/stores.js";
import type { Clock, TenancyService } from "./tenancy-service.js";

export interface CockpitReadDeps {
  tenancy: TenancyService;
  events: EventStore;
  estate: EstateStore;
  support: SupportStore;
  snapshots: HealthSnapshotStore;
  rules: HealthRules;
  clock: Clock;
}

export interface ClientSummary {
  readonly clientId: string;
  readonly name: string;
  readonly score: number;
  readonly band: HealthBand;
  readonly sites: number;
  readonly assets: number;
  readonly assetsOnline: number;
  readonly openTickets: number;
  /** Alerts at or above the configured threat severity within the alert window. */
  readonly recentAlerts: number;
  /** Largest penalty, in the rule's words; null when nothing is wrong. */
  readonly mainIssue: string | null;
}

export interface Overview {
  readonly generatedAt: string;
  readonly alertWindowHours: number;
  readonly totals: {
    readonly clients: number;
    readonly healthy: number;
    readonly watch: number;
    readonly critical: number;
    readonly openTickets: number;
    readonly recentAlerts: number;
  };
  /** Weakest score first. */
  readonly clients: readonly ClientSummary[];
}

export interface AssetView extends Asset {
  readonly online: boolean;
  /** Ids of the health rules that currently penalise this machine. */
  readonly findings: readonly string[];
}

export interface SiteView extends Site {
  readonly network: SiteNetworkStatus | null;
}

export interface AlertView {
  readonly eventId: string;
  readonly title: string;
  readonly severity: Severity;
  readonly receivedAt: string;
  readonly hostname: string | null;
}

export interface ClientDashboard {
  readonly generatedAt: string;
  readonly client: Client;
  readonly score: number;
  readonly band: HealthBand;
  readonly rulesetVersion: string;
  readonly penalties: readonly HealthPenalty[];
  readonly previousScore: number | null;
  readonly sites: readonly SiteView[];
  readonly assets: readonly AssetView[];
  readonly contacts: readonly Contact[];
  readonly openTickets: readonly Ticket[];
  readonly alertWindowHours: number;
  readonly alerts: readonly AlertView[];
}

export interface MonthlyReport {
  readonly generatedAt: string;
  readonly client: Client;
  readonly period: string;
  /** "snapshot" when the month was closed, "live" for a month still in progress. */
  readonly basis: "snapshot" | "live";
  readonly score: number;
  readonly band: HealthBand;
  readonly previousScore: number | null;
  readonly rulesetVersion: string;
  readonly requestsHandled: number;
  readonly threatsHandled: number;
  readonly backups: { readonly ok: number; readonly required: number };
  readonly done: readonly string[];
  readonly attention: readonly HealthPenalty[];
}

export interface CloseMonthResult {
  readonly period: string;
  readonly created: boolean;
  readonly snapshot: HealthSnapshot;
}

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const HOURS = 3_600_000;

/** Parses `YYYY-MM` into its UTC calendar-month bounds. Months are UTC, so a report never depends on the host timezone. */
export function monthBounds(period: string): { start: Date; end: Date } {
  const match = typeof period === "string" ? PERIOD.exec(period) : null;
  if (!match) throw new DomainError("INVALID_PERIOD", "period must be a month formatted YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

export function previousPeriod(period: string): string {
  const { start } = monthBounds(period);
  const previous = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  return `${previous.getUTCFullYear().toString().padStart(4, "0")}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodOf(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Read models for the operator cockpit, the client view and the monthly report. Reads only, except closeMonth. */
export class CockpitReadService {
  constructor(private readonly deps: CockpitReadDeps) {}

  get rules(): HealthRules {
    return this.deps.rules;
  }

  async overview(): Promise<Overview> {
    const now = this.deps.clock.now();
    const clients = await this.deps.tenancy.listClients();
    const summaries: ClientSummary[] = [];
    for (const client of clients) {
      const state = await this.state(client.id, now);
      const openTickets = await this.deps.support.listTickets(client.id, { status: "open" });
      summaries.push({
        clientId: client.id,
        name: client.name,
        score: state.health.score,
        band: state.health.band,
        sites: state.sites.length,
        assets: state.assets.length,
        assetsOnline: state.assets.filter((asset) => isOnline(asset, this.deps.rules, now)).length,
        openTickets: openTickets.length,
        recentAlerts: this.threatCount(state.alerts),
        mainIssue: state.health.penalties[0]?.detail ?? null
      });
    }
    summaries.sort((a, b) => a.score - b.score || (a.name < b.name ? -1 : 1));
    const count = (band: HealthBand) => summaries.filter((s) => s.band === band).length;
    return {
      generatedAt: now.toISOString(),
      alertWindowHours: this.deps.rules.alertWindowHours,
      totals: {
        clients: summaries.length,
        healthy: count("healthy"),
        watch: count("watch"),
        critical: count("critical"),
        openTickets: summaries.reduce((sum, s) => sum + s.openTickets, 0),
        recentAlerts: summaries.reduce((sum, s) => sum + s.recentAlerts, 0)
      },
      clients: summaries
    };
  }

  async clientDashboard(clientId: string): Promise<ClientDashboard> {
    const now = this.deps.clock.now();
    const client = await this.deps.tenancy.getClient(clientId);
    const state = await this.state(clientId, now);
    const network = new Map(state.network.map((status) => [status.siteId, status]));
    const previous = await this.deps.snapshots.getSnapshot(clientId, previousPeriod(periodOf(now)));
    const recent = await this.deps.events.list(clientId, {
      limit: 10,
      since: this.windowStart(now),
      categories: ["security_alert"]
    });
    return {
      generatedAt: now.toISOString(),
      client,
      score: state.health.score,
      band: state.health.band,
      rulesetVersion: state.health.rulesetVersion,
      penalties: state.health.penalties,
      previousScore: previous?.score ?? null,
      sites: state.sites.map((site) => ({ ...site, network: network.get(site.id) ?? null })),
      assets: state.assets.map((asset) => ({
        ...asset,
        online: isOnline(asset, this.deps.rules, now),
        findings: state.health.assetFindings[asset.id] ?? []
      })),
      contacts: await this.deps.support.listContacts(clientId),
      openTickets: await this.deps.support.listTickets(clientId, { status: "open" }),
      alertWindowHours: this.deps.rules.alertWindowHours,
      alerts: recent.map(toAlertView)
    };
  }

  async monthlyReport(clientId: string, period: string): Promise<MonthlyReport> {
    const now = this.deps.clock.now();
    const { start, end } = monthBounds(period);
    if (start.getTime() > now.getTime()) throw new DomainError("INVALID_PERIOD", "period is in the future");
    const client = await this.deps.tenancy.getClient(clientId);
    const stored = await this.deps.snapshots.getSnapshot(clientId, period);
    const state = await this.state(clientId, now);
    const previous = await this.deps.snapshots.getSnapshot(clientId, previousPeriod(period));
    const closed = await this.deps.support.listTickets(clientId, {
      status: "closed",
      closedSince: start.toISOString(),
      closedUntil: end.toISOString()
    });
    const counts = await this.deps.events.countBySeverity(clientId, {
      since: start.toISOString(),
      until: end.toISOString(),
      category: "security_alert"
    });
    const score = stored?.score ?? state.health.score;
    const targetHours = this.deps.rules.rules.find((rule) => rule.kind === "backup.stale")?.targetHours;
    const required = state.assets.filter((asset) => asset.backupRequired);
    const backedUp = required.filter((asset) => asset.lastBackupSuccessAt !== null
      && (targetHours === undefined || now.getTime() - Date.parse(asset.lastBackupSuccessAt) <= targetHours * HOURS));
    return {
      generatedAt: now.toISOString(),
      client,
      period,
      basis: stored ? "snapshot" : "live",
      score,
      band: stored?.band ?? bandOf(score, this.deps.rules),
      previousScore: previous?.score ?? null,
      rulesetVersion: stored?.rulesetVersion ?? state.health.rulesetVersion,
      requestsHandled: closed.length,
      threatsHandled: this.threatCount(counts),
      backups: { ok: backedUp.length, required: required.length },
      done: closed.map((ticket) => ticket.title),
      attention: stored?.penalties ?? state.health.penalties
    };
  }

  /** Freezes the month's score. Idempotent: an already closed month is returned untouched. */
  async closeMonth(clientId: string, period: string): Promise<CloseMonthResult> {
    const now = this.deps.clock.now();
    const { start } = monthBounds(period);
    if (start.getTime() > now.getTime()) throw new DomainError("INVALID_PERIOD", "period is in the future");
    await this.deps.tenancy.getClient(clientId);
    const existing = await this.deps.snapshots.getSnapshot(clientId, period);
    if (existing) return { period, created: false, snapshot: existing };
    const { health } = await this.state(clientId, now);
    const snapshot: HealthSnapshot = {
      clientId,
      period,
      score: health.score,
      band: health.band,
      rulesetVersion: health.rulesetVersion,
      penalties: health.penalties,
      computedAt: now.toISOString()
    };
    const inserted = await this.deps.snapshots.putSnapshot(clientId, snapshot);
    if (inserted) return { period, created: true, snapshot };
    // Lost a race with a concurrent close: the stored snapshot is authoritative.
    const stored = await this.deps.snapshots.getSnapshot(clientId, period);
    return { period, created: false, snapshot: stored ?? snapshot };
  }

  private windowStart(now: Date): string {
    return new Date(now.getTime() - this.deps.rules.alertWindowHours * HOURS).toISOString();
  }

  private threatCount(counts: Readonly<Record<Severity, number>>): number {
    const from = SEVERITIES.indexOf(this.deps.rules.threatMinSeverity);
    return SEVERITIES.reduce((sum, severity, index) => sum + (index >= from ? counts[severity] : 0), 0);
  }

  private async state(clientId: string, now: Date): Promise<{
    sites: Site[]; assets: Asset[]; network: SiteNetworkStatus[]; alerts: Record<Severity, number>; health: HealthResult;
  }> {
    const sites = await this.deps.tenancy.listSites(clientId);
    const assets = await this.deps.estate.listAssets(clientId);
    const network = await this.deps.estate.listSiteNetwork(clientId);
    // `until` is exclusive: one millisecond past now includes an alert received this very instant.
    const alerts = await this.deps.events.countBySeverity(clientId, {
      since: this.windowStart(now),
      until: new Date(now.getTime() + 1).toISOString(),
      category: "security_alert"
    });
    const health = computeHealth({ assets, sites, network, alertsBySeverity: alerts }, this.deps.rules, now);
    return { sites, assets, network, alerts, health };
  }
}

function toAlertView(event: NormalizedEvent): AlertView {
  return {
    eventId: event.id,
    title: event.title,
    severity: event.severity,
    receivedAt: event.receivedAt,
    hostname: event.asset?.hostname ?? null
  };
}
