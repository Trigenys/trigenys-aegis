import { readFileSync } from "node:fs";
import { ASSET_KINDS, type AssetKind } from "../../domain/estate.js";

export interface TrmmSiteMapping {
  readonly trmmSiteName: string;
  readonly aegisSiteId: string;
}

export interface TrmmClientMapping {
  readonly trmmClientId: number;
  /** Expected Tactical RMM client name: a guard against a renumbered or reused client id. */
  readonly trmmClientName: string;
  readonly aegisClientId: string;
  readonly sites: readonly TrmmSiteMapping[];
}

export interface TrmmSyncConfig {
  /** API root, without trailing slash. */
  readonly baseUrl: string;
  /** Name of the environment variable holding the API key; the key itself is never in the file. */
  readonly apiKeyEnv: string;
  readonly fetchWindowsUpdates: boolean;
  readonly backupRequiredKinds: readonly AssetKind[];
  readonly clients: readonly TrmmClientMapping[];
}

export const DEFAULT_TRMM_API_KEY_ENV = "AEGIS_TRMM_API_KEY";

const SECRET_KEYS = /^(api[_-]?key|key|token|secret|password)$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string): never {
  throw new Error(`trmm sync config: ${message}`);
}

function nonEmptyString(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${where} must be a non-empty string`);
  return value.trim();
}

function refuseSecrets(record: Record<string, unknown>, where: string): void {
  for (const key of Object.keys(record)) {
    if (SECRET_KEYS.test(key)) {
      fail(`${where}${key} is not allowed: secrets never go in this file, name an environment variable in apiKeyEnv`);
    }
  }
}

function baseUrl(value: unknown): string {
  const raw = nonEmptyString(value, "baseUrl");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("baseUrl must be an absolute URL");
  }
  if (url.username || url.password) fail("baseUrl must not contain credentials");
  if (url.search || url.hash) fail("baseUrl must not contain a query or fragment");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    fail("baseUrl must use https (http is accepted for localhost only)");
  }
  return url.toString().replace(/\/+$/, "");
}

/** Validates a parsed configuration; every error names the offending path. */
export function validateTrmmSyncConfig(input: unknown): TrmmSyncConfig {
  if (!isRecord(input)) fail("the configuration must be a JSON object");
  refuseSecrets(input, "");

  const apiKeyEnv = input.apiKeyEnv === undefined ? DEFAULT_TRMM_API_KEY_ENV : nonEmptyString(input.apiKeyEnv, "apiKeyEnv");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) fail("apiKeyEnv must be an environment variable name");

  const fetchWindowsUpdates = input.fetchWindowsUpdates ?? true;
  if (typeof fetchWindowsUpdates !== "boolean") fail("fetchWindowsUpdates must be a boolean");

  const kindsInput = input.backupRequiredKinds ?? ["server"];
  if (!Array.isArray(kindsInput)) fail("backupRequiredKinds must be an array");
  const backupRequiredKinds = kindsInput.map((kind: unknown, index: number): AssetKind => {
    if (typeof kind !== "string" || !(ASSET_KINDS as readonly string[]).includes(kind)) {
      fail(`backupRequiredKinds[${index}] must be one of ${ASSET_KINDS.join(", ")}`);
    }
    return kind as AssetKind;
  });

  if (!Array.isArray(input.clients) || input.clients.length === 0) fail("clients must be a non-empty array");
  const trmmIds = new Set<number>();
  const aegisIds = new Set<string>();
  const clients = input.clients.map((raw: unknown, index: number): TrmmClientMapping => {
    const where = `clients[${index}]`;
    if (!isRecord(raw)) fail(`${where} must be an object`);
    refuseSecrets(raw, `${where}.`);
    const trmmClientId = raw.trmmClientId;
    if (typeof trmmClientId !== "number" || !Number.isSafeInteger(trmmClientId) || trmmClientId < 1) {
      fail(`${where}.trmmClientId must be a positive integer`);
    }
    if (trmmIds.has(trmmClientId)) fail(`${where}.trmmClientId ${trmmClientId} is mapped twice`);
    trmmIds.add(trmmClientId);
    const aegisClientId = nonEmptyString(raw.aegisClientId, `${where}.aegisClientId`);
    if (aegisIds.has(aegisClientId)) fail(`${where}.aegisClientId ${aegisClientId} is mapped twice`);
    aegisIds.add(aegisClientId);

    const sitesInput = raw.sites ?? [];
    if (!Array.isArray(sitesInput)) fail(`${where}.sites must be an array`);
    const siteNames = new Set<string>();
    const sites = sitesInput.map((site: unknown, siteIndex: number): TrmmSiteMapping => {
      const siteWhere = `${where}.sites[${siteIndex}]`;
      if (!isRecord(site)) fail(`${siteWhere} must be an object`);
      const trmmSiteName = nonEmptyString(site.trmmSiteName, `${siteWhere}.trmmSiteName`);
      if (siteNames.has(trmmSiteName)) fail(`${siteWhere}.trmmSiteName "${trmmSiteName}" is mapped twice`);
      siteNames.add(trmmSiteName);
      return { trmmSiteName, aegisSiteId: nonEmptyString(site.aegisSiteId, `${siteWhere}.aegisSiteId`) };
    });

    return {
      trmmClientId,
      trmmClientName: nonEmptyString(raw.trmmClientName, `${where}.trmmClientName`),
      aegisClientId,
      sites
    };
  });

  return { baseUrl: baseUrl(input.baseUrl), apiKeyEnv, fetchWindowsUpdates, backupRequiredKinds, clients };
}

/** Reads and validates the configuration file. */
export function loadTrmmSyncConfig(path: string): TrmmSyncConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  return validateTrmmSyncConfig(parsed);
}
