# Offre d'informatique gérée pour PME — Douala et Yaoundé

Statut : brouillon v1, à valider par le fondateur. Décision comex du 2026-11-18 (voir `docs/decisions/comex-log.md`, entrée « Marché du pilote d'informatique gérée ») ; cibles dans `docs/sales/cibles.md`.

> **Hypothèses de cadrage**
> - **Marché** (fixé par le comex) : PME de Douala et de Yaoundé (Cameroun), 1 ou 2 sites, joignables sur site en moins d'une heure.
> - **Cible** (fixée par `docs/sales/cibles.md`) : 10 à 50 salariés, 10 à 40 postes, de préférence sous Windows ; cliniques, agences, établissements de formation.
> - **Devise principale** : franc CFA BEAC (FCFA, code XAF). Prix **hors taxes** ; TVA du Cameroun de 19,25 % en sus (voir § 2). Équivalents en EUR et en USD donnés à titre indicatif au § 10.
> - **Droit applicable** : droit camerounais et actes uniformes OHADA (voir `contrat-type.md`).
> - **Prix** : aucun tarif mensuel par poste n'a été trouvé publiquement au Cameroun. Les prix des formules sont donc des **hypothèses** de lancement, bornées par les repères locaux du § 2. Ils sont à confirmer par les premiers entretiens de prospection.
> - Garde-fous du comex : pas d'astreinte la nuit ni le week-end ; aucune action automatique chez un client sans son accord ; responsabilité limitée et assurance avant le premier contrat ; pas de Tactical RMM ; serveur dédié, séparé du VPS partagé.

## 1. En une phrase

Pour un prix fixe par poste et par mois, Trigenys surveille, met à jour, sauvegarde et protège le parc informatique de la PME, et répond à ses demandes pendant les heures ouvrées, à distance ou sur site à Douala et à Yaoundé.

## 2. Repères de prix locaux

Relevés le 2026-11-18. Ils servent à borner les prix, pas à les fixer.

| Repère | Montant | Source | Fiabilité |
|---|---|---|---|
| Diagnostic d'un poste, boutique de maintenance à Douala | À partir de 5 000 FCFA | [BRC Market, Douala](https://brcmarket.cm/services/maintenance-support), page non datée (© 2026), consultée le 2026-11-18 | Tarif public, à l'acte |
| Nettoyage d'un poste | À partir de 8 000 FCFA | Idem | Idem |
| Réinstallation du système | À partir de 10 000 FCFA | Idem | Idem |
| Installation d'un antivirus | À partir de 6 000 FCFA | Idem | Idem ; aucun contrat mensuel affiché |
| Salaire d'un technicien de maintenance, annonce à Douala | 100 000 FCFA par mois | [Loozap](https://cm.loozap.com/ads/technicien-maintenance-informatique-h-f-douala/1396457.html), consultée le 2026-11-18 | Une annonce ; peu représentative |
| Salaire d'un spécialiste en maintenance informatique | 150 000 à 250 000 FCFA par mois | [Le Grand Frère](https://legrandfrere.africa/metier/specialiste-en-maintenance-informatique/), consultée le 2026-11-18 | Grille régionale, pas propre au Cameroun |
| TVA du Cameroun sur les prestations de services | 19,25 % (17,5 % + 10 % de centimes additionnels communaux) | [DGI, fiche TVA](https://impots.cm/sites/default/files/documents/FICHE%20TVA.pdf), [Lefisk](https://lefisk.cm/fiscalite/tva) ; loi de finances 2026 (loi n° 2025/012 du 17 décembre 2025) | Source officielle ; vérifier le régime fiscal de Trigenys avec un comptable |

**Lecture** :
- Une seule intervention ponctuelle par poste et par mois coûte déjà 5 000 à 10 000 FCFA à l'acte. La formule Essentiel se place dans cette fourchette, mais avec la surveillance, les mises à jour et le support à distance en plus.
- Une PME de 20 postes qui embauche un technicien paie au moins 100 000 à 250 000 FCFA par mois, hors charges sociales, sans supervision outillée ni continuité pendant les congés. La formule Sérénité pour 20 postes (300 000 FCFA HT) se compare à ce coût.
- Les prix pratiqués en France (environ 30 à 70 € par poste et par mois, soit 19 000 à 46 000 FCFA) ne sont pas transposables : ils servent seulement de plafond.

## 3. Formules

Prix par poste géré et par mois, **hors taxes**, en FCFA. **Hypothèses de lancement.**

| | **Essentiel** | **Sérénité** | **Sérénité+** |
|---|---|---|---|
| **Prix par poste et par mois (HT)** | **7 500 FCFA** | **15 000 FCFA** | **22 500 FCFA** |
| Inventaire du parc, matériel et logiciels | ✔ | ✔ | ✔ |
| Supervision des postes (disque, santé, agent actif) et alertes | ✔ | ✔ | ✔ |
| Mises à jour de Windows et des logiciels courants, selon la politique validée par le client | ✔ | ✔ | ✔ |
| Antivirus et pare-feu de Windows : configuration et suivi | ✔ | ✔ | ✔ |
| Support à distance pendant les heures ouvrées | ✔ (usage raisonnable, § 5) | ✔ (usage raisonnable, § 5) | ✔ (usage raisonnable, § 5) |
| Sauvegarde des postes (données utilisateurs), 50 Go par poste, conservation 30 jours | — | ✔ | ✔ |
| Détection d'incidents de sécurité (journaux et alertes) | — | ✔ | ✔ |
| Gestion du pare-feu du site et de l'accès à distance (VPN) | — | ✔ | ✔ |
| Intervention sur site à Douala ou à Yaoundé, déplacement compris | Facturée (§ 6) | 1 visite par mois incluse | 2 visites par mois incluses |
| Test de restauration de sauvegarde | — | 1 par trimestre | 1 par mois |
| Rapport mensuel (état du parc, mises à jour, incidents) | Simple | Détaillé | Détaillé, avec revue d'une heure |
| Comptes de messagerie et bureautique en ligne (Microsoft 365 ou équivalent) : gestion des comptes | — | — | ✔ |
| Sensibilisation des salariés au hameçonnage | — | — | ✔ (1 séance par semestre) |

**Options** (par mois, HT, hypothèses) :
- serveur géré : 40 000 FCFA par serveur ;
- site supplémentaire (2ᵉ site) : 20 000 FCFA ;
- tranche de sauvegarde supplémentaire de 50 Go : 2 500 FCFA ;
- gestion d'un compte de messagerie ou de bureautique en ligne (hors Sérénité+) : 1 500 FCFA par compte.

**Conditions** :
- minimum 10 postes par contrat (cohérent avec la cible) ;
- pilote de 3 mois, puis contrat de 12 mois ;
- une même formule pour tous les postes d'un site.

**Exemple** : 20 postes en Sérénité = 300 000 FCFA HT par mois, soit 357 750 FCFA TTC (TVA 19,25 %).

## 4. Frais de mise en route

Facturés une seule fois, HT, **hypothèses**.

| Prestation | Prix | Contenu |
|---|---|---|
| Audit initial, jusqu'à 20 postes | 150 000 FCFA | Inventaire, état de sécurité, sauvegardes existantes, réseau, rapport et plan d'action |
| Audit initial, plus de 20 postes | 250 000 FCFA | Idem |
| Installation des agents et mise en conformité | 10 000 FCFA par poste | Agents de supervision et de sauvegarde, politique de mises à jour |
| Mise en place du pare-feu du site (Sérénité et Sérénité+) | 150 000 FCFA par site | Configuration d'OPNsense sur un boîtier fourni par le client ou acheté à part, VPN |

Le matériel (boîtier pare-feu, disques, onduleurs, postes) n'est pas compris : il est acheté par le client ou refacturé à prix coûtant sur devis.

## 5. Niveaux de service

**Heures de service** (hypothèse) : du lundi au vendredi, de 8 h à 17 h, heure de Douala (UTC+1), hors jours fériés légaux au Cameroun. **Pas d'astreinte** la nuit, le week-end ni les jours fériés (garde-fou du comex).

Les délais ci-dessous comptent **uniquement des heures ouvrées**. Ce sont des délais de **prise en charge** (un technicien commence à traiter la demande), pas de résolution.

| Priorité | Exemple | Prise en charge | Intervention sur site si nécessaire |
|---|---|---|---|
| P1 — critique | Tout le site est arrêté, rançongiciel suspecté | 2 heures ouvrées | Le jour ouvré même si la demande arrive avant 14 h, sinon le jour ouvré suivant |
| P2 — haute | Un service important est arrêté (messagerie, serveur de fichiers) | 4 heures ouvrées | Sous 1 jour ouvré |
| P3 — normale | Un poste ou un utilisateur est gêné | 1 jour ouvré | Planifiée |
| P4 — demande | Nouvel utilisateur, installation d'un logiciel | 3 jours ouvrés | Planifiée |

- Le trajet jusqu'au site dure **une heure au plus** dans la zone desservie (critère du comex) ; la zone exacte à Douala et à Yaoundé est fixée au contrat.
- Une demande reçue en dehors des heures de service est prise en charge à l'ouverture suivante.
- **Usage raisonnable** du support : environ 30 minutes par poste et par mois en moyenne sur le parc. Au-delà, sur trois mois consécutifs, Trigenys propose une formule supérieure ou facture le temps passé.
- Canaux : portail de tickets, courriel, téléphone, WhatsApp professionnel pendant les heures de service.

## 6. Ce qui n'est pas compris

Facturé au taux horaire de **15 000 FCFA HT** (hypothèse), par tranche de 30 minutes, sur devis accepté :
- interventions en dehors des heures de service, à la demande expresse du client et selon la disponibilité ;
- interventions sur site au-delà des visites incluses (en Essentiel, chaque visite, plus un forfait de déplacement de 5 000 FCFA HT dans la zone desservie, hypothèse) ;
- réparation ou remplacement de matériel, et le matériel lui-même ;
- matériel et logiciels hors contrat, ou en fin de support de l'éditeur ;
- projets : déménagement, migration, nouveau serveur, câblage ;
- restauration complète après un rançongiciel ou un sinistre survenu malgré les mesures prévues (voir l'article 10 du contrat type) ;
- licences logicielles et abonnements (Microsoft 365, antivirus commercial, etc.) ;
- formation des utilisateurs au-delà de ce que prévoit la formule ;
- développement, sites web, applications métier.

## 7. Prérequis côté client

- Une connexion Internet fonctionnelle sur chaque site, et si possible une seconde connexion ou un forfait mobile de secours.
- Un onduleur pour le pare-feu et le serveur : les coupures de courant sont un risque majeur pour le matériel.
- Des postes sous une version de Windows encore prise en charge par l'éditeur ; les autres postes sont gérés « en l'état » ou exclus.
- Un interlocuteur désigné, qui valide les actions (§ 8).
- Les licences des logiciels installés.

## 8. Accord préalable du client

Aucune action automatique n'est faite chez un client sans son accord (garde-fou du comex).

- À la signature, le client valide une **politique d'actions autorisées** (annexe du contrat) : quelles mises à jour peuvent être déployées automatiquement, quels jours, à quelle heure, et ce qui exige un accord au cas par cas.
- Toute action hors de cette politique (redémarrage d'un serveur, suppression de données, changement de pare-feu) demande un accord écrit (ticket, courriel ou message) de l'interlocuteur désigné.
- **Action d'urgence pré-autorisée** : isoler un poste du réseau quand un rançongiciel est suspecté. Le client est prévenu immédiatement.
- Toutes les actions sont journalisées et figurent au rapport mensuel.

## 9. Outils utilisés

Logiciels libres hébergés sur un serveur dédié à Trigenys, séparé du VPS partagé : OPNsense (pare-feu), MeshCentral et RustDesk (accès à distance), FleetDM (inventaire et état des postes), Wazuh (détection d'incidents), GLPI (tickets et inventaire), Zabbix (supervision), NetBird (réseau privé). Les licences sont vérifiées avant toute facturation (garde-fou du comex).

**Hébergement des sauvegardes et des journaux** : la loi n° 2024/017 du 23 décembre 2024 sur la protection des données à caractère personnel, en vigueur depuis le 23 juin 2026, soumet les transferts de données personnelles hors du Cameroun à une autorisation préalable de l'autorité de protection (voir `contrat-type.md`, article 13). Par défaut, les sauvegardes et les journaux sont donc **hébergés au Cameroun** (hébergeur local, ou serveur de Trigenys à Douala ou à Yaoundé, à choisir). Un hébergement hors du Cameroun n'est possible qu'après autorisation, ou si le juriste confirme qu'elle n'est pas requise. **[À VALIDER]**

## 10. Équivalents en EUR et en USD

Indicatifs : la facturation se fait en FCFA. Taux : parité fixe 1 € = 655,957 FCFA ; 1 € = 1,1014 USD (taux de référence de la Banque de France du 2026-11-16). Arrondis au centime.

| Élément (HT) | FCFA | EUR | USD |
|---|---|---|---|
| Essentiel, par poste et par mois | 7 500 | 11,43 | 12,59 |
| Sérénité, par poste et par mois | 15 000 | 22,87 | 25,19 |
| Sérénité+, par poste et par mois | 22 500 | 34,30 | 37,78 |
| Serveur géré, par mois | 40 000 | 60,98 | 67,16 |
| Site supplémentaire, par mois | 20 000 | 30,49 | 33,58 |
| Tranche de sauvegarde de 50 Go, par mois | 2 500 | 3,81 | 4,20 |
| Compte de messagerie ou de bureautique, par mois | 1 500 | 2,29 | 2,52 |
| Audit initial, jusqu'à 20 postes | 150 000 | 228,67 | 251,86 |
| Audit initial, plus de 20 postes | 250 000 | 381,12 | 419,77 |
| Installation, par poste | 10 000 | 15,24 | 16,79 |
| Mise en place du pare-feu, par site | 150 000 | 228,67 | 251,86 |
| Taux horaire | 15 000 | 22,87 | 25,19 |
| Forfait de déplacement (Essentiel) | 5 000 | 7,62 | 8,40 |

L'équivalent en USD varie avec le cours de l'euro ; celui en EUR est fixe tant que la parité du franc CFA l'est.

## 11. Points ouverts

1. Valider les prix des formules par 5 à 10 entretiens de prospection (cliniques, agences, établissements de formation) : budget informatique actuel, prestataire actuel, prix jugé acceptable.
2. Confirmer le régime fiscal de Trigenys au Cameroun (TVA, précompte, retenues à la source sur les prestations) avec un comptable.
3. Choisir l'hébergement des sauvegardes et des journaux au Cameroun (§ 9) et chiffrer son coût, qui conditionne la marge de Sérénité.
4. Fixer la zone desservie à Douala et à Yaoundé, et l'organisation des déplacements (un technicien par ville ?).
5. Vérifier la qualité des connexions Internet des clients : elle conditionne la sauvegarde en ligne (taille des tranches, sauvegarde locale en complément).
6. Faire relire le contrat type par un juriste camerounais et obtenir les devis d'assurance (`assurance.md`) avant le premier contrat.
7. Critère de révision du comex : 2027-02-18.
