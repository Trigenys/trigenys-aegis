import { monthBounds, periodOf, previousPeriod } from "../application/cockpit-service.js";
import { eventId } from "../application/ingestion-service.js";
import type { Asset, Contact, HealthBand, HealthSnapshot, SiteNetworkStatus, Ticket, UpsertResult } from "../domain/estate.js";
import { EVENT_SCHEMA_VERSION, type NormalizedEvent } from "../domain/event.js";
import { DomainError, nameKey, type Client, type Site } from "../domain/tenancy.js";
import type { EstateStore, EventStore, HealthSnapshotStore, SupportStore, TenancyStore } from "../ports/stores.js";
import { DEMO_CLIENTS, demoId } from "./demo-data.js";

export interface DemoStores {
  readonly tenancyStore: TenancyStore;
  readonly eventStore: EventStore;
  readonly estateStore: EstateStore;
  readonly supportStore: SupportStore;
  readonly snapshotStore: HealthSnapshotStore;
}

export interface DemoSeedReport {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Total number of writes that changed state; 0 on a replay with the same instant. */
  readonly writes: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function demoSeedAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.AEGIS_ALLOW_DEMO_SEED === "1";
}

/**
 * Loads three fictional SMEs. Refused unless AEGIS_ALLOW_DEMO_SEED=1, and refused
 * when the target already holds a client that is not part of the demo, so it can
 * never pollute real data. Everything is relative to `asOf`; replaying with the
 * same instant writes nothing.
 */
