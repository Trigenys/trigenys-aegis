#!/usr/bin/env bash
# Prépare le labo avant le premier « docker compose up ». Idempotent : chaque étape
# inspecte l'état courant et ne fait rien s'il est déjà conforme.
#
#   1. .env créé depuis .env.example avec des secrets aléatoires (jamais affichés) ;
#   2. configuration Wazuh officielle récupérée au tag épinglé (WAZUH_DOCKER_REF) ;
#   3. certificats générés par le générateur officiel Wazuh ;
#   4. mots de passe de .env appliqués à la configuration Wazuh (hash bcrypt).
#
# Usage : ./setup.sh            (depuis deploy/lab)
set -euo pipefail
# Git Bash (Windows) réécrit les chemins absolus passés à docker : désactivé, sans effet ailleurs.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")"

log()  { printf '[setup] %s\n' "$*"; }
warn() { printf '[setup] ATTENTION : %s\n' "$*" >&2; }
die()  { printf '[setup] ERREUR : %s\n' "$*" >&2; exit 1; }

# --- Prérequis -------------------------------------------------------------
command -v docker >/dev/null || die "docker introuvable."
docker compose version >/dev/null 2>&1 || die "plugin docker compose v2 introuvable."
command -v curl >/dev/null || die "curl introuvable."

if [ -r /proc/sys/vm/max_map_count ]; then
  mmc=$(cat /proc/sys/vm/max_map_count)
  if [ "$mmc" -lt 262144 ]; then
    warn "vm.max_map_count=$mmc (< 262144) : l'indexer Wazuh ne démarrera pas."
    warn "Corriger : sudo sysctl -w vm.max_map_count=262144 et l'ajouter à /etc/sysctl.d/."
  fi
fi

# --- 1. .env ---------------------------------------------------------------
random_secret() {
  # 20 caractères alphanumériques + suffixe garantissant les classes exigées par l'API Wazuh.
  local s
  s=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20 || true)
  printf '%s.Aa9-' "$s"
}

set_env() { # set_env KEY VALUE : remplace la ligne KEY=... dans .env
  local key=$1 value=$2
  sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
}

if [ -f .env ]; then
  log ".env présent : conservé."
else
  cp .env.example .env
  chmod 600 .env
  for key in WAZUH_INDEXER_PASSWORD WAZUH_DASHBOARD_PASSWORD WAZUH_API_PASSWORD \
             GLPI_DB_PASSWORD GLPI_DB_ROOT_PASSWORD; do
    set_env "$key" "$(random_secret)"
  done
  log ".env créé avec des secrets aléatoires. Renseigner LAB_HOSTNAME avant de démarrer."
fi

env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }

WAZUH_VERSION=$(env_get WAZUH_VERSION)
WAZUH_DOCKER_REF=$(env_get WAZUH_DOCKER_REF)
: "${WAZUH_VERSION:?WAZUH_VERSION absent de .env}"
: "${WAZUH_DOCKER_REF:?WAZUH_DOCKER_REF absent de .env}"

if grep -q '^LAB_HOSTNAME=lab.example.invalid' .env; then
  warn "LAB_HOSTNAME vaut encore la valeur d'exemple : les agents MeshCentral ne pourront pas joindre le serveur."
fi

# --- 2. Configuration Wazuh officielle -----------------------------------
CONFIG_DIR=wazuh/config
RAW_BASE="https://raw.githubusercontent.com/wazuh/wazuh-docker/${WAZUH_DOCKER_REF}/single-node/config"
WAZUH_FILES="certs.yml
wazuh_cluster/wazuh_manager.conf
wazuh_dashboard/opensearch_dashboards.yml
wazuh_dashboard/wazuh.yml
wazuh_indexer/internal_users.yml
wazuh_indexer/wazuh.indexer.yml"

if [ -f "$CONFIG_DIR/.ref" ] && [ "$(cat "$CONFIG_DIR/.ref")" = "$WAZUH_DOCKER_REF" ]; then
  log "Configuration Wazuh ${WAZUH_DOCKER_REF} déjà présente."
else
  if [ -f "$CONFIG_DIR/.ref" ]; then
    die "configuration Wazuh présente pour $(cat "$CONFIG_DIR/.ref"), .env demande ${WAZUH_DOCKER_REF}. Montée de version : suivre le guide officiel Wazuh, ne pas écraser."
  fi
  log "Récupération de la configuration Wazuh ${WAZUH_DOCKER_REF}..."
  while IFS= read -r f; do
    mkdir -p "$CONFIG_DIR/$(dirname "$f")"
    curl -fsSL "$RAW_BASE/$f" -o "$CONFIG_DIR/$f" || die "téléchargement impossible : $f"
  done <<< "$WAZUH_FILES"
  printf '%s' "$WAZUH_DOCKER_REF" > "$CONFIG_DIR/.ref"
