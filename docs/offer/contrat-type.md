# Contrat type de services d'informatique gérée

> ## ⚠️ Avertissement — à lire avant tout usage
>
> **Ce document est un modèle de travail. Il n'a été relu par aucun juriste. Il ne doit être ni signé, ni envoyé à un client, ni utilisé comme base de négociation avant d'avoir été relu et validé par un avocat ou un juriste qualifié en droit des contrats informatiques et en protection des données.**
>
> Les points qui demandent un avis juridique sont signalés par **[À VALIDER]**.

> **Hypothèses de cadrage (non fixées par le comex du 2026-11-18)**
> - **Droit applicable** : droit français. Le prestataire et le client sont des professionnels (contrat entre entreprises). Protection des données : RGPD (règlement (UE) 2016/679) et loi Informatique et Libertés.
> - **Marché cible** : PME et TPE de 5 à 50 postes, en France métropolitaine.
> - **Si le client est hors de France**, par exemple en zone CEMAC avec facturation en XAF, ou si le contrat est libellé en USD : le droit applicable, la juridiction, la loi locale de protection des données et la fiscalité changent. Ce modèle devra alors être réécrit par un juriste du pays concerné (droit OHADA et loi nationale sur les données personnelles en Afrique centrale, par exemple). **[À VALIDER]**
> - Offre et prix : `docs/offer/offre.md`. Assurances : `docs/offer/assurance.md`.

---

**Entre**

[Raison sociale du prestataire], [forme], au capital de [●], immatriculée sous le numéro [●], dont le siège est [●], représentée par [●], ci-après « **le Prestataire** »,

**et**

[Raison sociale du client], [forme], immatriculée sous le numéro [●], dont le siège est [●], représentée par [●], ci-après « **le Client** »,

ensemble « les Parties ».

## Article 1 — Objet

Le présent contrat fixe les conditions dans lesquelles le Prestataire fournit au Client des services d'informatique gérée : supervision, maintenance, sécurité, sauvegarde et support à distance du parc informatique désigné en Annexe 1, selon la formule choisie.

## Article 2 — Documents contractuels

Le contrat est formé, par ordre de priorité décroissant, de :
1. les présentes conditions ;
2. l'Annexe 1 — Formule, périmètre (postes, serveurs, sites) et prix ;
3. l'Annexe 2 — Niveaux de service ;
4. l'Annexe 3 — Politique d'actions autorisées ;
5. l'Annexe 4 — Accord de traitement des données personnelles ;
6. l'Annexe 5 — Plan de réversibilité ;
7. le rapport d'audit initial.

Les conditions générales d'achat du Client ne s'appliquent pas, sauf accord écrit contraire.

## Article 3 — Durée

3.1. **Période pilote** : le contrat commence à la date de signature pour une période pilote de trois (3) mois.

3.2. À l'issue de la période pilote, sauf dénonciation par l'une des Parties au moins quinze (15) jours avant son terme, le contrat se poursuit pour une durée de douze (12) mois, puis se renouvelle tacitement par périodes de douze (12) mois, sauf dénonciation trois (3) mois avant l'échéance.

**[À VALIDER]** Vérifier si certaines protections du Code de la consommation peuvent bénéficier à un client professionnel de cinq salariés au plus, lorsque le contrat est conclu hors établissement et n'entre pas dans son activité principale (article L. 221-3 du Code de la consommation), et adapter la procédure de signature.

## Article 4 — Description des services

Les services inclus dépendent de la formule choisie (Annexe 1). Les services non listés sont exclus et peuvent faire l'objet d'un devis.

Le Prestataire exploite des logiciels open source (notamment OPNsense, MeshCentral, FleetDM, Wazuh, GLPI, Zabbix, NetBird, RustDesk) et son propre tableau de bord. Ces logiciels restent soumis à leurs licences respectives.

## Article 5 — Heures de service et niveaux de service

5.1. Les services sont rendus **du lundi au vendredi, de 9 h à 18 h (heure de Paris), hors jours fériés en France métropolitaine** (« heures ouvrées »).

5.2. **Aucune astreinte** n'est assurée la nuit, le week-end ni les jours fériés. Les alertes et demandes reçues en dehors des heures ouvrées sont traitées à leur reprise. Le Client le reconnaît et en tient compte dans son organisation.

