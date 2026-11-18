/**
 * Client (tenant) and site model.
 *
 * A client's identity is never read from event content: it is attached to a
 * source credential and resolved server-side when a request authenticates.
 */

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface Site {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly createdAt: string;
}

export const CREDENTIAL_SCOPES = ["events:ingest", "events:read"] as const;
export type CredentialScope = (typeof CREDENTIAL_SCOPES)[number];

/** Persisted form of a credential: the secret itself is never stored. */
export interface StoredCredential {
  readonly id: string;
  readonly clientId: string;
  /** When set, every event ingested with this credential belongs to this site. */
  readonly siteId: string | null;
  readonly scopes: readonly CredentialScope[];
  /** SHA-256 of the full token, hex encoded. */
  readonly secretHash: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** The server-side principal established from an authenticated credential. */
export interface Principal {
  readonly credentialId: string;
  readonly clientId: string;
  readonly siteId: string | null;
  readonly scopes: readonly CredentialScope[];
}

export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}
