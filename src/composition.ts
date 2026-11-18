import { InMemoryEventStore, InMemoryTenancyStore } from "./adapters/persistence/memory.js";
import { openSqlitePersistence } from "./adapters/persistence/sqlite.js";
import { SourceAdapterRegistry, type SourceAdapter } from "./adapters/sources/contract.js";
import { WazuhAdapter } from "./adapters/sources/wazuh.js";
import { IngestionService } from "./application/ingestion-service.js";
import { systemClock, TenancyService, type Clock } from "./application/tenancy-service.js";
import type { OperatorAuthenticator } from "./domain/operator.js";
import type { EventStore, TenancyStore } from "./ports/stores.js";

export const DEFAULT_SOURCE_ADAPTERS: readonly SourceAdapter[] = [new WazuhAdapter()];

export interface CockpitOptions {
  tenancyStore?: TenancyStore;
  eventStore?: EventStore;
  adapters?: readonly SourceAdapter[];
  clock?: Clock;
  operators?: OperatorAuthenticator;
}

/** Wires the core with injected adapters; defaults to the volatile in-memory stores. */
export function createCockpit(options: CockpitOptions = {}) {
  const clock = options.clock ?? systemClock;
  const tenancy = new TenancyService(options.tenancyStore ?? new InMemoryTenancyStore(), clock);
  const ingestion = new IngestionService(
    new SourceAdapterRegistry(options.adapters ?? DEFAULT_SOURCE_ADAPTERS),
    options.eventStore ?? new InMemoryEventStore(),
    clock
  );
  return { tenancy, ingestion, operators: options.operators };
}

export interface Persistence {
  readonly kind: "memory" | "sqlite";
  readonly tenancyStore: TenancyStore;
  readonly eventStore: EventStore;
  close(): void;
}

/**
 * Selects the store adapters from configuration: a SQLite file when a path is
 * given (durable), otherwise volatile in-memory stores (tests, local trials).
 */
export function openPersistence(databasePath?: string): Persistence {
  const path = databasePath?.trim();
  if (path) {
    const sqlite = openSqlitePersistence(path);
    return { kind: "sqlite", tenancyStore: sqlite.tenancyStore, eventStore: sqlite.eventStore, close: sqlite.close };
  }
  return { kind: "memory", tenancyStore: new InMemoryTenancyStore(), eventStore: new InMemoryEventStore(), close: () => {} };
}