5.3. Les délais de l'Annexe 2 sont des **délais de prise en charge**, comptés en heures ouvrées. Ce sont des objectifs ; ils ne constituent pas une garantie de délai de résolution. Pendant la période pilote, leur non-respect ne donne lieu à aucune pénalité.

## Article 6 — Obligation de moyens

6.1. Le Prestataire est tenu d'une **obligation de moyens**. Il met en œuvre les compétences, le soin et les outils conformes aux usages de la profession pour fournir les services.

6.2. Le Client reconnaît qu'aucune mesure de sécurité ne peut garantir l'absence totale d'incident, d'intrusion, de perte de données ou d'interruption de service. Le Prestataire ne garantit pas que le système d'information du Client sera exempt de vulnérabilités ou d'attaques.

## Article 7 — Accord préalable du Client avant toute action

7.1. **Aucune action n'est réalisée sur l'environnement du Client sans son accord préalable.**

7.2. Les actions de routine (déploiement des mises à jour dans les fenêtres de maintenance convenues, redémarrages planifiés, collecte d'inventaire et d'alertes) sont autorisées par la **Politique d'actions autorisées** (Annexe 3), signée par le Client. Le Client peut la modifier ou la révoquer à tout moment par écrit ; la modification prend effet au plus tard le jour ouvré suivant.

7.3. Toute autre action, notamment désinstallation de logiciel, isolement d'un poste, réinitialisation ou blocage d'un compte, modification du pare-feu, suppression ou restauration de données, nécessite l'**accord explicite** de l'interlocuteur habilité du Client, donné par écrit (ticket, message, validation dans le tableau de bord). Le Prestataire conserve la trace de chaque accord.

7.4. Le Client peut pré-autoriser, dans l'Annexe 3, une liste limitative d'actions d'urgence (par exemple l'isolement réseau d'un poste présentant des signes de compromission). Ces actions restent exécutées par un opérateur, pendant les heures ouvrées, et sont signalées au Client sans délai.

7.5. Lorsque le Client refuse ou tarde à donner un accord recommandé par le Prestataire, celui-ci en conserve la trace et n'est pas responsable des conséquences de l'absence d'action.

## Article 8 — Obligations du Client

Le Client s'engage à :
- désigner un interlocuteur habilité, et un suppléant, joignables en heures ouvrées ;
- déclarer tous les postes, serveurs et sites de son parc et maintenir l'Annexe 1 à jour ;
- laisser installés et actifs les agents du Prestataire ;
- disposer de licences valides pour les logiciels utilisés ;
- informer le Prestataire de tout changement de son système d'information (nouveau poste, nouveau logiciel, changement de fournisseur d'accès) ;
- ne pas désactiver les mesures de sécurité mises en place sans en informer le Prestataire ;
- mettre en œuvre les recommandations de sécurité jugées critiques par le Prestataire, ou accepter par écrit le risque de ne pas le faire ;
- signaler sans délai toute anomalie ou suspicion d'incident ;
- sensibiliser ses salariés aux règles de sécurité de base (mots de passe, hameçonnage).

## Article 9 — Sauvegardes

9.1. **Périmètre** : le Prestataire sauvegarde uniquement les données listées en Annexe 1 (par défaut : les dossiers utilisateurs des postes couverts, dans la limite du volume de la formule). Les données hors de ce périmètre (applications métier hébergées par des tiers, messageries en ligne non souscrites en option, supports amovibles, postes non déclarés) ne sont pas sauvegardées.

9.2. **Modalités** : fréquence quotidienne ; conservation de trente (30) jours ; au moins une copie hors du site du Client, chiffrée ; hébergement des sauvegardes dans l'Union européenne. **[Hypothèses à confirmer selon le fournisseur de stockage retenu.]**

9.3. **Tests de restauration** : le Prestataire réalise des tests de restauration sur un échantillon, à la fréquence prévue par la formule, et en communique le résultat au Client.

9.4. **Vérification par le Client** : le Client vérifie que le périmètre de sauvegarde couvre ses données importantes et signale tout manque. Il reste responsable de ses données et de la décision de ce qui est sauvegardé.

