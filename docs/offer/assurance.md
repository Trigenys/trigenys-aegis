# Assurances de l'offre d'informatique gérée — Cameroun

Statut : brouillon v1. La décision comex du 2026-11-18 exige « un contrat type limitant la responsabilité, et une assurance » avant le pilote.

> **Hypothèses de cadrage**
> - **Marché** (fixé par le comex) : prestataire et clients PME à Douala et à Yaoundé (Cameroun), droit camerounais et OHADA.
> - **Cadre de l'assurance** : Code des assurances de la CIMA (Conférence interafricaine des marchés d'assurances), applicable dans les États membres dont le Cameroun ; contrôle national par la **Direction des Assurances du ministère des Finances**. Une police doit être souscrite auprès d'une compagnie agréée au Cameroun. **[À VALIDER avec le courtier]** : possibilité ou non de s'assurer directement à l'étranger.
> - **Montants** en FCFA (XAF). Aucun tarif public de RC Pro informatique ni d'assurance cyber n'a été trouvé au Cameroun : tous les montants ci-dessous sont des **hypothèses** jusqu'aux devis.
> - Ce document n'est pas un conseil en assurance ; seul un devis d'assureur ou de courtier agréé fait foi.

**Règle de démarrage** : aucun contrat client n'est signé avant que la responsabilité civile professionnelle soit souscrite et que l'attestation soit reçue.

## 1. Assurances à souscrire

| Assurance | Ce qu'elle couvre | Priorité | Pourquoi ici |
|---|---|---|---|
| **Responsabilité civile professionnelle (RC Pro) des métiers de l'informatique** | Les dommages causés aux clients par une erreur, une omission ou une négligence dans la prestation, y compris les **dommages immatériels non consécutifs** (perte de données, arrêt d'activité du client sans dommage matériel préalable) | **Obligatoire avant le pilote** (décision comex) | Le risque principal du service : une mise à jour qui bloque un client, une sauvegarde qui ne restaure pas, une mauvaise configuration du pare-feu |
| **Cyber (dommages propres et responsabilité)** | Les conséquences d'une attaque **contre le prestataire lui-même** : frais de réponse à incident, notification, perte d'exploitation, et la responsabilité si l'attaque se propage aux clients par ses outils | **Recommandée avant le pilote** ; à défaut d'offre locale, extension cyber de la RC Pro | Le serveur qui pilote les agents a un accès d'administration sur tous les postes clients : c'est la cible la plus rentable pour un attaquant |
| Multirisque bureau (incendie, vol, dégâts des eaux, matériel) | Locaux et matériel du prestataire, dont le serveur s'il est hébergé chez lui | Selon l'installation | Indispensable si les sauvegardes des clients sont hébergées dans les locaux de Trigenys |
| Protection juridique professionnelle | Les frais d'avocat en cas de litige | Utile | Litige sur une facture, une clause de responsabilité ou une réversibilité |

Une RC « exploitation » ou une RC générale exclut souvent les dommages immatériels et les risques informatiques : il faut une police qui nomme explicitement **l'infogérance et l'administration à distance**.

## 2. Le marché camerounais

Relevés le 2026-11-18.

