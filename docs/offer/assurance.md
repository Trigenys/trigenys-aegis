# Assurances de l'offre d'informatique gérée

Statut : brouillon v0. La décision comex du 2026-11-18 exige « un contrat type limitant la responsabilité, et une assurance » avant le pilote.

> **Hypothèses de cadrage (non fixées par le comex)**
> - Prestataire établi en France, clients PME en France métropolitaine, droit français.
> - Si des clients sont hors de France (zone CEMAC, contrats en XAF ou en USD), demander au courtier si les polices couvrent ces pays et ces contrats ; à défaut, il faudra un assureur local.
> - Ce document n'est pas un conseil en assurance. Les montants sont des repères publics ou des **hypothèses** ; seul un devis de courtier fait foi.

**Règle de démarrage** : aucun contrat client n'est signé avant que la responsabilité civile professionnelle soit souscrite et que l'attestation soit reçue.

## 1. Assurances à souscrire

| Assurance | Ce qu'elle couvre | Priorité | Pourquoi ici |
|---|---|---|---|
| **Responsabilité civile professionnelle (RC Pro) informatique** | Les dommages causés aux clients par une erreur, une omission ou une négligence dans la prestation, y compris les **dommages immatériels non consécutifs** (perte de données, arrêt d'activité du client sans dommage matériel préalable) | **Obligatoire avant le pilote** (décision comex) | Le risque principal du service : une mise à jour qui bloque un client, une sauvegarde qui ne restaure pas, une mauvaise configuration du pare-feu |
| **Cyber (dommages propres et responsabilité)** | Les conséquences d'une attaque **contre le prestataire lui-même** : frais de réponse à incident, notification, perte d'exploitation, et la responsabilité si l'attaque se propage aux clients par ses outils | **Obligatoire avant le pilote** (recommandé) | Le serveur qui pilote les agents a un accès d'administration sur tous les postes clients : c'est la cible la plus rentable pour un attaquant |
| Protection juridique professionnelle | Les frais d'avocat en cas de litige avec un client ou un fournisseur | Utile | Litige sur une facture, une clause de responsabilité ou une réversibilité |
| Multirisque bureau | Locaux, matériel du prestataire | Selon l'installation | Sans objet si pas de local |

Une RC Pro « généraliste » exclut souvent les dommages immatériels ou les risques cyber : il faut une police **adaptée aux métiers de l'informatique**, qui nomme explicitement l'infogérance et l'administration à distance.

## 2. Repères de prix publics

Relevés le 2026-11-18 sur des comparateurs et courtiers, donc commerciaux. Ils concernent surtout des indépendants ou de petites structures, sans activité d'infogérance avec accès d'administration : la prime réelle sera probablement plus élevée.

| Assurance | Repère | Source | Fiabilité |
|---|---|---|---|
| RC Pro informatique | 200 à 350 € par an, chiffre d'affaires inférieur à 100 k€, plafond 100 k€ | [Philtr](https://philtr.fr/responsabilite-civile-professionnelle/metier/informatique) | Comparateur ; consulté via moteur de recherche le 2026-11-18 |
| RC Pro consultant informatique | Environ 180 € par an | [Coover](https://www.coover.fr/responsabilite-civile-pro/metiers/informatique) | Idem |
| Cyber TPE | À partir de 350 € par an pour un plafond de 50 000 € | [Coover](https://www.coover.fr/cyber-assurance) | Idem |
| Cyber TPE peu exposée | À partir d'environ 44 € par mois | [Tech-insider](https://tech-insider.org/fr/?p=5157) | Article de septembre 2026 ; chiffre peu clair, à confirmer chez l'assureur |
| Prérequis des assureurs cyber | Les assureurs exigent de plus en plus des mesures techniques et peuvent refuser l'indemnisation si elles manquent | [Clubic](https://clubic.com//dossier-595015-cyber-assurance-les-5-prerequis-techniques-que-les-assureurs-imposent-maintenant.html) | Article ; consulté via moteur de recherche le 2026-11-18 |

**Budget de départ (hypothèse)** : 1 500 à 3 000 € par an pour la RC Pro et la cyber ensemble, compte tenu de l'activité d'infogérance. À remplacer par les devis.

## 3. Cohérence avec le contrat type

Le contrat type (`contrat-type.md`, article 11) plafonne la responsabilité au montant payé par le client sur douze mois. Ordre de grandeur pour le pilote (hypothèse) : 20 postes en formule Sérénité à 49 € = 980 € par mois, soit un plafond d'environ 11 760 € par client.

- Le **plafond de garantie** de la RC Pro doit couvrir au moins la somme des plafonds contractuels de tous les clients pour un même sinistre, car un incident sur le serveur commun peut toucher tous les clients en même temps. Pour 3 PME, viser au moins 300 000 € par sinistre et par an (hypothèse), et revoir à chaque nouveau client.
- Le plafond contractuel peut être écarté par un juge (faute lourde, obligation essentielle) : l'assurance doit donc couvrir au-delà du plafond du contrat.
- La **franchise** doit rester supportable en trésorerie : viser 1 000 à 1 500 € au plus (hypothèse).

## 4. Questions à poser au courtier

### Activité couverte
1. La police couvre-t-elle explicitement l'**infogérance**, la **supervision à distance** et l'**administration des postes et serveurs des clients** avec des droits d'administrateur ?
2. Le déploiement automatique de mises à jour validées par le client est-il couvert, y compris quand une mise à jour bloque des postes ?
3. La gestion du pare-feu et des accès distants (VPN) des clients est-elle couverte ?
4. La sauvegarde et la restauration des données des clients sont-elles couvertes, y compris une restauration qui échoue ?
5. L'utilisation de logiciels open source plutôt que de logiciels commerciaux change-t-elle quelque chose à la couverture ?

### Dommages et plafonds
6. Les **dommages immatériels non consécutifs** sont-ils couverts, et avec quel sous-plafond ?
7. Quel plafond par sinistre et par année ? Un même incident touchant plusieurs clients compte-t-il comme un seul sinistre ?
8. Quelle franchise, par sinistre ou par client touché ?
9. Les frais de défense sont-ils inclus dans le plafond ou en plus ?
10. La couverture suit-elle la limitation de responsabilité du contrat, ou l'assureur exige-t-il des clauses précises ? Peut-il relire le contrat type ?

### Cyber
11. Si le serveur du prestataire est compromis et que l'attaquant passe par lui pour chiffrer les postes des clients, quelle police joue : RC Pro, cyber, ou aucune ? Y a-t-il un risque de trou entre les deux ?
12. Les frais de réponse à incident (expert, notification CNIL et clients, communication de crise) sont-ils couverts ?
13. Le paiement d'une rançon est-il exclu ? Il est de toute façon exclu par le contrat type.
14. Quels **prérequis de sécurité** sont exigés à la souscription (authentification forte, sauvegardes hors ligne, EDR, correctifs) ? Leur absence peut-elle annuler l'indemnisation ?
15. Une assistance de crise 24 h sur 24 est-elle incluse ? C'est utile puisque le prestataire n'assure pas d'astreinte.

### Données personnelles
16. Les sanctions de la CNIL sont-elles assurables ? Les frais de défense devant la CNIL sont-ils couverts ?
17. Une violation de données chez un client, causée par une faute du prestataire en tant que sous-traitant RGPD, est-elle couverte ?

### Exclusions et géographie
18. Quelles sont les exclusions précises (faute intentionnelle, défaut de mise à jour, matériel en fin de support, guerre ou cyberattaque d'État) ?
19. La couverture est-elle mondiale, ou limitée à la France ou à l'Union européenne ? Couvre-t-elle des clients en zone CEMAC ou des contrats libellés en USD ou en XAF ?
20. Les sous-traitants du prestataire (hébergeur, stockage des sauvegardes) sont-ils couverts, et faut-il des renonciations à recours ?

### Gestion du contrat
21. Comment déclarer une hausse du chiffre d'affaires ou du nombre de postes gérés en cours d'année ?
22. Couverture des réclamations après la fin de la police (garantie subséquente) : quelle durée ?
23. Délai pour obtenir l'attestation, et peut-on l'obtenir avant le premier client ?

## 5. Prochaines étapes

1. Demander des devis à au moins deux courtiers spécialisés dans les métiers de l'informatique, avec ce document et le contrat type.
2. Faire relire le contrat type par l'assureur retenu et par un juriste.
3. Mettre à jour le plafond de l'article 11 du contrat type et la section 3 ci-dessus avec les montants réels.
4. Archiver les attestations et les dates de renouvellement.
