/**
 * Shapes returned by the Tactical RMM REST API, limited to the fields the
 * inventory sync reads. Field names are the API's own. Everything the sync does
 * not strictly need is optional or nullable: older agents and partial records
 * must map to defaults, never crash the sync.
 */

export interface TrmmSite {
  readonly id: number;
  readonly name: string;
  readonly client?: number | null;
  readonly agent_count?: number | null;
}

export interface TrmmClient {
  readonly id: number;
  readonly name: string;
  readonly sites?: readonly TrmmSite[] | null;
}

export interface TrmmChecksSummary {
  readonly total?: number | null;
  readonly passing?: number | null;
  readonly failing?: number | null;
  readonly warning?: number | null;
  readonly info?: number | null;
  readonly has_failing_checks?: boolean | null;
}

export interface TrmmCustomField {
  readonly id?: number | null;
  readonly field?: number | null;
  readonly agent?: number | null;
  readonly value?: unknown;
}

export interface TrmmAgent {
  readonly agent_id: string;
  readonly hostname: string;
  readonly client_name?: string | null;
  readonly site_name?: string | null;
  readonly monitoring_type?: string | null;
  readonly plat?: string | null;
  readonly operating_system?: string | null;
  readonly last_seen?: string | null;
  readonly status?: string | null;
  readonly needs_reboot?: boolean | null;
  readonly has_patches_pending?: boolean | null;
  readonly logged_username?: string | null;
  readonly make_model?: string | null;
  readonly cpu_model?: unknown;
  readonly serial_number?: string | null;
  readonly public_ip?: string | null;
  readonly local_ips?: string | null;
  readonly checks?: TrmmChecksSummary | null;
  readonly custom_fields?: readonly TrmmCustomField[] | null;
  readonly maintenance_mode?: boolean | null;
  readonly boot_time?: number | null;
  readonly version?: string | null;
}

export interface TrmmWinUpdate {
  readonly kb?: string | null;
  readonly title?: string | null;
  /** "Critical", "Important", "Moderate", "Low" or null. */
  readonly severity?: string | null;
  readonly installed?: boolean | null;
  /** "approve", "ignore", "nothing", "inherit"... */
  readonly action?: string | null;
  readonly date_installed?: string | null;
}
