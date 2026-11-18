# Labo de démonstration : informatique gérée pour PME

Labo pour montrer aux PME prospectées l'offre d'informatique gérée décidée au comex du 2026-11-18
(`docs/decisions/comex-log.md`) : une PME simulée derrière un pare-feu, pilotée à distance avec des
briques open source, avant l'arrivée du cockpit unifié Aegis.

| Brique | Rôle dans la démo | Où |
|---|---|---|
| **Wazuh** 4.14.10 (manager, indexer, dashboard) | Sécurité : alertes, inventaire, vulnérabilités, conformité | `compose.yaml` |
| **MeshCentral** 1.3.1 | Prise en main à distance avec consentement, gestion des postes | `compose.yaml` |
| **GLPI** 12.0.2 + MariaDB 11.8.9 | Parc, tickets d'assistance | `compose.yaml` |
| **OPNsense** 26.7 | Pare-feu de la PME, journaux vers Wazuh | VM : [`opnsense-vm.md`](opnsense-vm.md) |

Licences et obligations commerciales : [`LICENSES.md`](LICENSES.md). Tactical RMM est exclu.

> **Règles du labo**
> - Ne rien installer sur le VPS partagé (3,7 Go de RAM) : le labo exige un serveur dédié (voir plus bas).
> - Données fictives uniquement. Aucun poste ni réseau réel d'un client.
> - Chez un client, aucune action à distance sans son accord : la démo le montre avec le consentement
>   MeshCentral.

## 1. Prérequis matériels

Budget mémoire des conteneurs (limites dans `compose.yaml`, réglables dans `.env`) :

| Service | Limite RAM |
|---|---|
| wazuh.indexer (tas Java 1 Go) | 2 Go |
| wazuh.manager | 1 Go |
| wazuh.dashboard | 1 Go |
| glpi-db (MariaDB) | 768 Mo |
| meshcentral | 512 Mo |
| glpi | 512 Mo |
| **Total conteneurs** | **≈ 5,8 Go** |

Machines du labo sur un hôte Proxmox VE :

| Machine | vCPU | RAM | Disque |
|---|---|---|---|
| Hôte Proxmox (système) | — | 2 Go | 20 Go |
| VM `aegis-lab` (Debian 13 + Docker) | 4 | 8 Go | 80 Go SSD |
| VM OPNsense | 2 | 2 Go | 20 Go |
| VM Windows 11 de test (vTPM, Secure Boot) | 2 | 4 Go | 64 Go |
| ISO et sauvegardes | — | — | 30 Go |
| **Total** | **4 cœurs / 8 threads min.** | **16 Go min., 32 Go conseillés** | **≈ 215 Go SSD/NVMe min.** |

- Stockage **SSD ou NVMe obligatoire** : l'indexer Wazuh est inutilisable sur disque mécanique.
- 16 Go suffisent si le poste Windows de test est un portable à part ; 32 Go laissent de la marge
  pour une seconde VM cliente ou Zabbix plus tard.
