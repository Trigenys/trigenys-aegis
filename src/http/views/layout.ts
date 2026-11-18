import { html, type SafeHtml } from "../html.js";

export const STYLESHEET_PATH = "/cockpit/assets/cockpit.css";

/** Full page shell. `signedIn` shows the navigation and the logout button. */
export function page(title: string, body: SafeHtml, signedIn = true): string {
  return html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>${title} · Trigenys Aegis</title>
<link rel="stylesheet" href="${STYLESHEET_PATH}">
</head>
<body>
<div class="topbar">
  <a class="brand" href="/cockpit">Trigenys Aegis</a>
  ${signedIn && html`<nav class="row">
    <a href="/cockpit">Parc clients</a>
    <form method="post" action="/cockpit/logout"><button type="submit">Se déconnecter</button></form>
  </nav>`}
</div>
<main>
${body}
</main>
</body>
</html>
`.value;
}

export function errorPage(status: number, message: string, signedIn: boolean): string {
  return page(`Erreur ${status}`, html`<div class="card">
  <h1>${message}</h1>
  <p><a href="/cockpit">Retour au parc clients</a></p>
</div>`, signedIn);
}
