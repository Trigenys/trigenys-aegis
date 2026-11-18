import { InMemoryEventStore, InMemoryTenancyStore } from "./adapters/persistence/memory.js";
import { openPostgresPersistence } from "./adapters/persistence/postgres.js";
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
  readonly kind: "memory" | "postgres";
  readonly tenancyStore: TenancyStore;
  readonly eventStore: EventStore;
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
    return { kind: "postgres", tenancyStore: postgres.tenancyStore, eventStore: postgres.eventStore, close: postgres.close };
  }
  return {
    kind: "memory",
    tenancyStore: new InMemoryTenancyStore(),
    eventStore: new InMemoryEventStore(),
    close: async () => {}
  };
}
