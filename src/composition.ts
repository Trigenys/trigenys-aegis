import {
  InMemoryEstateStore, InMemoryEventStore, InMemorySnapshotStore, InMemorySupportStore, InMemoryTenancyStore
} from "./adapters/persistence/memory.js";
import { openPostgresPersistence } from "./adapters/persistence/postgres.js";
import { SourceAdapterRegistry, type SourceAdapter } from "./adapters/sources/contract.js";
import { WazuhAdapter } from "./adapters/sources/wazuh.js";
import { CockpitReadService } from "./application/cockpit-service.js";
import { IngestionService } from "./application/ingestion-service.js";
import { OperatorSessions } from "./application/operator-sessions.js";
import { systemClock, TenancyService, type Clock } from "./application/tenancy-service.js";
import { DEFAULT_HEALTH_RULES, type HealthRules } from "./domain/health-rules.js";
import type { OperatorAuthenticator } from "./domain/operator.js";
import type { EstateStore, EventStore, HealthSnapshotStore, SupportStore, TenancyStore } from "./ports/stores.js";

export const DEFAULT_SOURCE_ADAPTERS: readonly SourceAdapter[] = [new WazuhAdapter()];

export interface CockpitOptions {
  tenancyStore?: TenancyStore;
  eventStore?: EventStore;
  estateStore?: EstateStore;
  supportStore?: SupportStore;
  snapshotStore?: HealthSnapshotStore;
  healthRules?: HealthRules;
  /** Lifetime of an operator browser session, in milliseconds (default 8 hours). */
  sessionTtlMs?: number;
  adapters?: readonly SourceAdapter[];
  clock?: Clock;
  operators?: OperatorAuthenticator;
}

/** Wires the core with injected adapters; defaults to the volatile in-memory stores. */
export function createCockpit(options: CockpitOptions = {}) {
  const clock = options.clock ?? systemClock;
  const tenancyStore = options.tenancyStore ?? new InMemoryTenancyStore();
  const eventStore = options.eventStore ?? new InMemoryEventStore();
  const estateStore = options.estateStore ?? new InMemoryEstateStore(tenancyStore);
  const supportStore = options.supportStore ?? new InMemorySupportStore(tenancyStore);
  const snapshotStore = options.snapshotStore ?? new InMemorySnapshotStore(tenancyStore);
  const tenancy = new TenancyService(tenancyStore, clock);
  const ingestion = new IngestionService(
    new SourceAdapterRegistry(options.adapters ?? DEFAULT_SOURCE_ADAPTERS),
    eventStore,
    clock
  );
  const cockpit = new CockpitReadService({
    tenancy, events: eventStore, estate: estateStore, support: supportStore, snapshots: snapshotStore,
    rules: options.healthRules ?? DEFAULT_HEALTH_RULES, clock
  });
  const sessions = new OperatorSessions({ clock, ttlMs: options.sessionTtlMs });
  return {
    tenancy, ingestion, operators: options.operators, cockpit, sessions, clock,
    stores: { tenancyStore, eventStore, estateStore, supportStore, snapshotStore }
  };
}

export interface Persistence {
  readonly kind: "memory" | "postgres";
  readonly tenancyStore: TenancyStore;
  readonly eventStore: EventStore;
  readonly estateStore: EstateStore;
  readonly supportStore: SupportStore;
  readonly snapshotStore: HealthSnapshotStore;
  close(): Promise<void>;
}

/**
 * Selects the store adapters from configuration: PostgreSQL when a connection
 * string is given (durable, row-level security), otherwise volatile in-memory
 * stores (tests, local trials).
 */
export async function openPersistence(databaseUrl?: string): Promise<Persistence> {
  const url = databaseUrl?.trim();
  if (url) {
    const postgres = await openPostgresPersistence(url);
    return {
      kind: "postgres",
      tenancyStore: postgres.tenancyStore,
      eventStore: postgres.eventStore,
      estateStore: postgres.estateStore,
      supportStore: postgres.supportStore,
      snapshotStore: postgres.snapshotStore,
      close: postgres.close
    };
  }
  const tenancyStore = new InMemoryTenancyStore();
  return {
    kind: "memory",
    tenancyStore,
    eventStore: new InMemoryEventStore(),
    estateStore: new InMemoryEstateStore(tenancyStore),
    supportStore: new InMemorySupportStore(tenancyStore),
    snapshotStore: new InMemorySnapshotStore(tenancyStore),
    close: async () => {}
  };
}
