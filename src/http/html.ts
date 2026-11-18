/**
 * Minimal HTML templating where escaping is the default. Every interpolated
 * value is escaped unless it is already a {@link SafeHtml} produced by this
 * module (`html` or `raw`), so event titles, ticket titles and names can never
 * inject markup.
 */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/** Marks a fragment as trusted. Only for constant markup, never for data. */
export function raw(fragment: string): SafeHtml {
  return new SafeHtml(fragment);
}

export type Interpolation = SafeHtml | string | number | null | undefined | false | readonly Interpolation[];

function render(value: Interpolation): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map((item) => render(item as Interpolation)).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, index) => {
    out += render(value) + strings[index + 1]!;
  });
  return new SafeHtml(out);
}
