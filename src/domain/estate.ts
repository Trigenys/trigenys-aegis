/**
 * Client estate model: what the cockpit knows about a client's machines,
 * network, contacts and support tickets. Every record belongs to exactly one
 * client; "online" is derived from lastSeenAt and the clock, never stored.
 */

export const ASSET_KINDS = ["workstation", "server"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const PROTECTION_STATES = ["ok", "disabled", "outdated", "unknown"] as const;
export type ProtectionState = (typeof PROTECTION_STATES)[number];

export const LINK_STATES = ["up", "down", "unknown"] as const;
export type LinkState = (typeof LINK_STATES)[number];

export const TICKET_CHANNELS = ["whatsapp", "web"] as const;
export type TicketChannel = (typeof TICKET_CHANNELS)[number];

export type TicketStatus = "open" | "closed";

export interface Asset {
  readonly id: string;
  readonly clientId: string;
  readonly siteId: string | null;
  readonly kind: AssetKind;
  readonly hostname: string;
  readonly os: string;
  readonly hardware: string | null;
  readonly user: string | null;
  readonly lastSeenAt: string;
  readonly antivirus: ProtectionState;
  readonly firewall: ProtectionState;
  readonly pendingUpdates: number;
  readonly criticalUpdates: number;
  readonly lastBackupSuccessAt: string | null;
  readonly backupRequired: boolean;
  /** Identifier of the adapter or tool that reported this record. */
  readonly source: string;
  readonly observedAt: string;
}

export interface SiteNetworkStatus {
  readonly clientId: string;
  readonly siteId: string;
  readonly box: LinkState;
  readonly vpn: LinkState;
  readonly internet: LinkState;
  readonly observedAt: string;
}

export interface Contact {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly role: string;
  readonly phone: string | null;
  readonly email: string | null;
}

export interface Ticket {
  readonly id: string;
  readonly clientId: string;
  readonly siteId: string | null;
  readonly channel: TicketChannel;
  /** Identifier in the channel; with the channel it is the idempotency key within a client. */
  readonly externalRef: string;
  readonly title: string;
  readonly status: TicketStatus;
  readonly openedAt: string;
  readonly closedAt: string | null;
}

export type HealthBand = "healthy" | "watch" | "critical";

export interface HealthPenalty {
  readonly ruleId: string;
  readonly label: string;
  readonly detail: string;
  readonly points: number;
  readonly assetIds: readonly string[];
}

/** A frozen monthly score. Periods are UTC calendar months, `YYYY-MM`. */
export interface HealthSnapshot {
  readonly clientId: string;
  readonly period: string;
  readonly score: number;
  readonly band: HealthBand;
  readonly rulesetVersion: string;
  readonly penalties: readonly HealthPenalty[];
  readonly computedAt: string;
}

export type UpsertResult = "created" | "updated" | "unchanged";
