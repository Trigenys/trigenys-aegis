import { createHash } from "node:crypto";
import type { LinkState, ProtectionState, TicketChannel } from "../domain/estate.js";
import type { Severity } from "../domain/event.js";

/**
 * Declarative demonstration data. Every company, person, address and number is
 * fictional (reserved `.test` domain, non-routable phone numbers). Dates are
 * expressed relative to the `asOf` instant so that the demo always looks
 * current and re-seeding with the same `--as-of` writes nothing.
 */
export interface DemoAsset {
  readonly key: string;
  readonly site: string;
  readonly kind: "workstation" | "server";
  readonly hostname: string;
  readonly os: string;
  readonly hardware: string;
  readonly user: string | null;
  readonly seenMinutesAgo: number;
  readonly antivirus: ProtectionState;
  readonly firewall: ProtectionState;
  readonly pendingUpdates: number;
  readonly criticalUpdates: number;
  /** Hours since the last successful backup; null for never. */
  readonly backupHoursAgo: number | null;
  readonly backupRequired: boolean;
}

export interface DemoClient {
  readonly name: string;
  readonly sites: ReadonlyArray<{ readonly key: string; readonly name: string; readonly city: string }>;
  readonly assets: readonly DemoAsset[];
  readonly network: ReadonlyArray<{ readonly site: string; readonly box: LinkState; readonly vpn: LinkState; readonly internet: LinkState }>;
  readonly contacts: ReadonlyArray<{ readonly key: string; readonly name: string; readonly role: string; readonly phone: string; readonly email: string }>;
  readonly tickets: ReadonlyArray<{
    readonly ref: string;
    readonly site: string | null;
    readonly channel: TicketChannel;
    readonly title: string;
    /** Days before asOf that the ticket was opened. */
    readonly openedDaysAgo: number;
    /** Closed this many days before asOf, or null while open. */
    readonly closedDaysAgo: number | null;
    /** Closed in the calendar month before asOf's (overrides closedDaysAgo): days before that month ended. */
    readonly closedLastMonthDaysBeforeEnd?: number;
  }>;
  /** Security alerts in the last hours, and in the previous month (for the report). */
  readonly alerts: ReadonlyArray<{
    readonly ref: string;
    readonly site: string | null;
    readonly severity: Severity;
    readonly title: string;
    readonly hostname: string;
    readonly hoursAgo?: number;
    readonly lastMonthDaysBeforeEnd?: number;
  }>;
  /** Score closed for the previous month, so the report shows a trend. */
  readonly previousMonthScore: number;
}

