import type { AssetView, ClientDashboard, SiteView } from "../../application/cockpit-service.js";
import { periodOf, previousPeriod } from "../../application/cockpit-service.js";
import type { Ticket } from "../../domain/estate.js";
import { html, type SafeHtml } from "../html.js";
import {
  BAND_LABEL, formatDate, formatDateTime, LINK_LABEL, periodLabel, PROTECTION_LABEL, SEVERITY_LABEL
} from "./format.js";
import { page } from "./layout.js";

function networkRow(label: string, state: "up" | "down" | "unknown"): SafeHtml {
  return html`<span class="pill ${state}">${label} : ${LINK_LABEL[state]}</span>`;
}

function siteCard(site: SiteView): SafeHtml {
  const status = site.network;
  return html`<li>
    <strong>${site.name}</strong>${site.city ? html` <span class="muted">· ${site.city}</span>` : ""}
    <div class="row">${status
    ? [networkRow("Box", status.box), networkRow("VPN", status.vpn), networkRow("Internet", status.internet)]
    : html`<span class="muted small">Pas de mesure réseau.</span>`}</div>
  </li>`;
}

function assetRow(asset: AssetView, labels: ReadonlyMap<string, string>): SafeHtml {
  const backup = asset.backupRequired
    ? (asset.lastBackupSuccessAt ? formatDate(asset.lastBackupSuccessAt) : "Jamais")
    : "Non requise";
  return html`<tr>
    <td>${asset.hostname}<div class="muted small">${asset.kind === "server" ? "Serveur" : "Poste"} · ${asset.os}</div></td>
    <td>${asset.user ?? "—"}</td>
    <td><span class="pill ${asset.online ? "up" : "down"}">${asset.online ? "En ligne" : "Hors ligne"}</span></td>
    <td><span class="pill ${asset.antivirus}">Antivirus : ${PROTECTION_LABEL[asset.antivirus]}</span>
        <span class="pill ${asset.firewall}">Pare-feu : ${PROTECTION_LABEL[asset.firewall]}</span></td>
    <td>${asset.pendingUpdates} (dont ${asset.criticalUpdates} critique(s))</td>
    <td>${backup}</td>
    <td>${asset.findings.length === 0
    ? html`<span class="muted">Rien</span>`
    : asset.findings.map((id) => html`<div>${labels.get(id) ?? id}</div>`)}</td>
  </tr>`;
}

function ticketRow(ticket: Ticket): SafeHtml {
  return html`<li><strong>${ticket.title}</strong>
    <div class="muted small">${ticket.channel === "whatsapp" ? "WhatsApp" : "Web"} · ouverte le ${formatDateTime(ticket.openedAt)}</div></li>`;
}

export function clientPage(dashboard: ClientDashboard): string {
  const { client, score, band } = dashboard;
  const labels = new Map(dashboard.penalties.map((penalty) => [penalty.ruleId, penalty.label]));
  const now = new Date(dashboard.generatedAt);
  const thisMonth = periodOf(now);
  const lastMonth = previousPeriod(thisMonth);
  const removed = dashboard.penalties.reduce((sum, penalty) => sum + penalty.points, 0);
  return page(client.name, html`
<p class="crumb"><a href="/cockpit">← Parc clients</a></p>
<h1>${client.name}</h1>
<p class="muted small">Mis à jour le ${formatDateTime(dashboard.generatedAt)}.</p>

<div class="card">
  <h2>Pourquoi ${score} ?</h2>
  <div class="hero">
    <div class="hero-score">${score}<small> / 100</small></div>
    <div>
      <span class="pill ${band}">${BAND_LABEL[band]}</span>
      <p class="muted small">${dashboard.previousScore === null
    ? "Première mesure : pas de mois précédent à comparer."
    : html`Fin ${periodLabel(lastMonth)} : ${dashboard.previousScore} / 100.`}</p>
    </div>
  </div>
  <p>Le score part de 100. Chaque point de contrôle ci-dessous retire des points${removed > 0 ? html` (${removed} au total)` : ""}.</p>
  ${dashboard.penalties.length === 0
    ? html`<p>Rien à corriger : tous les points de contrôle sont au vert.</p>`
    : html`<ul class="plain">${dashboard.penalties.map((penalty) => html`<li class="penalty">
      <div><strong>${penalty.label}</strong><div class="muted">${penalty.detail}</div></div>
      <div class="points">−${penalty.points}</div></li>`)}</ul>`}
  <p class="muted small">Règles : version ${dashboard.rulesetVersion}.</p>
  <p class="no-print"><a class="button" href="/cockpit/clients/${client.id}/report?period=${thisMonth}">Rapport de ${periodLabel(thisMonth)}</a>
    <a class="button" href="/cockpit/clients/${client.id}/report?period=${lastMonth}">Rapport de ${periodLabel(lastMonth)}</a></p>
</div>

<div class="card">
  <h2>Sites</h2>
  ${dashboard.sites.length === 0 ? html`<p class="muted">Aucun site déclaré.</p>` : html`<ul class="plain">${dashboard.sites.map(siteCard)}</ul>`}
</div>

<div class="card">
  <h2>Postes et serveurs</h2>
  ${dashboard.assets.length === 0 ? html`<p class="muted">Aucun poste remonté pour l'instant.</p>` : html`<div class="scroll"><table>
    <thead><tr><th>Machine</th><th>Utilisateur</th><th>État</th><th>Protection</th><th>Mises à jour</th><th>Dernière sauvegarde</th><th>À corriger</th></tr></thead>
    <tbody>${dashboard.assets.map((asset) => assetRow(asset, labels))}</tbody></table></div>`}
</div>

<div class="card">
  <h2>Alertes de sécurité des ${dashboard.alertWindowHours} dernières heures</h2>
  ${dashboard.alerts.length === 0 ? html`<p class="muted">Aucune alerte.</p>` : html`<ul class="plain">${dashboard.alerts.map((alert) => html`<li>
    <span class="pill ${alert.severity === "critical" || alert.severity === "high" ? "critical" : "watch"}">${SEVERITY_LABEL[alert.severity]}</span>
    ${alert.title}${alert.hostname ? html` <span class="muted">· ${alert.hostname}</span>` : ""}
    <div class="muted small">${formatDateTime(alert.receivedAt)}</div></li>`)}</ul>`}
</div>

<div class="card">
  <h2>Demandes en cours</h2>
  ${dashboard.openTickets.length === 0 ? html`<p class="muted">Aucune demande en cours.</p>` : html`<ul class="plain">${dashboard.openTickets.map(ticketRow)}</ul>`}
</div>

<div class="card">
  <h2>Contacts</h2>
  ${dashboard.contacts.length === 0 ? html`<p class="muted">Aucun contact enregistré.</p>` : html`<ul class="plain">${dashboard.contacts.map((contact) => html`<li>
    <strong>${contact.name}</strong> <span class="muted">· ${contact.role}</span>
    <div class="small">${contact.phone ?? ""}${contact.phone && contact.email ? " · " : ""}${contact.email ?? ""}</div></li>`)}</ul>`}
</div>`);
}
