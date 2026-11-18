# Pilote d'informatique gérée : PME cibles

Statut : v0 du 2026-11-18. Source de la décision : journal comex du 2026-11-18 (`docs/decisions/comex-log.md`, branche `docs/comex-msp-pme-decision`).

## Hypothèse de marché (à valider)

Le journal comex ne fixe ni pays ni ville. Hypothèse retenue pour ce kit :

- **PME francophones, joignables en personne par le fondateur**, dans la ville où il peut intervenir sur site en moins d'une heure. Le pilote exclut l'astreinte de nuit et de week-end : la proximité compense.
- **WhatsApp est le canal principal** de contact avec le dirigeant, ce qui est cohérent avec le cockpit (tickets et alertes critiques par WhatsApp en phase P0).
- Aucun chiffre de taille de marché n'est utilisé dans ce kit. Pour le pilote, l'enjeu est de signer 3 PME, dont au moins 2 payantes avant le 2027-02-18, pas de dimensionner un marché.

À trancher par le fondateur : le pays et la ville du pilote, puis la devise et le prix par poste (offre en cours de rédaction, hors de ce dossier).

## Profil de la PME idéale

| Critère | Cible | Pourquoi |
|---|---|---|
| Taille | 10 à 50 salariés | Assez de postes pour un revenu utile, trop peu pour un informaticien à plein temps |
| Postes gérés | 10 à 40 ordinateurs, idéalement sous Windows | Les agents MeshCentral et FleetDM s'installent par script ; au-delà de 40 postes, la charge de support dépasse le budget du pilote (hypothèse) |
| Sites | 1 site, 2 au maximum | Pas d'astreinte, interventions sur site possibles |
| Informatique actuelle | Un « neveu », un salarié débrouillard ou un prestataire appelé au coup par coup | La douleur existe et personne n'en est responsable |
| Décideur | Le dirigeant décide seul, ou avec un associé | Cycle de vente court, compatible avec l'échéance de février 2027 |
| Données sensibles | Fichiers clients, comptabilité, dossiers de patients ou de clients | La perte ou la fuite coûte cher : l'argument sécurité porte |

**Secteurs à privilégier**

1. Cabinets d'expertise comptable et de conseil fiscal : données clients, périodes de clôture sous pression.
2. Cabinets d'avocats, notaires, huissiers : confidentialité et obligation de conserver les dossiers.
3. Cliniques, cabinets médicaux, laboratoires d'analyses, cabinets dentaires : dossiers de patients, postes partagés.
4. Agences (immobilier, voyage, assurance, transit) : plusieurs postes, flux d'argent, risque de fraude par courriel.
5. Établissements de formation privés : salle de postes, comptes partagés, réseau Wi-Fi ouvert.

**À éviter pendant le pilote**

- Entreprises avec un service informatique interne (pas de douleur, cycle long).
- Plus de 2 sites ou des sites éloignés.
- Activité 24 h sur 24 qui exigerait une astreinte (hôtels, usines en continu, stations-service).
- Exigence d'un engagement de délai contractuel fort (banque, assurance réglementée) : la responsabilité dépasse le contrat type.
- Parc majoritairement sous macOS ou sans ordinateurs (tout sur téléphone).

## Signes de douleur à repérer

- Un poste « tombé » a déjà bloqué une journée de travail, ou une facture est partie en retard pour cette raison.
- Un virus, un rançongiciel ou un compte de messagerie piraté chez eux ou chez un confrère.
- Une fraude ou une tentative de fraude par faux courriel de fournisseur.
- « Je ne sais pas qui a accès à quoi », départ d'un salarié avec ses mots de passe.
- Pas de sauvegarde, ou une sauvegarde sur un disque USB jamais testée.
- Wi-Fi partagé entre clients et salariés, mot de passe inchangé depuis l'installation.
- Licences et antivirus expirés, mises à jour de Windows désactivées « parce que ça ralentit ».
- Le dirigeant sert lui-même de support informatique ou appelle un prestataire qui met plusieurs jours à venir.

## Qualification d'un prospect

Notez chaque critère de 0 à 2. **Prospect qualifié à partir de 8 sur 12**, sans aucun 0 sur les critères marqués ★.

| Critère | 0 | 1 | 2 |
|---|---|---|---|
| ★ Douleur | Aucune exprimée | Gêne diffuse | Incident vécu ou peur concrète |
| ★ Décideur présent | Introuvable | Influenceur | Dirigeant lui-même |
| Nombre de postes | Moins de 5 ou plus de 50 | 5 à 9 ou 41 à 50 | 10 à 40 |
| Proximité | Autre ville | Plus d'une heure | Moins d'une heure |
| ★ Budget | Refuse tout paiement mensuel | Paie déjà au coup par coup | Prêt à payer un forfait par poste |
| Calendrier | Pas avant 6 mois | Dans 3 à 6 mois | Démarrage avant fin décembre 2026 |

Questions de qualification rapide, au téléphone ou sur WhatsApp :

1. Combien d'ordinateurs utilisez-vous au bureau ?
2. Qui s'occupe de l'informatique aujourd'hui ?
3. Quelle a été la dernière panne ou le dernier souci informatique ? Combien de temps a-t-il duré ?
4. Si un ordinateur était volé ce soir, que perdriez-vous ?
5. Combien dépensez-vous par mois ou par an pour l'informatique, à peu près ?

## Canaux pour trouver les prospects

Par ordre de priorité, du plus chaud au plus froid :

1. **Réseau personnel du fondateur** : anciens collègues, clients des autres projets Trigenys, amis dirigeants. Demander explicitement : « Qui, dans ton entourage, a un bureau de 10 à 40 personnes et galère avec l'informatique ? »
2. **Recommandations de prescripteurs** : experts-comptables (ils voient l'informatique de leurs clients), vendeurs de matériel et de fournitures de bureau, fournisseurs d'accès à internet, assureurs. Proposer un échange de recommandations, sans commission pendant le pilote.
3. **Associations et ordres professionnels** : ordre des experts-comptables, barreau, ordre des médecins, chambre de commerce, groupements patronaux. Proposer une courte intervention sur « 5 erreurs informatiques qui coûtent cher aux cabinets ».
4. **LinkedIn** : recherche par fonction (gérant, associé, directeur) et taille d'entreprise (11 à 50 salariés), dans la ville du pilote. 10 invitations personnalisées par jour au maximum.
5. **Visite de quartier d'affaires** : passer dans les cabinets d'un même immeuble ou d'une même rue, demander le dirigeant, laisser une carte avec le lien vers la démo.
6. **Groupes WhatsApp professionnels** dont le fondateur est déjà membre : partager un conseil utile, jamais une publicité directe.

## Suivi

Tenir une liste simple (tableur) : entreprise, contact, canal, date du premier contact, note de qualification, prochaine action, statut (contacté, démo planifiée, démo faite, pilote proposé, signé, perdu). Objectif hebdomadaire indicatif (hypothèse) : 20 contacts, 3 démos, 1 proposition de pilote.
