import type { NormalizedEventDraft } from "../../domain/event.js";

/**
 * Contract every source adapter implements (Wazuh, FleetDM, Zabbix, ...).
 *
 * An adapter is a pure transformation from one raw source payload to zero or
 * more normalized drafts. It never receives nor sets the client identity and
 * performs no I/O, so it can be replaced without touching the core.
 */
export interface SourceAdapter {
  /** Stable identifier used in the ingestion route, e.g. "wazuh". */
  readonly id: string;
  /** Adapter semantic version, recorded on each event for traceability. */
  readonly version: string;
  /** Throws {@link AdapterError} when the payload is not a recognizable source event. */
  normalize(payload: unknown): NormalizedEventDraft[];
}

export class AdapterError extends Error {
  constructor(readonly adapterId: string, message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

export class SourceAdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  constructor(adapters: readonly SourceAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: SourceAdapter): void {
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(adapter.id)) throw new Error(`invalid adapter id: ${adapter.id}`);
    if (this.adapters.has(adapter.id)) throw new Error(`adapter already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): SourceAdapter | null {
    return this.adapters.get(id) ?? null;
  }
}