9.5. **Limite** : le Prestataire s'engage à mettre en œuvre les moyens convenus de sauvegarde et de restauration. Il ne garantit pas la restauration intégrale des données, notamment en cas de corruption antérieure à la plus ancienne sauvegarde conservée, de données jamais incluses au périmètre, ou d'attaque ayant aussi atteint les sauvegardes malgré les mesures convenues.

9.6. Toute restauration est réalisée avec l'accord du Client (article 7), qui choisit le point de restauration.

## Article 10 — Exclusions

Sont exclus des services et de la responsabilité du Prestataire, sauf option ou devis accepté :

a) **Matériel hors contrat** : le matériel, sa garantie, sa réparation et son remplacement ; les équipements non déclarés en Annexe 1 ; les pannes matérielles et leurs conséquences sur les données non sauvegardées.

b) **Rançongiciel et attaques malgré les mesures** : les dommages causés par un rançongiciel, un logiciel malveillant ou une intrusion survenus alors que le Prestataire avait mis en œuvre les mesures prévues au contrat. L'intervention de crise et de remise en état est facturée au taux horaire en vigueur, après accord du Client. Le Prestataire ne verse aucune rançon et ne négocie pas avec les attaquants.

c) Les dommages résultant d'une action ou d'une omission du Client, de ses salariés ou de ses prestataires, notamment le non-respect de l'article 8 ou le refus d'une action recommandée (article 7.5).

d) Les logiciels et applications métier, les services de tiers (fournisseur d'accès, éditeurs, hébergeurs choisis par le Client) et leurs défaillances.

e) Les systèmes qui ne sont plus maintenus par leur éditeur.

f) Les interventions hors heures ouvrées, sauf accord écrit et facturation majorée.

g) Les cas de force majeure au sens de l'article 1218 du Code civil.

## Article 11 — Responsabilité

11.1. Chaque Partie est responsable des dommages directs et prouvés causés à l'autre par sa faute dans l'exécution du contrat.

11.2. **Plafond** : la responsabilité totale du Prestataire, toutes causes confondues et pour toute la durée du contrat, est limitée au **montant hors taxes effectivement payé par le Client au titre du contrat pendant les douze (12) mois précédant le fait générateur**. Pendant la période pilote, le plafond est égal au montant hors taxes prévu pour les douze premiers mois de l'Annexe 1. **[À VALIDER : niveau du plafond, cohérence avec le plafond d'assurance — voir `assurance.md`.]**

11.3. **Dommages indirects** : le Prestataire n'est pas responsable des dommages indirects, notamment perte de chiffre d'affaires, perte de clientèle, atteinte à l'image, perte d'exploitation, ni des pertes de données hors du périmètre de sauvegarde.

11.4. **Limites légales** : le plafond et les exclusions ne s'appliquent pas en cas de faute lourde ou dolosive, ni aux dommages corporels. **[À VALIDER : une clause qui prive de sa substance l'obligation essentielle du débiteur est réputée non écrite (article 1170 du Code civil) ; le juriste vérifiera que le plafond et les exclusions des articles 10 et 11 restent opposables, et l'articulation avec l'article 82 du RGPD pour les dommages liés aux données.]**

11.5. Toute action en responsabilité contre le Prestataire doit être engagée dans un délai d'un (1) an à compter de la découverte du fait générateur. **[À VALIDER, article 2254 du Code civil.]**

## Article 12 — Prix, facturation et paiement

12.1. Les prix figurent en Annexe 1, hors taxes, dans la monnaie fixée à l'article 12.2. La TVA ou la taxe équivalente est ajoutée au taux en vigueur.

