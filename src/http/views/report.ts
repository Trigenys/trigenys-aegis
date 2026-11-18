import type { MonthlyReport } from "../../application/cockpit-service.js";
import { previousPeriod } from "../../application/cockpit-service.js";
import { html } from "../html.js";
import { BAND_LABEL, formatDateTime, periodLabel } from "./format.js";
import { page } from "./layout.js";

function trend(report: MonthlyReport): string {
  if (report.previousScore === null) return "Première mesure : pas de mois précédent à comparer.";
  const delta = report.score - report.previousScore;
  const base = `Fin ${periodLabel(previousPeriod(report.period))} : ${report.previousScore} / 100`;
  if (delta === 0) return `${base}. Score stable.`;
  return `${base}. ${delta > 0 ? "En hausse" : "En baisse"} de ${Math.abs(delta)} point(s).`;
}

/** One printable A4 page, signed Trigenys Group. */
export function reportPage(report: MonthlyReport): string {
  return page(`Rapport ${periodLabel(report.period)}`, html`
<p class="crumb no-print"><a href="/cockpit/clients/${report.client.id}">← ${report.client.name}</a>
  · <a href="/cockpit/clients/${report.client.id}/report?period=${previousPeriod(report.period)}">Mois précédent</a>
  · Imprimez cette page (Ctrl+P) pour l'envoyer au client.</p>
<article class="card sheet">
  <header>
    <h1>Rapport mensuel · ${periodLabel(report.period)}</h1>
    <div>${report.client.name}</div>
    ${report.basis === "live" ? html`<div class="muted small">Mois en cours : chiffres provisoires.</div>` : ""}
  </header>

  <section>
    <div class="hero">
      <div class="hero-score">${report.score}<small> / 100</small></div>
      <div><span class="pill ${report.band}">${BAND_LABEL[report.band]}</span>
        <p class="muted">${trend(report)}</p></div>
    </div>
  </section>

  <section class="three">
    <div><div class="stat">${report.requestsHandled}</div><div class="stat-label">Demandes traitées</div></div>
    <div><div class="stat">${report.threatsHandled}</div><div class="stat-label">Menaces détectées et traitées</div></div>
    <div><div class="stat">${report.backups.ok} / ${report.backups.required}</div><div class="stat-label">Postes sauvegardés dans l'objectif</div></div>
  </section>

  <section>
    <h2>Ce que nous avons fait</h2>
    ${report.done.length === 0
    ? html`<p class="muted">Aucune demande clôturée ce mois-ci.</p>`
    : html`<ul>${report.done.map((title) => html`<li>${title}</li>`)}</ul>`}
  </section>

  <section>
    <h2>À surveiller</h2>
    ${report.attention.length === 0
    ? html`<p>Rien à signaler : tous les points de contrôle sont au vert.</p>`
    : html`<ul>${report.attention.map((penalty) => html`<li><strong>${penalty.label}.</strong> ${penalty.detail}</li>`)}</ul>`}
  </section>

  <footer>
    <div class="signature">Trigenys Group</div>
    <div class="muted small">Rapport établi le ${formatDateTime(report.generatedAt)} · règles ${report.rulesetVersion}</div>
  </footer>
</article>`);
}
