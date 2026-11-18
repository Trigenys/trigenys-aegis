# Journal des décisions du comex

Journal en ajout seulement. Une décision révisée fait l'objet d'une nouvelle entrée qui référence l'ancienne.

## 2026-11-18 — Offre d'informatique gérée pour PME et cockpit unifié dans Aegis

**Décision** : lancer une offre d'informatique gérée pour PME, facturée par poste et par mois, et dans quel ordre entre service et cockpit.

**Options étudiées**
- A. Pilote de service d'abord, puis cockpit.
- B. Cockpit vendu en SaaS d'abord.
- C. Reporter et rester concentré sur les projets existants.

**Faits vérifiés**
- Les briques open source sont mûres et maintenues : OPNsense, MeshCentral, FleetDM, osquery, Wazuh, GLPI, Zabbix, Zammad, RustDesk, NetBird (GitHub, 2026-11-18).
- Aucune plateforme intégrée pour MSP n'a de traction sur GitHub.
- La licence de Tactical RMM interdit tout usage commercial ou à but lucratif sans accord écrit d'AmidaWare (LICENSE.md du dépôt amidaware/tacticalrmm).
- Le VPS partagé actuel ne dispose pas de la RAM nécessaire pour Wazuh et Zabbix en production.
- Aegis est au stade de conception, avec un squelette de serveur. Son cœur prévu correspond à celui du cockpit : ingestion authentifiée multi-clients, corrélation déterministe, incidents expliqués.

**Recommandation du comex** : option A, en pilote borné, avec le cockpit construit dans Aegis.

**Choix du fondateur** : option A validée. Le cockpit est construit dans Aegis, dont le périmètre s'élargit des journaux d'applications SaaS à la supervision IT et sécurité des PME. Chaque outil devient une source branchée par un adaptateur.

**Risques acceptés** : responsabilité du service en cas d'incident client, charge de support pendant le pilote.

**Garde-fous**
- Pas de Tactical RMM. Gestion des postes par MeshCentral et FleetDM.
- Vérification des licences copyleft avant toute facturation.
- Pas d'astreinte la nuit ni le week-end pendant le pilote.
- Contrat type limitant la responsabilité, et assurance.
- Serveur dédié, séparé du VPS partagé.
- Un projet en bêta mis en pause pendant le pilote.
- Aucune action automatique sur l'environnement d'un client sans son accord, conformément au principe existant d'Aegis.

**Prochaines actions**
1. Monter un labo de démonstration : OPNsense, MeshCentral, Wazuh, GLPI.
2. Rédiger l'offre et le contrat type.
3. Proposer le pilote à 3 PME.
4. Mettre à jour le README et l'architecture d'Aegis pour le nouveau périmètre, dans une PR dédiée.

**Critère de révision** : 2027-02-18. Arrêt ou réorientation si moins de 2 PME paient, ou si le temps de support dépasse le budget prévu par poste.