| Constat | Source | Fiabilité |
|---|---|---|
| 26 compagnies d'assurance en activité en 2024 | [Ecomatin](https://ecomatin.net/cameroun-le-classement-des-compagnies-dassurances-en-2024), d'après l'Association des sociétés d'assurances du Cameroun (ASAC) | Presse économique |
| La branche IARD (dommages, dont la RC) pèse 190,3 milliards de FCFA sur 288,7 milliards de primes en 2024 | [Financial Afrik](https://www.financialafrik.com/2026/02/23/cameroun-en-2024-plus-de-65-du-marche-des-assurances-domine-par-la-branche-iard/), février 2026 | Presse économique |
| 14 compagnies habilitées en 2026 à émettre des cautions de marchés publics, dont **SanlamAllianz Cameroun, NSIA Assurances, Activa Assurances, SAAR Assurances, Chanas Assurances, AFG Assurances** | [Ecomatin](https://ecomatin.net/marches-publics-le-cameroun-autorise-14-compagnies-dassurance-a-emettre-des-cautions-en-2026), [Cameroon Tribune](https://cameroon-tribune.cm/article.html/78630/fr.html/details_2) | Liste officielle relayée par la presse ; signe de solidité, pas d'une offre cyber |
| **31 sociétés de courtage ont perdu leur agrément** par arrêté du 29 mai 2026 (caducité, détournement de primes) | [Droit Médias Finance](https://droitmediasfinance.com/index.php/actualites/droit-des-assurances/1288-cameroun-intermediation-dassurance-31-agrements-de-societes-de-courtage-dassurances-pour-caducite-et-detournements-des-primes) | Presse juridique spécialisée |
| Environ 19 millions de cyberattaques visant des entreprises et institutions au Cameroun en 2024, selon Kaspersky | [Ecomatin](https://ecomatin.net/cameroun-19-millions-de-cyberattaques-contre-les-entreprises-et-les-institutions-en-2024) | Chiffre d'éditeur ; ordre de grandeur |
| Aucune offre d'assurance cyber publiée par un assureur camerounais n'a été trouvée | Recherche du 2026-11-18 | L'absence de page publique ne prouve pas l'absence d'offre : à demander |

**Conséquences** :
- Consulter au moins **deux compagnies parmi les plus solides** (par exemple SanlamAllianz, NSIA, Activa, AXA ou Chanas) ou un courtier.
- **Vérifier l'agrément du courtier** auprès de la Direction des Assurances avant de lui verser une prime, compte tenu des retraits du 29 mai 2026. Payer la prime de préférence directement à la compagnie, contre quittance.
- La couverture cyber passera probablement par une **extension de la RC Pro** ou par la réassurance d'un groupe international présent au Cameroun (SanlamAllianz, AXA). À demander explicitement.

## 3. Budget (hypothèse)

Aucun repère public. Ordre de grandeur à confirmer par devis : **500 000 à 1 500 000 FCFA par an** pour la RC Pro avec extension cyber, selon le chiffre d'affaires, le nombre de postes gérés et les plafonds. Ce montant doit entrer dans le calcul de la marge des formules (`offre.md`).

## 4. Cohérence avec le contrat type

Le contrat type (`contrat-type.md`, article 11) plafonne la responsabilité au montant payé par le client sur douze mois. Ordre de grandeur pour le pilote (hypothèse) : 20 postes en formule Sérénité à 15 000 FCFA = 300 000 FCFA HT par mois, soit un plafond d'environ **3 600 000 FCFA** par client.

- Le **plafond de garantie** de la RC Pro doit couvrir au moins la somme des plafonds contractuels de tous les clients pour un même sinistre, car un incident sur le serveur commun peut toucher tous les clients en même temps. Pour 3 PME, viser au moins **50 000 000 FCFA par sinistre et par an** (hypothèse), avec une marge parce qu'un juge peut écarter le plafond contractuel (faute lourde) ; revoir à chaque nouveau client.
- La **franchise** doit rester supportable en trésorerie : viser 250 000 à 500 000 FCFA au plus (hypothèse).
- Le contrat type (article 16) affirme que le prestataire est assuré auprès d'une compagnie agréée au Cameroun : l'attestation doit le prouver.

## 5. Questions à poser à l'assureur ou au courtier

### Activité couverte
1. La police couvre-t-elle explicitement l'**infogérance**, la **supervision à distance** et l'**administration des postes et serveurs des clients** avec des droits d'administrateur ?
2. Le déploiement automatique de mises à jour validées par le client est-il couvert, y compris quand une mise à jour bloque des postes ?
3. La gestion du pare-feu et des accès distants (VPN) des clients est-elle couverte ?
4. La sauvegarde et la restauration des données des clients sont-elles couvertes, y compris une restauration qui échoue ?
5. L'utilisation de logiciels libres plutôt que de logiciels commerciaux change-t-elle quelque chose à la couverture ?

### Dommages et plafonds
6. Les **dommages immatériels non consécutifs** sont-ils couverts, et avec quel sous-plafond ?
7. Quel plafond par sinistre et par année ? Un même incident touchant plusieurs clients compte-t-il comme un seul sinistre ?
8. Quelle franchise, par sinistre ou par client touché ?
9. Les frais de défense sont-ils inclus dans le plafond ou en plus ?
10. L'assureur peut-il relire le contrat type, en particulier la limitation de responsabilité (article 11) et les exclusions (article 10) ?

### Cyber
11. Existe-t-il une garantie cyber, seule ou en extension de la RC Pro ? Est-elle portée par la compagnie locale ou réassurée par un groupe international ?
12. Si le serveur du prestataire est compromis et que l'attaquant passe par lui pour chiffrer les postes des clients, quelle police joue : RC Pro, cyber, ou aucune ? Y a-t-il un trou entre les deux ?
13. Les frais de réponse à incident (expert, notification des clients et de l'autorité de protection des données, communication de crise) sont-ils couverts ?
14. Le paiement d'une rançon est-il exclu ? Il l'est de toute façon par le contrat type.
15. Quels **prérequis de sécurité** sont exigés à la souscription (authentification forte, sauvegardes hors ligne, correctifs) ? Leur absence peut-elle annuler l'indemnisation ?
16. Une assistance de crise est-elle incluse, et à quelles heures ? C'est utile puisque le prestataire n'assure pas d'astreinte.

### Données personnelles et cadre légal
17. Une violation de données chez un client, causée par une faute du prestataire en tant que sous-traitant au sens de la loi n° 2024/017, est-elle couverte ?
18. Les sanctions pécuniaires de l'autorité de protection des données sont-elles assurables au Cameroun ? Les frais de défense devant elle sont-ils couverts ?
19. Les poursuites fondées sur la loi n° 2010/012 sur la cybersécurité (par exemple une accusation d'accès non autorisé) sont-elles couvertes au titre de la défense pénale ?

### Exclusions et territoire
20. Quelles sont les exclusions précises (faute intentionnelle, défaut de mise à jour, matériel en fin de support, coupure d'électricité, guerre ou cyberattaque d'État) ?
21. La couverture vaut-elle pour Douala et Yaoundé seulement, pour tout le Cameroun, ou pour la zone CIMA ? Couvre-t-elle un client établi dans un autre pays de la CEMAC ?
22. Les sous-traitants du prestataire (hébergeur, stockage des sauvegardes) sont-ils couverts, et faut-il des renonciations à recours ?

### Gestion de la police
23. Le courtier est-il **agréé par la Direction des Assurances**, et sous quel numéro ? (Vérification à faire indépendamment.)
24. Comment déclarer une hausse du chiffre d'affaires ou du nombre de postes gérés en cours d'année ?
25. Les réclamations reçues après la fin de la police sont-elles couvertes, et pendant combien de temps ?
26. Délai pour obtenir l'attestation, et peut-on l'obtenir avant le premier client ?
27. Modalités de paiement de la prime (fractionnement, paiement direct à la compagnie, quittance).

## 6. Prochaines étapes

1. Demander des devis à au moins deux compagnies agréées au Cameroun ou à un courtier dont l'agrément est vérifié, avec ce document et le contrat type.
2. Faire relire le contrat type par l'assureur retenu et par un juriste camerounais.
3. Mettre à jour le plafond de l'article 11 du contrat type et la section 4 ci-dessus avec les montants réels, et reporter la prime dans le calcul de marge de `offre.md`.
4. Archiver les attestations et les dates de renouvellement.
