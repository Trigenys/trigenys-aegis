import { readFileSync } from "node:fs";
import { DEFAULT_HEALTH_RULES, validateHealthRules, type HealthRules } from "../../domain/health-rules.js";

/** Loads and validates the rules override at startup; without a path the built-in defaults apply. */
export function loadHealthRules(path?: string): HealthRules {
  const file = path?.trim();
  if (!file) return DEFAULT_HEALTH_RULES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`health rules: cannot read ${file}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return validateHealthRules(parsed);
}
