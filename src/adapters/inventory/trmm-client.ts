import type { TrmmAgent, TrmmClient, TrmmWinUpdate } from "./trmm-types.js";

/** Read-only subset of the Tactical RMM REST API used by the inventory sync. */
export interface TrmmApi {
  listClients(): Promise<TrmmClient[]>;
  /** Every agent of the client (the endpoint is not paginated). */
  listAgents(trmmClientId: number): Promise<TrmmAgent[]>;
  listWinUpdates(agentId: string): Promise<TrmmWinUpdate[]>;
}

/**
 * Failure of a call to the Tactical RMM API. The message holds the method, the
 * path and the HTTP status only: never a header, the API key or the base URL.
 * status is 0 when the server could not be reached or timed out.
 */
export class TrmmApiError extends Error {
  constructor(readonly status: number, readonly path: string, detail: string) {
    super(`Tactical RMM GET ${path} failed: ${detail}`);
    this.name = "TrmmApiError";
  }

  /** True for rejected credentials (401/403). */
  get unauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface TrmmApiOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export const DEFAULT_TRMM_TIMEOUT_MS = 15_000;

export function createTrmmApi(options: TrmmApiOptions): TrmmApi {
  const doFetch = options.fetch ?? fetch;
  const root = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TRMM_TIMEOUT_MS;

  async function getArray(path: string): Promise<Record<string, unknown>[]> {
    let response: Response;
    try {
      response = await doFetch(root + path, {
        method: "GET",
        headers: { "X-API-KEY": options.apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new TrmmApiError(0, path, timedOut ? `no response within ${timeoutMs} ms` : "server unreachable");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new TrmmApiError(response.status, path, `HTTP ${response.status}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new TrmmApiError(response.status, path, "response is not JSON");
    }
    if (!Array.isArray(body) || !body.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))) {
      throw new TrmmApiError(response.status, path, "unexpected response shape (expected an array of objects)");
    }
    return body as Record<string, unknown>[];
  }

  return {
    async listClients() {
      const clients = await getArray("/clients/");
      if (!clients.every((client) => typeof client.id === "number" && typeof client.name === "string")) {
        throw new TrmmApiError(200, "/clients/", "unexpected response shape (client without id or name)");
      }
      return clients as unknown as TrmmClient[];
    },
    async listAgents(trmmClientId) {
      return (await getArray(`/agents/?client=${encodeURIComponent(String(trmmClientId))}`)) as unknown as TrmmAgent[];
    },
    async listWinUpdates(agentId) {
      return (await getArray(`/winupdate/${encodeURIComponent(agentId)}/`)) as unknown as TrmmWinUpdate[];
    }
  };
}
