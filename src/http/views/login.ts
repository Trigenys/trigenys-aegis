import { html } from "../html.js";
import { page } from "./layout.js";

export function loginPage(error?: string): string {
  return page("Connexion", html`<div class="card login">
  <h1>Connexion au cockpit</h1>
  <p class="muted">Réservé à l'équipe d'exploitation. Saisissez votre jeton d'opérateur.</p>
  ${error && html`<p class="error" role="alert">${error}</p>`}
  <form method="post" action="/cockpit/login">
    <label for="token">Jeton d'opérateur</label>
    <p><input id="token" name="token" type="password" autocomplete="off" required></p>
    <button class="primary" type="submit">Se connecter</button>
  </form>
</div>`, false);
}