export async function seedDemo(stores: DemoStores, asOf: Date, env: NodeJS.ProcessEnv): Promise<DemoSeedReport> {
  if (!demoSeedAllowed(env)) {
    throw new DomainError("FORBIDDEN", "demo seed refused: set AEGIS_ALLOW_DEMO_SEED=1 to allow it");
  }
  if (Number.isNaN(asOf.getTime())) throw new DomainError("INVALID_PERIOD", "as-of must be a valid date");

  const demoNames = new Set(DEMO_CLIENTS.map((client) => nameKey(client.name)));
  const existing = await stores.tenancyStore.listClients();
  if (existing.some((client) => !demoNames.has(nameKey(client.name)))) {
    throw new DomainError("FORBIDDEN", "demo seed refused: the target already holds non-demo clients");
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const count = (result: UpsertResult | boolean): void => {
    if (result === true || result === "created") created += 1;
    else if (result === "updated") updated += 1;
    else unchanged += 1;
  };

  const asOfMs = asOf.getTime();
  const iso = (ms: number): string => new Date(ms).toISOString();
  const thisMonth = periodOf(asOf);
  const monthStart = monthBounds(thisMonth).start.getTime();
  const lastPeriod = previousPeriod(thisMonth);

  for (const spec of DEMO_CLIENTS) {
    let client = existing.find((candidate) => nameKey(candidate.name) === nameKey(spec.name)) ?? null;
    if (client) {
      unchanged += 1;
    } else {
      const fresh: Client = { id: demoId(`client:${spec.name}`), name: spec.name, createdAt: iso(asOfMs - 90 * DAY) };
      await stores.tenancyStore.insertClient(fresh);
      client = fresh;
      created += 1;
    }
    const clientId = client.id;

    const knownSites = await stores.tenancyStore.listSites(clientId);
    const siteIds = new Map<string, string>();
    for (const siteSpec of spec.sites) {
      const found = knownSites.find((site) => nameKey(site.name) === nameKey(siteSpec.name));
      if (found) {
        siteIds.set(siteSpec.key, found.id);
        unchanged += 1;
        continue;
      }
      const site: Site = {
        id: demoId(`site:${spec.name}:${siteSpec.key}`), clientId, name: siteSpec.name,
        city: siteSpec.city, createdAt: iso(asOfMs - 90 * DAY)
      };
      await stores.tenancyStore.insertSite(site);
      siteIds.set(siteSpec.key, site.id);
      created += 1;
    }
    const siteOf = (key: string | null): string | null => (key === null ? null : (siteIds.get(key) ?? null));

    for (const a of spec.assets) {
      const asset: Asset = {
        id: demoId(`asset:${spec.name}:${a.key}`), clientId, siteId: siteOf(a.site), kind: a.kind,
        hostname: a.hostname, os: a.os, hardware: a.hardware, user: a.user,
        lastSeenAt: iso(asOfMs - a.seenMinutesAgo * MINUTE),
        antivirus: a.antivirus, firewall: a.firewall,
        pendingUpdates: a.pendingUpdates, criticalUpdates: a.criticalUpdates,
        lastBackupSuccessAt: a.backupHoursAgo === null ? null : iso(asOfMs - a.backupHoursAgo * HOUR),
        backupRequired: a.backupRequired, source: "demo", observedAt: iso(asOfMs)
      };
      count(await stores.estateStore.upsertAsset(clientId, asset));
    }

    for (const n of spec.network) {
      const siteId = siteOf(n.site);
      if (siteId === null) continue;
      const status: SiteNetworkStatus = { clientId, siteId, box: n.box, vpn: n.vpn, internet: n.internet, observedAt: iso(asOfMs) };
      count(await stores.estateStore.upsertSiteNetwork(clientId, status));
    }

    for (const c of spec.contacts) {
      const contact: Contact = {
        id: demoId(`contact:${spec.name}:${c.key}`), clientId, name: c.name, role: c.role, phone: c.phone, email: c.email
      };
      count(await stores.supportStore.upsertContact(clientId, contact));
    }

    for (const t of spec.tickets) {
      let closedAtMs: number | null = null;
      if (t.closedLastMonthDaysBeforeEnd !== undefined) closedAtMs = monthStart - t.closedLastMonthDaysBeforeEnd * DAY;
      else if (t.closedDaysAgo !== null) closedAtMs = asOfMs - t.closedDaysAgo * DAY;
      let openedAtMs = asOfMs - t.openedDaysAgo * DAY;
      if (closedAtMs !== null && openedAtMs > closedAtMs - 2 * DAY) openedAtMs = closedAtMs - 2 * DAY;
      const ticket: Ticket = {
        id: demoId(`ticket:${spec.name}:${t.ref}`), clientId, siteId: siteOf(t.site), channel: t.channel,
        externalRef: t.ref, title: t.title, status: closedAtMs === null ? "open" : "closed",
        openedAt: iso(openedAtMs), closedAt: closedAtMs === null ? null : iso(closedAtMs)
      };
      count(await stores.supportStore.upsertTicket(clientId, ticket));
    }

    for (const alert of spec.alerts) {
      const receivedMs = alert.hoursAgo !== undefined
        ? asOfMs - alert.hoursAgo * HOUR
        : monthStart - (alert.lastMonthDaysBeforeEnd ?? 1) * DAY;
      const sourceEventId = `demo-${alert.ref}`;
      const event: NormalizedEvent = {
        schemaVersion: EVENT_SCHEMA_VERSION,
        id: eventId(clientId, "wazuh", sourceEventId),
        clientId,
        siteId: siteOf(alert.site),
        receivedAt: iso(receivedMs),
        source: { type: "wazuh", adapterVersion: "1.0.0", eventId: sourceEventId },
        category: "security_alert",
        severity: alert.severity,
        occurredAt: iso(receivedMs),
        title: alert.title,
        asset: { id: null, hostname: alert.hostname, ip: null },
        rule: null,
        attributes: {}
      };
      count(await stores.eventStore.append(clientId, event));
    }

    const band: HealthBand = spec.previousMonthScore >= 80 ? "healthy" : spec.previousMonthScore >= 50 ? "watch" : "critical";
    const snapshot: HealthSnapshot = {
      clientId, period: lastPeriod, score: spec.previousMonthScore, band, rulesetVersion: "demo",
      penalties: [], computedAt: iso(monthStart)
    };
    count(await stores.snapshotStore.putSnapshot(clientId, snapshot));
  }

  return { created, updated, unchanged, writes: created + updated };
}
