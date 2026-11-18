import type { ClientSummary, Overview } from "../../application/cockpit-service.js";
import { html, type SafeHtml } from "../html.js";
import { BAND_LABEL, formatDateTime } from "./format.js";
import { page } from "./layout.js";

export function scoreCell(score: number, band: ClientSummary["band"]): SafeHtml {
  return html`<div class="score">
    <span class="score-value">${score}</span>
    <progress class="${band}" max="100" value="${score}" aria-label="Score ${score} sur 100"></progress>
    <span class="pill ${band}">${BAND_LABEL[band]}</span>
  </div>`;
}

function row(client: ClientSummary): SafeHtml {
  return html`<tr>
    <td><a href="/cockpit/clients/${client.clientId}">${client.name}</a></td>
    <td>${scoreCell(client.score, client.band)}</td>
    <td>${client.assetsOnline} / ${client.assets}</td>
    <td>${client.openTickets}</td>
    <td>${client.recentAlerts}</td>
    <td>${client.mainIssue ?? html`<span class="muted">Rien à signaler</span>`}</td>
  </tr>`;
}

export function overviewPage(overview: Overview): string {
  const { totals } = overview;
  return page("Parc clients", html`
<h1>Parc clients</h1>
<p class="muted small">Mis à jour le ${formatDateTime(overview.generatedAt)}. Les clients les plus fragiles sont en tête.</p>
<div class="grid">
  <div class="card"><div class="stat">${totals.clients}</div><div class="stat-label">Clients suivis</div></div>
  <div class="card"><div class="stat">${totals.watch + totals.critical}</div><div class="stat-label">À traiter (à surveiller ou critique)</div></div>
  <div class="card"><div class="stat">${totals.openTickets}</div><div class="stat-label">Demandes en cours</div></div>
  <div class="card"><div class="stat">${totals.recentAlerts}</div><div class="stat-label">Alertes importantes des ${overview.alertWindowHours} dernières heures</div></div>
</div>
<div class="card">
${overview.clients.length === 0
    ? html`<p class="muted">Aucun client pour l'instant.</p>`
    : html`<div class="scroll"><table>
  <thead><tr><th>Client</th><th>Santé</th><th>Postes en ligne</th><th>Demandes en cours</th><th>Alertes</th><th>À corriger en priorité</th></tr></thead>
  <tbody>${overview.clients.map(row)}</tbody>
</table></div>`}
</div>`);
}
