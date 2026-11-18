# Licences des briques du labo et obligations pour un usage commercial

Vérifié le 2026-11-18 sur les dépôts officiels (fichier `LICENSE` au tag épinglé quand il est indiqué).
Ce tableau aide à décider ; il ne remplace pas un avis juridique avant la première facturation
(garde-fou du comex : « vérification des licences copyleft avant toute facturation »).

## Contexte d'usage

Trigenys **utilise** ces logiciels pour rendre un service d'informatique gérée (hébergé par Trigenys,
agents installés chez le client). Trois cas changent les obligations :

1. **Usage interne non modifié** : on fait tourner le logiciel tel quel pour fournir le service.
2. **Distribution** : on remet un binaire au client (agent installé sur ses postes, image, VM, appliance).
3. **Modification** : on change le code source (correctif, marque blanche, intégration).

## Tableau

| Brique | Version labo | Licence | Usage commercial | Obligations principales |
|---|---|---|---|---|
| Wazuh manager et agent | 4.14.10 | GPL-2.0 (fichier `LICENSE` au tag v4.14.10) | Autorisé, sans redevance | Distribuer l'agent aux clients = distribution GPL : fournir (ou proposer par écrit) le code source correspondant, conserver les mentions de copyright et la licence. Modifications distribuées : sous GPL-2.0. |
| Wazuh indexer | 4.14.10 | Apache-2.0 (dérivé d'OpenSearch) | Autorisé | Conserver la licence et le fichier `NOTICE` si redistribué ; indiquer les fichiers modifiés. |
| Wazuh dashboard (plugins Wazuh) | 4.14.10 | GPL-2.0 (plugins) ; Apache-2.0 (socle OpenSearch Dashboards) | Autorisé | Comme ci-dessus selon la partie redistribuée. |
| Images et Compose Wazuh (`wazuh-docker`) | v4.14.10 | GPL-2.0 (mention dans chaque fichier) | Autorisé | Le `compose.yaml` du labo en est adapté : il garde la mention d'origine en tête. |
| MeshCentral (serveur et agent) | 1.3.1 | Apache-2.0 | Autorisé | Conserver licence et mentions ; signaler les modifications. Pas d'obligation de publier le code. |
| GLPI | 12.0.2 | GPL-3.0 | Autorisé | Usage hébergé non modifié : pas d'obligation de publication (la GPL ne vise pas l'accès réseau). Distribution ou remise d'une copie modifiée : code source sous GPL-3.0. Plugins : licence propre à chacun, à vérifier un par un. |
| GLPI Agent (inventaire, optionnel) | — | GPL-2.0 | Autorisé | Mêmes obligations que l'agent Wazuh s'il est déployé chez les clients. |
| Images Docker GLPI (`glpi-project/docker-images`) | — | MIT | Autorisé | Conserver la mention de copyright. |
| MariaDB Server | 11.8.9 | GPL-2.0 | Autorisé | Usage interne non modifié : aucune obligation. Les clients ne reçoivent pas MariaDB. |
| OPNsense (édition communautaire) | dernière stable | BSD-2-Clause | Autorisé | Conserver la mention de copyright si redistribué (par exemple une appliance livrée au client). Ne pas utiliser la marque OPNsense pour un produit dérivé sans accord. L'édition « Business » est une offre commerciale distincte, facultative. |
| Proxmox VE (hyperviseur proposé) | — | AGPL-3.0 | Autorisé | Usage non modifié : aucune obligation. Dépôt « no-subscription » utilisable ; l'abonnement est un support payant facultatif. |

## Exclu

| Brique | Raison |
|---|---|
| **Tactical RMM** | Licence propre d'AmidaWare : tout usage commercial ou à but lucratif interdit sans accord écrit (`LICENSE.md` du dépôt `amidaware/tacticalrmm`). Exclu par la décision du comex du 2026-11-18. |

## Points de vigilance

- **Agents chez le client = distribution.** Wazuh et GLPI Agent sont sous GPL-2.0 : à chaque remise
  de l'installeur, fournir le lien vers le code source correspondant à la version exacte
  (par exemple le tag GitHub) et la licence. Une ligne dans le contrat type et dans la documentation
  client suffit pour une version non modifiée.
- **Évolution de licence Wazuh.** La branche principale de `wazuh/wazuh` (après 4.14) place le moteur
  d'analyse sous AGPL-3.0. L'AGPL impose de proposer le code source aux utilisateurs qui interagissent
  à distance avec une version **modifiée**. Avant toute montée de version majeure : relire `LICENSE`
  au tag visé et ne pas modifier le moteur sans décision explicite.
- **Marques.** Wazuh, GLPI (Teclib'), MeshCentral, OPNsense (Deciso) sont des marques : on peut dire
  « basé sur Wazuh », pas vendre « Wazuh by Trigenys ». La marque blanche (phase P2) demande une revue
  dédiée.
- **Aegis (le cockpit).** Il parle à ces outils par leurs API, sans lier leur code : la licence d'Aegis
  reste indépendante. Ne pas copier de code GPL dans `src/` sans décision.