- Hôte Docker : `vm.max_map_count=262144` (exigé par l'indexer).

### Offres de serveur dédié (choix du fondateur)

OVHcloud et ses marques (Kimsufi, So you Start) sont écartés : pas de disponibilité dans la zone
du fondateur et mauvaise expérience. Prix relevés le 2026-11-18 (1 € = 655,957 FCFA). Les prix
cloud ont fortement monté en 2026 (pénurie de mémoire) : un dédié coûte désormais moins qu'un VPS
équivalent. La disponibilité change souvent : vérifier au panier, avec une adresse au Cameroun.

| Offre | CPU | RAM | Disque | Prix/mois | FCFA/mois | Installation | OPNsense en VM | Source |
|---|---|---|---|---|---|---|---|---|
| Hetzner **EX44** (dédié) | i5-13500, 14 cœurs | 64 Go | 2 × 512 Go NVMe | **59,00 € HT** | 38 701 | 0 € | Oui | [hetzner.com/ex44](https://www.hetzner.com/dedicated-rootserver/ex44/) |
| Hetzner **AX41** (dédié) | Ryzen 5 3600, 6c/12t | 64 Go | 2 × 512 Go NVMe | 59,00 € HT | 38 701 | 0 € | Oui | [matrice AX](https://www.hetzner.com/dedicated-rootserver/matrix-ax/) |
| Contabo **Cloud VDS M** | EPYC 7282, 8 cœurs | 32 Go | 240 Go NVMe | 68,00 € (54,40 € sur 24 mois), affiché TTC | 44 605 | 0 € | Oui (imbriquée, [KB Contabo](https://help.contabo.com/support/solutions/articles/103000271595-can-i-setup-nested-virtualization-on-my-server-)) | [contabo.com/vds](https://contabo.com/en/vds/) |
| OneProvider Paris, Xeon D-1531 | 6c/12t (2015) | 32 Go | 2 × 256 Go SSD | 22,99 € | 15 080 | 0 € | Oui | [oneprovider.com](https://oneprovider.com/dedicated-servers/paris-france) |
| Scaleway Dedibox Start-2-L | Xeon D-1531 | 32 Go | 2 × 250 Go SSD | ≈ 25 € HT (source tierce) | ≈ 16 400 | 1 mois | Oui | page officielle inaccessible |
| Hostinger KVM 8 | 8 vCPU | 32 Go | 400 Go NVMe | 25,99 $ promo, puis 49,99 $ | ≈ 14 600 puis ≈ 28 100 | 0 | **Non** | [hostinger.com](https://www.hostinger.com/vps-hosting) |
| Netcup RS 4000 G12.5 | 12 cœurs EPYC | 32 Go | 512 Go NVMe | 77,83 € (12 mois) | 51 053 | — | **Non** (SVM désactivé) | [netcup.com](https://www.netcup.com/en/server/root-server) |

**Recommandation : Hetzner EX44.** Sans engagement ni frais d'installation, 64 Go de RAM : le labo
et la production du pilote (PostgreSQL, cockpit) tiennent sur la même machine. Installer Proxmox,
OPNsense en VM, et une VM Docker pour ce Compose. Vérifier au panier que l'IPv4 est incluse (la
page la marque « optionnelle » ; sinon 1,70 €/mois).

**Plan B : Contabo Cloud VDS M** si la vérification d'identité Hetzner bloque (fréquent pour les
comptes ouverts depuis l'Afrique). Virtualisation imbriquée confirmée, paiement PayPal accepté.

À éviter : les VPS sans virtualisation imbriquée (Hostinger, Netcup, Hetzner Cloud), où OPNsense ne
peut pas tourner, et les prix promotionnels qui doublent au renouvellement.

### Sauvegardes hébergées au Cameroun

Le contrat type exige que les sauvegardes des clients restent au Cameroun.

| Fournisseur | Offre | Prix | Point d'attention | Source |
|---|---|---|---|---|
| Camtel (data center Tier III) | Data Backups | 10 000 FCFA les 100 Go/mois | Débit de 1 à 4 Mbit/s : amorcer la première sauvegarde, puis incrémental (restic) | [hosting.camtel.cm](https://hosting.camtel.cm/) |
| VSPTECH (Douala, Yaoundé) | VPS Stockage & Backup, 256 Go à 3 To | Sur devis | Paiement Orange Money et MTN MoMo ; ses VPS sont en Europe : exiger la localisation au Cameroun par écrit | [vsptech.host](https://vsptech.host/) |

Demander les deux devis ; ne signer qu'avec la localisation au Cameroun écrite dans le contrat.

## 2. Installation

### 2.1 Hôte

1. Installer Proxmox VE sur le serveur dédié (image du fournisseur ou ISO officielle) ; accès SSH
   par clé uniquement.
2. Créer les ponts `vmbr1` (WAN labo) et `vmbr2` (LAN PME) : [`opnsense-vm.md`](opnsense-vm.md), étape 1.
3. Installer OPNsense : [`opnsense-vm.md`](opnsense-vm.md).
4. Créer la VM `aegis-lab` (Debian 13, 4 vCPU, 8 Go, 80 Go) sur `vmbr1`, IP `192.168.100.10/24`,
   passerelle `192.168.100.1`.
5. Sur l'hôte, rediriger uniquement ce qui doit être public (aucun port si le poste de test est la
   VM Windows interne). Pour un portable de démo externe : rediriger `443`, `1514`, `1515` vers
   `192.168.100.10`, en filtrant sur l'IP source quand c'est possible.

### 2.2 Services (VM `aegis-lab`)

```bash
# Docker Engine et Compose v2 depuis le dépôt officiel Docker
sudo sysctl -w vm.max_map_count=262144
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-wazuh.conf

git clone https://github.com/Trigenys/trigenys-aegis.git && cd trigenys-aegis/deploy/lab
./setup.sh                      # crée .env, récupère la config Wazuh, certificats, mots de passe
nano .env                       # LAB_HOSTNAME=192.168.100.10 (ou le nom DNS public)
docker compose config -q        # valide le fichier
docker compose up -d            # premier démarrage : 3 à 5 minutes
docker compose ps
```

`setup.sh` est idempotent : le relancer ne modifie rien si tout est déjà en place. Il refuse de
remplacer une configuration Wazuh d'une autre version (montée de version = procédure officielle).

### 2.3 Accès aux consoles

Les consoles Wazuh et GLPI écoutent sur `127.0.0.1` (`CONSOLE_BIND`). Depuis le poste de
l'opérateur :

```bash
ssh -J root@<serveur> -L 8443:127.0.0.1:8443 -L 8080:127.0.0.1:8080 -L 9443:127.0.0.1:443 debian@192.168.100.10
```

| Console | URL | Premier accès |
|---|---|---|
| Wazuh | `https://localhost:8443` | `admin` / `WAZUH_INDEXER_PASSWORD` du `.env` |
| GLPI | `http://localhost:8080` | `glpi` / `glpi`, puis **changer immédiatement** les mots de passe des comptes par défaut `glpi`, `tech`, `normal`, `post-only` |
| MeshCentral | `https://localhost:9443` | le premier compte créé devient administrateur ; les inscriptions sont ensuite fermées |

Pour que la VM Windows ouvre les consoles pendant la démo, mettre `CONSOLE_BIND=192.168.100.10`
puis `docker compose up -d`.

## 3. Enrôler le poste Windows de test

Poste : VM Windows 11 sur `vmbr2` (derrière OPNsense) ou portable de démo. Nommer le poste
`PME-DEMO-PC01`. Commandes dans PowerShell **administrateur**.

### 3.1 Agent Wazuh

Le plus simple : Wazuh › **Agents management › Deploy new agent** génère la commande exacte. Équivalent :

```powershell
$v = "4.14.10-1"
Invoke-WebRequest "https://packages.wazuh.com/4.x/windows/wazuh-agent-$v.msi" -OutFile "$env:TEMP\wazuh-agent.msi"
msiexec.exe /i "$env:TEMP\wazuh-agent.msi" /q WAZUH_MANAGER="192.168.100.10" WAZUH_AGENT_NAME="PME-DEMO-PC01" WAZUH_AGENT_GROUP="default"
NET START Wazuh
```

Vérifier : l'agent apparaît « Active » dans Wazuh en moins de deux minutes.

> Si le port 1515 est exposé sur Internet, activer un mot de passe d'enrôlement
> (`<auth><use_password>yes</use_password>` dans la configuration du manager) et le passer à
> l'installeur avec `WAZUH_REGISTRATION_PASSWORD`.

### 3.2 Agent MeshCentral

1. MeshCentral › **Mes appareils › Ajouter un groupe** : `PME Démo`, type « Gérer via agent ».
2. Paramètres du groupe › **Consentement utilisateur** : cocher bureau, terminal et fichiers avec
   « Demander le consentement » et « Afficher la barre de connexion ». C'est le garde-fou
   « rien sans l'accord du client », visible pendant la démo.
3. **Ajouter un agent** › Windows x64 › télécharger l'installeur, le lancer en administrateur ›
   **Installer**.
4. Vérifier : `PME-DEMO-PC01` apparaît en ligne dans le groupe.

### 3.3 GLPI (inventaire)

Dans GLPI, créer l'entité `PME Démo`, puis l'ordinateur `PME-DEMO-PC01` à la main, ou installer
GLPI Agent (GPL-2.0) et pointer son serveur sur `http://192.168.100.10:8080/` pour l'inventaire
automatique (inventaire natif à activer dans **Administration › Inventaire**).

## 4. Scénario de démo (15 minutes)

Préparer la veille : agents en ligne, une règle de blocage OPNsense journalisée (`tcp/23` sortant),
un compte salarié GLPI `marie.demo`, fenêtres des consoles ouvertes.

| Minute | Écran | Ce qu'on montre | Message pour le dirigeant |
|---|---|---|---|
| 0–2 | Schéma (section `opnsense-vm.md`) | Une PME et son pare-feu, Trigenys qui supervise à distance | « Votre parc est suivi en continu, sans serveur chez vous. » |
| 2–5 | MeshCentral | Parc en ligne ; demande de prise en main : **le salarié voit et accepte** la demande ; terminal, transfert d'un fichier | « On n'intervient jamais sans votre accord. » |
| 5–9 | Wazuh | Fiche du poste : inventaire logiciel, vulnérabilités détectées, score de conformité CIS. Puis en direct sur le poste : 5 mots de passe faux (`runas /user:test cmd`), création d'un compte local (`net user intrus P@ss-Demo1 /add`) → alertes en moins d'une minute | « On voit les signaux faibles avant qu'ils deviennent un incident. » |
| 9–11 | OPNsense + Wazuh | `Test-NetConnection 1.1.1.1 -Port 23` depuis le poste : bloqué par le pare-feu, l'événement remonte dans Wazuh | « Réseau et postes surveillés au même endroit. » |
| 11–13 | GLPI | `marie.demo` ouvre un ticket « imprimante » ; le technicien le prend, le lie à la fiche du poste ; historique du parc | « Vos salariés ont un seul guichet. » |
| 13–15 | Liste des fonctionnalités Aegis | Demain : un seul cockpit, score par client, validation des actions sensibles sur mobile, rapport mensuel | Offre par poste et par mois ; proposition de pilote |

Après la démo : supprimer le compte `intrus` (`net user intrus /delete`) et clôturer le ticket.

## 5. Démontage

```bash
docker compose down              # arrête, garde les données
docker compose down -v           # supprime aussi les volumes (données du labo perdues)
rm -rf wazuh .env                # config Wazuh, certificats et secrets locaux
```

- Poste Windows : `msiexec /x "$env:TEMP\wazuh-agent.msi" /qn` ; MeshCentral : relancer
  l'installeur › **Désinstaller** (ou `"C:\Program Files\Mesh Agent\MeshAgent.exe" -fulluninstall`).
  Supprimer l'agent dans Wazuh (**Agents management**) et l'appareil dans MeshCentral.
- VM : `qm destroy <id> --purge` pour OPNsense, Windows et `aegis-lab`.
- Résilier le serveur dédié s'il ne sert plus, après avoir vérifié qu'aucune donnée utile n'y reste.

## 6. Exploitation et limites

- **Versions** : épinglées dans `.env.example`. Monter de version = changer la variable, lire les
  notes de version, tester sur le labo ; pour Wazuh, suivre la procédure officielle de mise à niveau
  Docker (certificats et `WAZUH_DOCKER_REF` alignés).
- **Changer un mot de passe Wazuh** après le premier démarrage : l'indexer l'a déjà enregistré.
  Pour le labo, `docker compose down -v`, mettre à jour `.env`, relancer `./setup.sh` puis `up`.
- **Pas une installation de production** : un seul nœud, certificats auto-signés, pas de
  sauvegarde automatisée. La production du pilote fera l'objet d'un runbook séparé.
- Ce dossier ne contient aucun secret : `.env` et `wazuh/` sont ignorés par git.
