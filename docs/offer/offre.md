# Offre d'informatique gérée pour PME

Statut : brouillon v0 pour le pilote, issu de la décision comex du 2026-11-18 (`docs/decisions/comex-log.md`, branche `docs/comex-msp-pme-decision`).

> **Hypothèses de cadrage (non fixées par le comex)**
> - **Marché cible** : PME et TPE de 5 à 50 postes, implantées en France métropolitaine. Le journal comex fixe la taille du pilote (3 PME) mais ni le pays ni la taille des clients.
> - **Droit applicable** : droit français, RGPD. Prix de référence en euros hors taxes (HT), avec leur équivalent en francs CFA (XAF) et en dollars américains (USD) au § 10.
> - Si le pilote se fait sur un autre marché, revoir les prix (pouvoir d'achat, coût local du support), la monnaie, la TVA et le cadre légal des trois documents de `docs/offer/`.
> - Tout chiffre sans source est marqué **hypothèse**.

## 1. Promesse

Un parc informatique supervisé, à jour et sauvegardé, avec un interlocuteur unique joignable en heures ouvrées, pour un prix fixe par poste et par mois. Le client voit l'état de son parc dans un tableau de bord simple et valide lui-même toute action sensible : aucune intervention n'est faite chez lui sans son accord.

## 2. Repères de prix du marché

Relevés le 2026-11-18. Les sources sont des sites de prestataires ou de comparateurs, donc commerciales et peu neutres : elles donnent un ordre de grandeur, pas une grille de référence.

| Repère | Valeur | Source | Date / fiabilité |
|---|---|---|---|
| Infogérance au forfait, offre complète | 40 à 90 € HT par poste et par mois, entrée de gamme à partir d'environ 30 € | [La Fabrique du Net](https://www.lafabriquedunet.fr/blog/prestataire-informatique/) | Article « 2026 » ; lu via moteur de recherche le 2026-11-18 (page bloquée en lecture directe) |
| Couverture complète d'une PME de 20 postes, serveur inclus | 1 000 à 1 500 € HT par mois, soit 50 à 75 € par poste | [Copeps](https://copeps.fr/actualites/tarif-maintenance-informatique-pme/) | Non daté, cite des chiffres 2024-2025 ; consulté le 2026-11-18 |
| Taux horaire de maintenance | Moyenne 65,33 € HT/h en 2024, fourchette 36 à 80 € HT/h | [Copeps](https://copeps.fr/actualites/tarif-maintenance-informatique-pme/) | Idem |
| Délai d'intervention, forfait préventif mensuel | 2 à 4 heures | [Copeps](https://copeps.fr/actualites/tarif-maintenance-informatique-pme/) | Idem |
| Outil de supervision seul (RMM), dégressif | 19 € (1-3 postes), 15 € (4-9), 12 € (10 et plus) par poste et par mois ; configuration initiale 30 à 90 € | [InfoSwitch, à propos de Kushim Data](https://infoswitch.fr/blog/kushim-data-rmm-infogerance) | Lu via moteur de recherche le 2026-11-18, à revérifier ; un seul prestataire |
| Fourchette très large selon options | 20 à 250 € par poste et par mois | [Neozone, ACI Technology](https://www.neozone.org/societe/aci-technology-votre-expert-en-maintenance-informatique/) | Non daté ; consulté le 2026-11-18 |
| Tendance | Un contrat qui facture à part la détection (EDR) ou la surveillance continue est jugé daté | [IT-Connect](https://www.it-connect.fr/infogerance-en-2026-les-7-exigences-qui-separent-un-contrat-serieux-dune-plaquette-commerciale/) | 2026 ; consulté le 2026-11-18 |

**Lecture** : les formules ci-dessous se placent dans la fourchette basse à médiane du marché (29 à 69 €), parce que le service ne couvre que les heures ouvrées et que les briques sont open source (pas de licence RMM par poste). Elles restent au-dessus d'un simple outil RMM (12 à 19 €), car elles incluent le support humain.

## 3. Formules

Prix par poste de travail actif (ordinateur fixe ou portable) et par mois, HT. Facturation mensuelle à terme à échoir.

| | **Essentiel** | **Sérénité** | **Sérénité+** |
|---|---|---|---|
| Prix par poste et par mois | **29 € HT** (hypothèse) | **49 € HT** (hypothèse) | **69 € HT** (hypothèse) |
| Pour qui | Petite structure qui veut savoir où en est son parc | PME sans informaticien | PME avec un site à protéger et des salariés à distance |
| Inventaire du parc (postes, logiciels) | ✓ | ✓ | ✓ |
| Supervision : poste hors ligne, disque plein, service arrêté | ✓ | ✓ | ✓ |
| Tableau de bord dirigeant et score de santé | ✓ | ✓ | ✓ |
| Suivi de l'antivirus et du pare-feu de chaque poste | ✓ | ✓ | ✓ |
| Mises à jour Windows, selon une politique validée par le client | ✓ | ✓ | ✓ |
| Support à distance, heures ouvrées | 2 h par mois pour tout le parc, puis au taux horaire | Inclus, usage raisonnable (§ 5) | Inclus, usage raisonnable (§ 5) |
| Détection et réponse de sécurité (agent Wazuh, alertes analysées) | — | ✓ | ✓ |
| Sauvegarde des postes (données utilisateur, hors serveur) | — | ✓ 50 Go par poste (hypothèse) | ✓ 100 Go par poste (hypothèse) |
| Test de restauration | — | 1 par trimestre, sur un échantillon | 1 par mois, sur un échantillon |
| Mises à jour des logiciels tiers courants | — | ✓ | ✓ |
| Rapport mensuel au dirigeant | — | ✓ | ✓ |
| Pare-feu du site géré (OPNsense) | — | — | ✓ 1 site (matériel en sus, § 6) |
| Accès à distance sécurisé des salariés (NetBird) | — | — | ✓ |
| Revue de sécurité trimestrielle avec le dirigeant | — | — | ✓ |
| Intervention sur site | Au taux horaire + déplacement | Au taux horaire + déplacement | 1 demi-journée par trimestre incluse, au-delà au taux horaire (hypothèse) |

### Options

| Option | Prix HT | Statut |
|---|---|---|
| Serveur supervisé et sauvegardé (physique ou virtuel) | 99 € par serveur et par mois | Hypothèse |
| Site supplémentaire avec pare-feu géré | 49 € par site et par mois | Hypothèse |
| Volume de sauvegarde supplémentaire | 5 € par tranche de 50 Go et par mois | Hypothèse |
| Comptes Microsoft 365 ou Google Workspace : administration | 3 € par compte et par mois, licences en sus | Hypothèse |

### Minimum et engagement

- Minimum de facturation : 5 postes par client (hypothèse).
- **Pilote** : 3 mois, jusqu'au point de révision du comex du 2027-02-18, puis contrat de 12 mois (hypothèse). Pendant le pilote, une remise peut être accordée en échange d'un retour d'expérience écrit ; son montant reste à décider.
- Tous les postes du client entrent dans le contrat : pas de couverture partielle du parc, sinon un poste non géré ruine la sécurité des autres.

## 4. Frais de mise en route

Facturés une fois, à la signature.

| Élément | Prix HT | Statut |
|---|---|---|
| Audit initial : inventaire, état de sécurité, sauvegardes existantes, accès | 490 € forfaitaire jusqu'à 20 postes, 690 € au-delà | Hypothèse |
| Installation des agents et configuration, par poste | 40 € par poste | Hypothèse ; repère marché : configuration initiale RMM 30 à 90 € (§ 2) |
| Mise en place du pare-feu (Sérénité+) | 390 € par site, matériel en sus | Hypothèse |

L'audit initial donne lieu à un rapport remis au client. Il liste les risques constatés et les prérequis à lever avant la prise en charge (§ 7). Si le client ne signe pas après l'audit, le rapport reste dû.

## 5. Niveaux de service

### Heures de service

**Du lundi au vendredi, de 9 h à 18 h (heure de Paris), hors jours fériés en France métropolitaine.** Il n'y a **aucune astreinte la nuit, le week-end ni les jours fériés** (garde-fou du comex).

En dehors de ces heures :
- la supervision continue de collecter les alertes, mais **personne ne les traite** avant la reprise des heures ouvrées ;
- les demandes sont enregistrées et traitées à la reprise ;
- aucune action automatique n'est déclenchée chez le client sans son accord (§ 8).

Le client doit le savoir dès l'offre : un incident survenu un vendredi à 19 h sera pris en charge le lundi à 9 h.

### Délais de prise en charge

Les délais se comptent **en heures ouvrées** et portent sur la **prise en charge** (un technicien qualifie la demande et revient vers le client), pas sur la résolution. Ce sont des objectifs de moyens, pas des garanties de résultat.

| Priorité | Exemple | Prise en charge |
|---|---|---|
| P1 — Bloquant | Toute l'entreprise sans accès, suspicion d'attaque en cours | 2 heures ouvrées |
| P2 — Majeur | Un service important arrêté, plusieurs salariés gênés | 4 heures ouvrées |
| P3 — Mineur | Un salarié gêné, contournement possible | 1 jour ouvré |
| P4 — Demande | Nouveau compte, installation, question | 3 jours ouvrés |

Repère de marché : 2 à 4 heures pour un forfait préventif mensuel (Copeps, § 2).

Ces délais sont des **hypothèses de pilote** : ils seront confirmés ou revus selon le temps de support réellement mesuré (critère de révision du comex).

### Usage raisonnable du support inclus

Le support à distance inclus (Sérénité, Sérénité+) couvre l'assistance courante aux salariés et le maintien en condition du parc. Au-delà de 30 minutes par poste et par mois en moyenne sur un trimestre (hypothèse), les parties examinent ensemble la cause et peuvent passer à la formule supérieure ou facturer le dépassement au taux horaire. Ce seuil sert aussi d'indicateur pour le critère de révision « temps de support supérieur au budget prévu par poste ».

### Mesure

Les délais sont mesurés par l'outil de tickets (GLPI). Un rapport mensuel donne le taux de respect. Le pilote n'applique pas de pénalités financières ; leur éventuelle introduction sera décidée après le pilote.

## 6. Ce qui est exclu

Sauf option ou devis séparé :

- **Le matériel** : achat, réparation, garantie, remplacement de postes, serveurs, imprimantes, téléphones ou équipements réseau. Le boîtier du pare-feu est vendu ou loué à part.
- **Les licences logicielles** : Windows, Microsoft 365, applications métier, antivirus commerciaux.
- **Les applications métier** : logiciel de comptabilité, de paie, ERP, site web. Le prestataire peut faire le lien avec l'éditeur, sans en être responsable.
- **Les interventions hors heures ouvrées**, sauf accord écrit préalable et facturation majorée de 50 % (hypothèse).
- **Les projets** : déménagement, renouvellement de parc, migration de messagerie, nouveau serveur, câblage. Ils font l'objet d'un devis.
- **La remise en état après un rançongiciel ou une attaque** survenus malgré les mesures en place : l'intervention de crise est facturée au taux horaire, et la restauration dépend des sauvegardes disponibles (voir contrat type).
- **Les postes et équipements non déclarés au contrat**, ou dont l'agent a été retiré.
- **La formation des utilisateurs**, au-delà des réponses données dans le cadre du support.
- **Les déplacements** : facturés selon la distance (hypothèse : 0,60 € par km au-delà de 20 km, ou forfait à définir par client).

### Taux horaire hors forfait

**75 € HT de l'heure**, par tranche de 30 minutes entamée (hypothèse, dans la fourchette marché 36 à 80 € HT, moyenne 65 € en 2024, § 2). Toute prestation hors forfait fait l'objet d'un accord préalable du client sur son principe et sur une estimation.

## 7. Prérequis côté client

- Un interlocuteur désigné, joignable en heures ouvrées, habilité à valider les actions.
- Des systèmes encore maintenus par leur éditeur. Un poste sous un système en fin de support est signalé, et sa remise à niveau est un projet hors forfait.
- Des licences valides.
- L'installation des agents sur tous les postes du périmètre.
- Une connexion internet sur chaque site.

## 8. Accord du client avant toute action

Principe d'Aegis repris tel quel : **aucune action n'est faite sur l'environnement du client sans son accord.**

- Les actions de routine (déploiement des mises à jour dans une fenêtre convenue, redémarrage planifié) sont autorisées une fois pour toutes dans une **politique** que le client valide par écrit et peut modifier à tout moment.
- Toute autre action (désinstallation, isolement d'un poste, réinitialisation d'un compte, modification du pare-feu) demande un accord explicite, tracé dans le ticket ou dans le cockpit.
- En cas d'attaque en cours, l'opérateur propose l'action et le client la valide. Le client peut, s'il le souhaite, pré-autoriser par écrit une liste courte d'actions d'urgence (par exemple isoler un poste du réseau) ; c'est un accord préalable, pas une action automatique.

## 9. Outils utilisés

Pile open source opérée par le prestataire, sur un serveur dédié séparé du VPS partagé (garde-fou du comex) : OPNsense (pare-feu), MeshCentral et FleetDM (gestion des postes), Wazuh (sécurité), GLPI (tickets et inventaire), Zabbix (supervision), NetBird (accès distant), RustDesk (prise en main). Le cockpit Aegis agrège ces sources.

Avant la première facture, les licences de chaque brique sont vérifiées pour un usage commercial en service géré, en particulier les licences copyleft réseau (garde-fou du comex). Tactical RMM est exclu.

## 10. Prix en XAF et en USD

Le prix de référence est en euros. Les équivalents ci-dessous servent à présenter l'offre si un client paie dans une autre monnaie.

**Taux utilisés**
- **XAF** : parité fixe 1 € = 655,957 XAF (franc CFA d'Afrique centrale, rattaché à l'euro). Ce taux ne bouge pas.
- **USD** : 1 € = 1,1014 $, parité quotidienne de la Banque de France du 2026-11-16 ([source](https://www.banque-france.fr/fr/statistiques/taux-et-cours/taux-de-change-parites-quotidiennes-2026-11-16), relevée le 2026-11-18). Ce taux varie : le recalculer à la date de chaque proposition, ou facturer en euros.

Montants HT, arrondis à l'unité (XAF) ou au cent (USD). Pas de TVA incluse : appliquer celle du pays du client.

| Élément | EUR | XAF | USD |
|---|---|---|---|
| Essentiel, par poste et par mois | 29 € | 19 023 XAF | 31,94 $ |
| Sérénité, par poste et par mois | 49 € | 32 142 XAF | 53,97 $ |
| Sérénité+, par poste et par mois | 69 € | 45 261 XAF | 76,00 $ |
| Serveur supervisé, par mois | 99 € | 64 940 XAF | 109,04 $ |
| Site supplémentaire avec pare-feu, par mois | 49 € | 32 142 XAF | 53,97 $ |
| Sauvegarde, par tranche de 50 Go et par mois | 5 € | 3 280 XAF | 5,51 $ |
| Administration d'un compte M365 ou Google, par mois | 3 € | 1 968 XAF | 3,30 $ |
| Audit initial, jusqu'à 20 postes | 490 € | 321 419 XAF | 539,69 $ |
| Audit initial, au-delà de 20 postes | 690 € | 452 610 XAF | 759,97 $ |
| Installation et configuration, par poste | 40 € | 26 238 XAF | 44,06 $ |
| Mise en place du pare-feu, par site | 390 € | 255 823 XAF | 429,55 $ |
| Taux horaire hors forfait | 75 € | 49 197 XAF | 82,60 $ |

**Attention** : ce sont des **conversions**, pas des prix de marché. Les repères du § 2 sont français. Pour un client en zone CEMAC ou payant en dollars, le niveau de prix local n'a pas été étudié : les montants XAF et USD restent des **hypothèses** à confronter à des tarifs de prestataires locaux, sourcés et datés, avant toute proposition. Le droit applicable, la protection des données et la fiscalité changent aussi (voir l'avertissement du contrat type).

Si le contrat est libellé en USD, prévoir dans le contrat la date et la source du taux, et le partage du risque de change.

## 11. Points ouverts

| Point | Pour décider |
|---|---|
| Pays et taille des clients du pilote | Fondateur, avant la première proposition |
| Niveau des prix après le pilote | Mesure du temps de support par poste pendant le pilote |
| Remise de pilote | Fondateur |
| Monnaie de facturation (EUR, XAF ou USD) et prix locaux | Fondateur, avec un relevé de tarifs locaux si le pilote est hors de France |
| Pénalités en cas de non-respect des délais | Après le pilote, et avec l'avis de l'assureur |
| Hébergement des sauvegardes (prestataire, pays, coût par Go) | Choix technique, impact sur les prix « Sérénité » |
