import { AdapterError, type SourceAdapterRegistry } from "../adapters/sources/contract.js";
import { sourceRecordId } from "../domain/estate.js";
import { validateDraft, type NormalizedEvent } from "../domain/event.js";
import { DomainError, type CredentialScope, type Principal } from "../domain/tenancy.js";
import type { EventStore } from "../ports/stores.js";
import { systemClock, type Clock } from "./tenancy-service.js";

export interface IngestResult {
  readonly accepted: number;
  readonly duplicates: number;
  readonly eventIds: readonly string[];
}

export const MAX_LIST_LIMIT = 200;

/**
 * Ingestion and read paths. Both take the authenticated {@link Principal}:
 * the client and site are taken from it and never from the payload.
 */
export class IngestionService {
  constructor(
    private readonly adapters: SourceAdapterRegistry,
    private readonly events: EventStore,
    private readonly clock: Clock = systemClock
  ) {}

  async ingest(principal: Principal, sourceId: string, payload: unknown): Promise<IngestResult> {
    requireScope(principal, "events:ingest");
    const adapter = this.adapters.get(sourceId);
    if (!adapter) throw new DomainError("UNKNOWN_SOURCE", `no adapter for source "${sourceId}"`);

    let drafts;
    try {
      drafts = adapter.normalize(payload);
    } catch (error) {
      if (error instanceof AdapterError) throw new DomainError("INVALID_PAYLOAD", error.message);
      throw error;
    }

    // Validate the whole batch before writing anything: all or nothing.
    drafts.forEach((draft, index) => {
      const violations = validateDraft(draft);
      if (violations.length > 0) {
        throw new DomainError("INVALID_EVENT", `event[${index}]: ${violations.join("; ")}`);
      }
    });

    const receivedAt = this.clock.now().toISOString();
    const eventIds: string[] = [];
    let accepted = 0;
    let duplicates = 0;
    for (const draft of drafts) {
      const event: NormalizedEvent = {
        ...draft,
        id: eventId(principal.clientId, draft.source.type, draft.source.eventId),
        clientId: principal.clientId,
        siteId: principal.siteId,
        receivedAt
      };
      if (await this.events.append(principal.clientId, event)) accepted += 1;
      else duplicates += 1;
      eventIds.push(event.id);
    }
    return { accepted, duplicates, eventIds };
  }

  async listEvents(principal: Principal, limit = 50): Promise<NormalizedEvent[]> {
    requireScope(principal, "events:read");
    const bounded = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_LIST_LIMIT);
    return this.events.list(principal.clientId, { limit: bounded });
  }

  async getEvent(principal: Principal, eventId: string): Promise<NormalizedEvent | null> {
    requireScope(principal, "events:read");
    return this.events.get(principal.clientId, eventId);
  }
}

/**
 * Deterministic id: replaying the same source event for the same client is a
 * no-op, while identical source ids from two clients never collide.
 */
export function eventId(clientId: string, sourceType: string, sourceEventId: string): string {
  return sourceRecordId(clientId, sourceType, sourceEventId);
}

function requireScope(principal: Principal, scope: CredentialScope): void {
  if (!principal.scopes.includes(scope)) throw new DomainError("FORBIDDEN", `missing scope ${scope}`);
}