/** Stable UUID-shaped id derived from a key: the same demo key is the same id on every run and every machine. */
export function demoId(key: string): string {
  const hex = createHash("sha256").update(`trigenys-aegis-demo:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const WIN = "Windows 11 Pro";
const SRV = "Windows Server 2022";

export const DEMO_CLIENTS: readonly DemoClient[] = [
  {
    name: "Cabinet A",
    sites: [{ key: "akwa", name: "Cabinet Akwa", city: "Douala" }],
    assets: [
      { key: "a1", site: "akwa", kind: "server", hostname: "CABA-SRV", os: SRV, hardware: "Serveur tour", user: null, seenMinutesAgo: 2, antivirus: "ok", firewall: "ok", pendingUpdates: 1, criticalUpdates: 0, backupHoursAgo: 6, backupRequired: true },
      { key: "a2", site: "akwa", kind: "workstation", hostname: "CABA-ACCUEIL", os: WIN, hardware: "Portable 15 pouces", user: "Accueil", seenMinutesAgo: 4, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0, backupHoursAgo: 10, backupRequired: true },
      { key: "a3", site: "akwa", kind: "workstation", hostname: "CABA-COMPTA", os: WIN, hardware: "Poste fixe", user: "Comptabilité", seenMinutesAgo: 3, antivirus: "ok", firewall: "ok", pendingUpdates: 3, criticalUpdates: 1, backupHoursAgo: 8, backupRequired: true },
      { key: "a4", site: "akwa", kind: "workstation", hostname: "CABA-DIRECTION", os: WIN, hardware: "Portable 14 pouces", user: "Direction", seenMinutesAgo: 6, antivirus: "ok", firewall: "ok", pendingUpdates: 1, criticalUpdates: 1, backupHoursAgo: 70, backupRequired: true },
      { key: "a5", site: "akwa", kind: "workstation", hostname: "CABA-ARCHIVES", os: WIN, hardware: "Poste fixe", user: null, seenMinutesAgo: 600, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0, backupHoursAgo: 12, backupRequired: false },
      { key: "a6", site: "akwa", kind: "workstation", hostname: "CABA-STAGIAIRE", os: WIN, hardware: "Portable 14 pouces", user: "Stagiaire", seenMinutesAgo: 9, antivirus: "outdated", firewall: "ok", pendingUpdates: 2, criticalUpdates: 0, backupHoursAgo: 20, backupRequired: true }
    ],
    network: [{ site: "akwa", box: "up", vpn: "up", internet: "up" }],
    contacts: [
      { key: "c1", name: "Awa Mbarga", role: "Dirigeante", phone: "+237 600 00 00 01", email: "direction@cabinet-a.exemple.test" },
      { key: "c2", name: "Paul Essomba", role: "Référent informatique", phone: "+237 600 00 00 02", email: "paul@cabinet-a.exemple.test" }
    ],
    tickets: [
      { ref: "WA-1001", site: "akwa", channel: "whatsapp", title: "L'imprimante de l'accueil n'imprime plus", openedDaysAgo: 1, closedDaysAgo: null },
      { ref: "WA-0990", site: "akwa", channel: "whatsapp", title: "Mot de passe de la messagerie oublié", openedDaysAgo: 40, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 8 },
      { ref: "WEB-0412", site: "akwa", channel: "web", title: "Installation du poste du stagiaire", openedDaysAgo: 45, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 3 },
      { ref: "WA-0985", site: null, channel: "whatsapp", title: "Lenteur du Wi-Fi en salle d'attente", openedDaysAgo: 50, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 12 }
    ],
    alerts: [
      { ref: "A-1", site: "akwa", severity: "high", title: "Tentatives de connexion répétées sur le serveur", hostname: "CABA-SRV", hoursAgo: 5 },
      { ref: "A-2", site: "akwa", severity: "medium", title: "Programme inconnu bloqué sur un poste", hostname: "CABA-STAGIAIRE", hoursAgo: 9 },
      { ref: "A-3", site: "akwa", severity: "high", title: "Fichier malveillant mis en quarantaine", hostname: "CABA-ACCUEIL", lastMonthDaysBeforeEnd: 6 },
      { ref: "A-4", site: "akwa", severity: "critical", title: "Tentative de chiffrement de fichiers stoppée", hostname: "CABA-COMPTA", lastMonthDaysBeforeEnd: 15 }
    ],
    previousMonthScore: 61
  },
  {
    name: "Labo B",
    sites: [{ key: "bastos", name: "Laboratoire Bastos", city: "Yaoundé" }],
    assets: [
      { key: "b1", site: "bastos", kind: "server", hostname: "LABB-SRV", os: SRV, hardware: "Serveur rack", user: null, seenMinutesAgo: 1, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0, backupHoursAgo: 3, backupRequired: true },
      { key: "b2", site: "bastos", kind: "workstation", hostname: "LABB-ANALYSE1", os: WIN, hardware: "Poste fixe", user: "Analyses", seenMinutesAgo: 2, antivirus: "ok", firewall: "ok", pendingUpdates: 2, criticalUpdates: 1, backupHoursAgo: 9, backupRequired: true },
      { key: "b3", site: "bastos", kind: "workstation", hostname: "LABB-ANALYSE2", os: WIN, hardware: "Poste fixe", user: "Analyses", seenMinutesAgo: 5, antivirus: "ok", firewall: "ok", pendingUpdates: 1, criticalUpdates: 1, backupHoursAgo: 9, backupRequired: true },
      { key: "b4", site: "bastos", kind: "workstation", hostname: "LABB-SECRETARIAT", os: WIN, hardware: "Portable 15 pouces", user: "Secrétariat", seenMinutesAgo: 7, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0, backupHoursAgo: 15, backupRequired: true }
    ],
    network: [{ site: "bastos", box: "up", vpn: "up", internet: "up" }],
    contacts: [
      { key: "c1", name: "Samuel Tchoumi", role: "Directeur", phone: "+237 600 00 00 11", email: "direction@labo-b.exemple.test" }
    ],
    tickets: [
      { ref: "WA-2001", site: "bastos", channel: "whatsapp", title: "Ajouter une adresse e-mail pour la nouvelle biologiste", openedDaysAgo: 0, closedDaysAgo: null },
      { ref: "WA-1980", site: "bastos", channel: "whatsapp", title: "Scanner du secrétariat à reconnecter", openedDaysAgo: 35, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 10 },
      { ref: "WEB-0733", site: "bastos", channel: "web", title: "Sauvegarde mensuelle : vérification de restauration", openedDaysAgo: 38, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 4 }
    ],
    alerts: [
      { ref: "B-1", site: "bastos", severity: "high", title: "Tentative d'accès à distance refusée", hostname: "LABB-SRV", lastMonthDaysBeforeEnd: 9 }
    ],
    previousMonthScore: 90
  },
  {
    name: "Clinique C",
    sites: [
      { key: "accueil", name: "Clinique Bonanjo", city: "Douala" },
      { key: "pharmacie", name: "Pharmacie annexe", city: "Douala" }
    ],
    assets: [
      { key: "c1", site: "accueil", kind: "server", hostname: "CLIC-SRV", os: SRV, hardware: "Serveur tour", user: null, seenMinutesAgo: 3, antivirus: "ok", firewall: "ok", pendingUpdates: 4, criticalUpdates: 2, backupHoursAgo: 130, backupRequired: true },
      { key: "c2", site: "accueil", kind: "workstation", hostname: "CLIC-ACCUEIL", os: WIN, hardware: "Poste fixe", user: "Accueil", seenMinutesAgo: 5, antivirus: "disabled", firewall: "ok", pendingUpdates: 2, criticalUpdates: 1, backupHoursAgo: 14, backupRequired: true },
      { key: "c3", site: "accueil", kind: "workstation", hostname: "CLIC-MEDECIN1", os: WIN, hardware: "Portable 14 pouces", user: "Dr Fotso", seenMinutesAgo: 12, antivirus: "ok", firewall: "disabled", pendingUpdates: 3, criticalUpdates: 1, backupHoursAgo: null, backupRequired: true },
      { key: "c4", site: "accueil", kind: "workstation", hostname: "CLIC-MEDECIN2", os: WIN, hardware: "Portable 14 pouces", user: "Dr Nkoulou", seenMinutesAgo: 2000, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0, backupHoursAgo: 20, backupRequired: true },
      { key: "c5", site: "pharmacie", kind: "workstation", hostname: "CLIC-PHARMA1", os: WIN, hardware: "Poste fixe", user: "Pharmacie", seenMinutesAgo: 3000, antivirus: "disabled", firewall: "ok", pendingUpdates: 1, criticalUpdates: 0, backupHoursAgo: 100, backupRequired: true }
    ],
    network: [
      { site: "accueil", box: "up", vpn: "up", internet: "up" },
      { site: "pharmacie", box: "up", vpn: "down", internet: "up" }
    ],
    contacts: [
      { key: "c1", name: "Nadine Ewane", role: "Directrice administrative", phone: "+237 600 00 00 21", email: "administration@clinique-c.exemple.test" },
      { key: "c2", name: "Jean Fotso", role: "Médecin référent", phone: "+237 600 00 00 22", email: "j.fotso@clinique-c.exemple.test" }
    ],
    tickets: [
      { ref: "WA-3003", site: "pharmacie", channel: "whatsapp", title: "Le poste de la pharmacie ne se connecte plus au dossier patient", openedDaysAgo: 2, closedDaysAgo: null },
      { ref: "WA-3001", site: "accueil", channel: "whatsapp", title: "Écran du poste d'accueil qui clignote", openedDaysAgo: 6, closedDaysAgo: null },
      { ref: "WEB-0901", site: "accueil", channel: "web", title: "Création de deux comptes pour les nouvelles infirmières", openedDaysAgo: 33, closedDaysAgo: null, closedLastMonthDaysBeforeEnd: 5 }
    ],
    alerts: [
      { ref: "C-1", site: "accueil", severity: "critical", title: "Tentatives de connexion répétées depuis l'étranger", hostname: "CLIC-SRV", hoursAgo: 3 },
      { ref: "C-2", site: "pharmacie", severity: "high", title: "Antivirus désactivé détecté", hostname: "CLIC-PHARMA1", hoursAgo: 7 },
      { ref: "C-3", site: "accueil", severity: "high", title: "Pièce jointe suspecte ouverte", hostname: "CLIC-ACCUEIL", hoursAgo: 15 },
      { ref: "C-4", site: "accueil", severity: "critical", title: "Logiciel de rançon bloqué", hostname: "CLIC-MEDECIN1", lastMonthDaysBeforeEnd: 11 },
      { ref: "C-5", site: "accueil", severity: "high", title: "Accès non autorisé aux dossiers refusé", hostname: "CLIC-SRV", lastMonthDaysBeforeEnd: 20 }
    ],
    previousMonthScore: 38
  }
];