fi

# --- 3. Certificats ------------------------------------------------------
CERT_DIR="$CONFIG_DIR/wazuh_indexer_ssl_certs"
if [ -f "$CERT_DIR/root-ca.pem" ] && [ -f "$CERT_DIR/wazuh.manager.pem" ]; then
  log "Certificats Wazuh déjà générés."
else
  log "Génération des certificats Wazuh..."
  mkdir -p "$CERT_DIR"
  docker compose --profile setup run --rm wazuh.certs >/dev/null
  [ -f "$CERT_DIR/root-ca.pem" ] || die "le générateur n'a pas produit root-ca.pem."
fi

# --- 4. Mots de passe -> configuration Wazuh ------------------------------
INDEXER_PW=$(env_get WAZUH_INDEXER_PASSWORD)
DASHBOARD_PW=$(env_get WAZUH_DASHBOARD_PASSWORD)
API_PW=$(env_get WAZUH_API_PASSWORD)
case "$INDEXER_PW$DASHBOARD_PW$API_PW" in
  *'$'*|*'|'*|*'"'*) die "les mots de passe Wazuh ne doivent contenir ni « \$ », ni « | », ni guillemet." ;;
esac

fingerprint=$(printf '%s\n%s\n%s' "$INDEXER_PW" "$DASHBOARD_PW" "$API_PW" | sha256sum | cut -d' ' -f1)
MARKER="$CONFIG_DIR/.passwords.sha256"

if [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$fingerprint" ]; then
  log "Mots de passe Wazuh déjà appliqués."
else
  if [ -f "$MARKER" ] && docker volume inspect aegis-lab_wazuh-indexer-data >/dev/null 2>&1; then
    warn "les mots de passe ont changé alors que l'indexer est déjà initialisé :"
    warn "ils ne seront pris en compte qu'après « docker compose down -v » (données du labo perdues)."
  fi
  # shellcheck disable=SC2016 # « $ » littéral : préfixe d'une empreinte bcrypt.
  bcrypt() {
    docker run --rm -e JAVA_HOME=/usr/share/wazuh-indexer/jdk --entrypoint bash \
      "wazuh/wazuh-indexer:${WAZUH_VERSION}" \
      /usr/share/wazuh-indexer/plugins/opensearch-security/tools/hash.sh -p "$1" 2>/dev/null \
      | grep -E '^\$2[aby]\$' | tail -n1
  }
  log "Calcul des empreintes bcrypt (image indexer ${WAZUH_VERSION})..."
  admin_hash=$(bcrypt "$INDEXER_PW" || true)
  [ -n "$admin_hash" ] || die "échec du hash admin (image wazuh/wazuh-indexer:${WAZUH_VERSION} disponible ?)."
  kibana_hash=$(bcrypt "$DASHBOARD_PW" || true)
  [ -n "$kibana_hash" ] || die "échec du hash kibanaserver."

  users="$CONFIG_DIR/wazuh_indexer/internal_users.yml"
  # Remplace la ligne « hash: » qui suit immédiatement l'utilisateur ciblé.
  awk -v a="$admin_hash" -v k="$kibana_hash" '
    /^admin:/        { u="admin" }
    /^kibanaserver:/ { u="kibanaserver" }
    /^[a-z]+:/ && $0 !~ /^(admin|kibanaserver):/ { u="" }
    /^  hash:/ && u=="admin"        { print "  hash: \"" a "\""; u=""; next }
    /^  hash:/ && u=="kibanaserver" { print "  hash: \"" k "\""; u=""; next }
    { print }
  ' "$users" > "$users.tmp" && mv "$users.tmp" "$users"

  sed -i.bak "s|^\( *password:\).*|\1 \"${API_PW}\"|" "$CONFIG_DIR/wazuh_dashboard/wazuh.yml" \
    && rm -f "$CONFIG_DIR/wazuh_dashboard/wazuh.yml.bak"

  printf '%s' "$fingerprint" > "$MARKER"
  log "Mots de passe Wazuh appliqués."
fi

log "Prêt. Démarrer : docker compose up -d   (premier démarrage : 3 à 5 minutes)"