12.2. **Monnaie** : le contrat est libellé en [euros / francs CFA (XAF) / dollars américains (USD)]. S'il est libellé en USD, l'Annexe 1 indique le taux de conversion retenu, sa source et sa date, et les Parties conviennent de [figer le prix en USD pour la durée du contrat / réviser le prix si l'écart de change dépasse 5 % à la date anniversaire]. La parité EUR/XAF est fixe. **[À VALIDER selon le pays du Client.]**

12.3. Le forfait mensuel est facturé à terme à échoir, le premier jour de chaque mois, sur la base du nombre de postes déclarés. Les frais de mise en route sont facturés à la signature. Les prestations hors forfait, acceptées au préalable par le Client, sont facturées le mois suivant.

12.4. Les factures sont payables à trente (30) jours date de facture, par virement ou prélèvement.

12.5. En cas de retard de paiement, sont dus de plein droit des pénalités au taux prévu à l'article L. 441-10 du Code de commerce et une indemnité forfaitaire pour frais de recouvrement de quarante (40) euros. Après mise en demeure restée sans effet pendant quinze (15) jours, le Prestataire peut suspendre les services, à l'exception de la conservation des sauvegardes existantes.

12.6. **Révision** : les prix peuvent être révisés une fois par an à la date anniversaire, selon l'évolution de l'indice Syntec, sans pouvoir dépasser [●] %. **[À VALIDER : indice et formule.]**

## Article 13 — Protection des données personnelles

13.1. Pour l'exécution du contrat, le Prestataire traite des données personnelles pour le compte du Client (noms et identifiants des utilisateurs, inventaire des postes, journaux techniques, contenu des sauvegardes). Le Client est **responsable du traitement**, le Prestataire est **sous-traitant** au sens de l'article 28 du RGPD.

13.2. Les engagements du Prestataire sont détaillés en Annexe 4. Il s'engage notamment à :
- traiter les données uniquement sur instruction documentée du Client, et pour les seules finalités du contrat ;
- garantir la confidentialité des données et faire signer un engagement de confidentialité aux personnes qui y ont accès ;
- mettre en œuvre des mesures de sécurité appropriées (article 32 du RGPD), notamment chiffrement des sauvegardes et des flux, authentification forte des opérateurs, journalisation des accès ;
- ne recourir à un autre sous-traitant (hébergeur du serveur, stockage des sauvegardes) qu'avec l'autorisation écrite générale du Client, en l'informant de tout changement prévu pour lui permettre de s'y opposer ; la liste des sous-traitants ultérieurs figure en Annexe 4 ;
- héberger les données dans l'Union européenne, sauf accord écrit du Client et garanties de l'article 46 du RGPD ;
- notifier au Client toute violation de données personnelles **dans les meilleurs délais, et au plus tard quarante-huit (48) heures** après en avoir pris connaissance, pour lui permettre de respecter son propre délai de 72 heures auprès de l'autorité de contrôle ; **[À VALIDER : délai et application hors heures ouvrées]**
- aider le Client à répondre aux demandes d'exercice des droits des personnes et à réaliser ses analyses d'impact ;
- au terme du contrat, restituer puis supprimer les données selon l'article 15, et en attester par écrit ;
- mettre à disposition du Client les informations nécessaires pour démontrer le respect de ces obligations et permettre des audits, à la charge du Client, avec un préavis de trente (30) jours.

13.3. Le Prestataire est responsable de traitement pour ses propres données de gestion de la relation (contacts du Client, facturation).

## Article 14 — Confidentialité

Chaque Partie garde confidentielles les informations de l'autre dont elle a connaissance, notamment les accès, mots de passe, configurations, vulnérabilités constatées et rapports d'incident, pendant la durée du contrat et cinq (5) ans après sa fin.

## Article 15 — Fin du contrat et réversibilité

15.1. **Résiliation pour manquement** : en cas de manquement grave d'une Partie, l'autre peut résilier le contrat par lettre recommandée, trente (30) jours après une mise en demeure restée sans effet.

15.2. **Fin de la période pilote** : chaque Partie peut mettre fin au contrat au terme de la période pilote, selon l'article 3.2, sans indemnité.

15.3. **Réversibilité** : à la fin du contrat, quelle qu'en soit la cause, le Prestataire remet au Client ou au prestataire désigné par lui, dans un délai de trente (30) jours :
- l'inventaire à jour du parc ;
- la documentation des configurations (pare-feu, accès distant, politiques de mise à jour) ;
- les identifiants et accès d'administration détenus pour le compte du Client, par un canal sécurisé ;
- une copie de la dernière sauvegarde complète, dans un format standard, ou l'accès à celle-ci pendant le délai de réversibilité ;
- l'historique des tickets et des incidents.

15.4. Pendant le délai de réversibilité, le Prestataire maintient les sauvegardes existantes. Il désinstalle ensuite ses agents, avec l'accord du Client, ou fournit la procédure pour le faire.

15.5. La remise des éléments listés à l'article 15.3 est incluse dans le prix. Toute assistance supplémentaire (formation du nouveau prestataire, migration) est facturée au taux horaire, sur devis accepté.

15.6. Après la réversibilité, le Prestataire supprime les données du Client, y compris les sauvegardes, dans un délai de [trente (30)] jours, et en atteste par écrit, sauf obligation légale de conservation.

15.7. La réversibilité est due même en cas de résiliation pour défaut de paiement, sous réserve du règlement des sommes échues. **[À VALIDER]**

## Article 16 — Assurance

Le Prestataire déclare être titulaire d'une assurance de responsabilité civile professionnelle couvrant les activités du contrat, et s'engage à fournir une attestation à jour sur demande. **[Ne signer aucun contrat avant que l'assurance soit effectivement souscrite — voir `assurance.md`.]**

## Article 17 — Non-sollicitation

Pendant le contrat et douze (12) mois après sa fin, chaque Partie s'interdit de solliciter un salarié de l'autre ayant participé à l'exécution du contrat, sauf accord écrit. **[À VALIDER : clause optionnelle.]**

## Article 18 — Droit applicable et litiges

18.1. Le contrat est soumis au **droit français**. **[Hypothèse : à adapter si le Client n'est pas établi en France.]**

18.2. Les Parties recherchent d'abord un accord amiable pendant trente (30) jours. À défaut, le litige est porté devant le tribunal de commerce de [●].

---

Fait à [●], le [●], en deux exemplaires.

| Pour le Prestataire | Pour le Client |
|---|---|
| Nom, qualité, signature | Nom, qualité, signature |

---

## Annexe 1 — Formule, périmètre et prix

- Formule : [Essentiel / Sérénité / Sérénité+]
- Postes couverts : [liste ou nombre, issue de l'audit initial]
- Serveurs couverts : [●]
- Sites couverts : [●]
- Périmètre de sauvegarde : [dossiers, volume]
- Prix mensuel HT : [●] ; frais de mise en route HT : [●]
- Monnaie et, le cas échéant, taux de conversion (source, date) : [●]
- Interlocuteur habilité du Client et suppléant : [●]

## Annexe 2 — Niveaux de service

Reprendre le tableau des priorités et des délais de prise en charge en heures ouvrées de `docs/offer/offre.md` (§ 5), dans sa version en vigueur à la signature.

## Annexe 3 — Politique d'actions autorisées

| Action | Autorisée sans accord au cas par cas ? | Conditions |
|---|---|---|
| Déploiement des mises à jour de sécurité Windows | [Oui / Non] | Fenêtre : [jour, heure] |
| Redémarrage planifié des postes | [Oui / Non] | Fenêtre : [●], avec message aux utilisateurs |
| Mise à jour des logiciels tiers courants | [Oui / Non] | Liste : [●] |
| Isolement réseau d'un poste compromis (urgence) | [Oui / Non] | Opérateur, heures ouvrées, information immédiate du Client |
| Toute autre action | **Non** | Accord explicite et tracé (article 7.3) |

Date de la version : [●]. Signature de l'interlocuteur habilité : [●].

## Annexe 4 — Accord de traitement des données personnelles

- Objet et durée du traitement : exécution du contrat.
- Nature et finalités : supervision, maintenance, sécurité, sauvegarde et support du parc.
- Catégories de données : identité et identifiants des utilisateurs, données techniques des postes, journaux de connexion et de sécurité, contenu des fichiers sauvegardés.
- Catégories de personnes : salariés et utilisateurs du Client ; toute personne dont les données figurent dans les fichiers sauvegardés.
- Sous-traitants ultérieurs : [hébergeur du serveur dédié, pays] ; [stockage des sauvegardes, pays].
- Mesures de sécurité : [liste détaillée à compléter].

**[À VALIDER : compléter selon le modèle de clauses contractuelles de la Commission européenne pour l'article 28 (décision d'exécution (UE) 2021/915), ou un modèle validé par le juriste.]**

## Annexe 5 — Plan de réversibilité

Reprendre l'article 15, avec le calendrier, les formats de remise et les contacts.
