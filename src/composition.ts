import { InMemoryEventStore, InMemoryTenancyStore } from "./adapters/persistence/memory.js";
import { SourceAdapterRegistry, type SourceAdapter } from "./adapters/sources/contract.js";
import { WazuhAdapter } from "./adapters/sources/wazuh.js";
import { IngestionService } from "./application/ingestion-service.js";
import { systemClock, TenancyService, type Clock } from "./application/tenancy-service.js";
import type { EventStore, TenancyStore } from "./ports/stores.js";

export const DEFAULT_SOURCE_ADAPTERS: readonly SourceAdapter[] = [new WazuhAdapter()];

export interface CockpitOptions {
  tenancyStore?: TenancyStore;
  eventStore?: EventStore;
  adapters?: readonly SourceAdapter[];
  clock?: Clock;
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
  return { tenancy, ingestion };
}
