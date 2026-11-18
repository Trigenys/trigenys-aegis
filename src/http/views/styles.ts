/**
 * Cockpit stylesheet, served as a file from /cockpit/assets/cockpit.css so
 * that the Content-Security-Policy can stay `style-src 'self'` (no inline
 * styles anywhere). Colours are tokens; dark mode follows the system.
 */
export const COCKPIT_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --text: #1c2430;
  --muted: #5d6877;
  --border: #d9dee5;
  --accent: #1f4e8c;
  --ok: #1d7a46;
  --ok-bg: #e4f4ea;
  --warn: #8a5a00;
  --warn-bg: #fdf1d6;
  --bad: #a52a2a;
  --bad-bg: #fbe3e3;
  --radius: 10px;
  --radius-sm: 6px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #11151b;
    --surface: #1a2029;
    --text: #e6eaf0;
    --muted: #9aa5b4;
    --border: #2d3745;
    --accent: #7fb0f0;
    --ok: #6fd09a;
    --ok-bg: #173523;
    --warn: #f0c36a;
    --warn-bg: #3a2d10;
    --bad: #f19090;
    --bad-bg: #3d1c1c;
  }
}
* { box-sizing: border-box; }
html { font-size: 16px; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.5;
}
a { color: var(--accent); }
h1 { font-size: 1.5rem; margin: 0 0 0.25rem; font-weight: 600; }
h2 { font-size: 1.1rem; margin: 0 0 0.75rem; font-weight: 600; }
p { margin: 0 0 0.75rem; }
.muted { color: var(--muted); }
.small { font-size: 0.875rem; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.75rem 1.5rem; background: var(--surface); border-bottom: 1px solid var(--border);
}
.brand { font-weight: 600; text-decoration: none; color: var(--text); }
.topbar form { margin: 0; }
main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 1rem 1.25rem; margin-bottom: 1rem;
}
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-bottom: 1rem; }
.grid .card { margin: 0; }
.stat { font-size: 1.75rem; font-weight: 600; line-height: 1.2; }
.stat-label { color: var(--muted); font-size: 0.875rem; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.55rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--muted); font-weight: 500; font-size: 0.8125rem; }
tr:last-child td { border-bottom: 0; }
.scroll { overflow-x: auto; }
.pill {
  display: inline-block; padding: 0.1rem 0.6rem; border-radius: 999px; font-size: 0.8125rem;
  font-weight: 500; border: 1px solid transparent; white-space: nowrap;
}
.pill.healthy, .pill.up, .pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.watch, .pill.unknown, .pill.outdated { background: var(--warn-bg); color: var(--warn); }
.pill.critical, .pill.down, .pill.disabled { background: var(--bad-bg); color: var(--bad); }
.score { display: flex; align-items: center; gap: 0.6rem; }
.score-value { font-weight: 600; min-width: 2.2rem; }
progress {
  appearance: none; -webkit-appearance: none; width: 120px; height: 8px; border: 0;
  border-radius: 999px; overflow: hidden; background: var(--border);
}
progress::-webkit-progress-bar { background: var(--border); }
progress::-webkit-progress-value { background: var(--accent); }
progress::-moz-progress-bar { background: var(--accent); }
progress.healthy::-webkit-progress-value { background: var(--ok); }
progress.healthy::-moz-progress-bar { background: var(--ok); }
progress.watch::-webkit-progress-value { background: var(--warn); }
progress.watch::-moz-progress-bar { background: var(--warn); }
progress.critical::-webkit-progress-value { background: var(--bad); }
progress.critical::-moz-progress-bar { background: var(--bad); }
.hero { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.hero-score { font-size: 3rem; font-weight: 700; line-height: 1; }
.hero-score small { font-size: 1.25rem; font-weight: 400; color: var(--muted); }
ul.plain { list-style: none; margin: 0; padding: 0; }
ul.plain li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
ul.plain li:last-child { border-bottom: 0; }
.penalty { display: flex; justify-content: space-between; gap: 1rem; }
.points { font-weight: 600; color: var(--bad); white-space: nowrap; }
.crumb { margin-bottom: 0.75rem; font-size: 0.875rem; }
.row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
button, .button {
  font: inherit; cursor: pointer; background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.4rem 0.9rem; text-decoration: none;
}
button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
label { display: block; font-weight: 500; margin-bottom: 0.35rem; }
input[type="password"] {
  font: inherit; width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border);
  border-radius: var(--radius-sm); background: var(--bg); color: var(--text);
}
.login { max-width: 420px; margin: 4rem auto; }
.error { background: var(--bad-bg); color: var(--bad); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; margin-bottom: 1rem; }
.sheet { max-width: 794px; }
.sheet header { border-bottom: 2px solid var(--text); margin-bottom: 1rem; padding-bottom: 0.5rem; }
.sheet footer { border-top: 1px solid var(--border); margin-top: 1.5rem; padding-top: 0.75rem; }
.signature { font-weight: 600; }
.three { display: grid; gap: 1rem; grid-template-columns: repeat(3, 1fr); margin-bottom: 1rem; }
.three div { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem 1rem; }
@media (max-width: 640px) {
  main { padding: 1rem; }
  .three { grid-template-columns: 1fr; }
}
@page { size: A4; margin: 15mm; }
@media print {
  :root { --bg: #fff; --surface: #fff; --text: #000; --muted: #444; --border: #bbb; }
  body { background: #fff; font-size: 11pt; }
  .topbar, .no-print { display: none; }
  main { padding: 0; max-width: none; }
  .card { break-inside: avoid; }
}
`;
