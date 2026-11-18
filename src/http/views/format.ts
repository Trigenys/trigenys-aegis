import type { HealthBand, LinkState, ProtectionState } from "../../domain/estate.js";

const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
});
const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });

/** All instants are shown in UTC and say so; the cockpit never guesses the reader's timezone. */
export function formatDateTime(iso: string): string {
  return `${DATE_TIME.format(new Date(iso))} UTC`;
}

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** `2026-11` becomes "novembre 2026". */
export function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number) as [number, number];
  return MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
}

export const BAND_LABEL: Record<HealthBand, string> = {
  healthy: "Sain",
  watch: "À surveiller",
  critical: "Critique"
};

export const PROTECTION_LABEL: Record<ProtectionState, string> = {
  ok: "À jour",
  disabled: "Désactivé",
  outdated: "Périmé",
  unknown: "Inconnu"
};

export const LINK_LABEL: Record<LinkState, string> = { up: "Fonctionne", down: "En panne", unknown: "Inconnu" };

export const SEVERITY_LABEL: Record<string, string> = {
  info: "Information", low: "Faible", medium: "Moyenne", high: "Élevée", critical: "Critique"
};

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}
