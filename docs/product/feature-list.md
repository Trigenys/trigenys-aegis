# Aegis : liste des fonctionnalités du cockpit PME

Statut : brouillon v0, issu de la décision comex du 2026-11-18 (`docs/decisions/comex-log.md`).

Aegis devient le cockpit unifié d'informatique gérée pour PME. Il agrège des outils open source existants, chacun branché par un adaptateur, et ne les réimplémente pas.

## Phases

| Phase | Objectif | Fenêtre |
|---|---|---|
| **P0 : pilote** | Opérer 3 PME avec les consoles natives, plus un cockpit minimal en lecture seule | Mois 0 à 3 |
| **P1 : cockpit v1** | Piloter et agir depuis Aegis sans ouvrir les consoles natives | Mois 3 à 9 |
| **P2 : marque blanche** | Revendre la plateforme à d'autres prestataires | Après 9 mois |

## Profils

- **Opérateur** : toi et ton équipe support. Vue de tous les clients, web sur grand écran.
- **Dirigeant** : le client. Score, alertes importantes, validation des actions sensibles, surtout sur mobile.
- **Salarié** : ouvre un ticket et suit sa demande. Aucun écran à apprendre.

## Fonctionnalités par module

### 1. Clients, sites et accès
| Fonctionnalité | Phase |
|---|---|
| Création d'un client, de ses sites et de ses contacts | P0 |
| Isolation stricte des données par client, établie à l'ingestion | P0 |
| Rôles opérateur, dirigeant et salarié | P0 |
| Authentification forte et MFA | P1 |
| Connexion avec le compte Microsoft 365 ou Google du client | P2 |

### 2. Inventaire du parc
Sources : osquery ou FleetDM, MeshCentral, GLPI.
| Fonctionnalité | Phase |
|---|---|
| Liste des postes et serveurs, avec système, matériel et utilisateur | P0 |
| Logiciels installés par poste | P1 |
| Équipements réseau découverts, dont les appareils inconnus | P1 |
| Licences, garanties et fin de vie du matériel | P2 |

### 3. Santé et supervision
Sources : Zabbix, agents.
| Fonctionnalité | Phase |
|---|---|
| Score de santé par client, compréhensible par un dirigeant | P0 |
| Postes hors ligne, disque plein, service arrêté | P0 |
| Disponibilité des serveurs et de la connexion internet | P1 |
| Historique et tendances | P1 |

### 4. Sécurité
Sources : Wazuh, Microsoft Defender, OPNsense.
| Fonctionnalité | Phase |
|---|---|
| Alertes de sécurité normalisées et dédoublonnées | P0 |
| État de l'antivirus et du pare-feu de chaque poste | P0 |
| Corrélation en incidents expliqués, avec preuves et action recommandée | P1 |
| Vulnérabilités connues par poste, classées par gravité | P1 |
| Conformité à un socle de sécurité, par exemple CIS | P2 |

### 5. Mises à jour et correctifs
Sources : FleetDM, MeshCentral, Windows Update.
| Fonctionnalité | Phase |
|---|---|
| État des mises à jour de chaque poste | P0 |
| Politique de mise à jour par client, avec fenêtres de maintenance | P1 |
| Déploiement des correctifs depuis Aegis, avec rapport de résultat | P1 |
| Mise à jour des logiciels tiers courants | P2 |

### 6. Déploiement et scripts
| Fonctionnalité | Phase |
|---|---|
| Installation d'un logiciel sur un poste ou un groupe de postes | P1 |
| Bibliothèque de scripts approuvés, exécutés avec journal | P1 |
| Configuration type d'un nouveau poste | P2 |

### 7. Accès à distance
Sources : MeshCentral, RustDesk.
| Fonctionnalité | Phase |
|---|---|
| Ouvrir une prise en main depuis la fiche du poste | P1 |
| Consentement de l'utilisateur et journal des sessions | P1 |

### 8. Réseau
Sources : OPNsense, NetBird.
| Fonctionnalité | Phase |
|---|---|
| État du boîtier, du VPN et de la connexion internet | P0 |
| Débit et principaux consommateurs de bande passante | P1 |
| Règles de filtrage et accès distants, en lecture | P1 |
| Modification des règles avec validation | P2 |

### 9. Support
Sources : GLPI ou Zammad, WhatsApp.
| Fonctionnalité | Phase |
|---|---|
| Ouverture de ticket par lien web ou par WhatsApp | P0 |
| Lien automatique entre ticket, poste et alerte | P1 |
| Délais d'intervention suivis par contrat | P1 |
| Base de solutions réutilisables | P2 |

### 10. Sauvegardes
Sources : Restic ou UrBackup.
| Fonctionnalité | Phase |
|---|---|
| État de la dernière sauvegarde par poste et par serveur | P1 |
| Test de restauration planifié, avec preuve | P2 |

### 11. Actions et validation
| Fonctionnalité | Phase |
|---|---|
| Aucune action sur l'environnement d'un client sans règle ou accord explicite | P0 |
| Demande de validation au dirigeant pour les actions sensibles | P1 |
| Journal d'audit infalsifiable de toutes les actions | P1 |

### 12. Rapports
| Fonctionnalité | Phase |
|---|---|
| Rapport mensuel automatique par client, en PDF | P0 |
| Tableau de bord du dirigeant | P1 |
| Export des données du client | P2 |

### 13. Notifications
Source : trigenys-notify.
| Fonctionnalité | Phase |
|---|---|
| Alertes critiques par WhatsApp | P0 |
| Notifications par e-mail | P0 |
| Notifications push de l'application mobile | P1 |

### 14. Mise en service d'un client
| Fonctionnalité | Phase |
|---|---|
| Script unique d'installation des agents sur un poste | P0 |
| Boîtier OPNsense préconfiguré, relié automatiquement | P1 |
| Liste de contrôle de mise en service | P1 |

### 15. Facturation
| Fonctionnalité | Phase |
|---|---|
| Comptage automatique des postes gérés par client | P1 |
| Abonnement mensuel par poste et factures | P2 |

### 16. Marque blanche
| Fonctionnalité | Phase |
|---|---|
| Logo, couleurs et domaine du prestataire revendeur | P2 |
| Plusieurs prestataires, chacun avec ses propres clients | P2 |

### 17. Socle technique
| Fonctionnalité | Phase |
|---|---|
| Un adaptateur par outil source, remplaçable sans toucher au cœur | P0 |
| Ingestion authentifiée des événements | P0 |
| API publique documentée | P2 |

## Supports

- **Web responsive** dès P0.
- **Application mobile installable**, en PWA, en P1.
- **Pas d'application de bureau** : les postes ont déjà leurs agents.

## Hors périmètre

- Réimplémenter un antivirus, un RMM ou un SIEM.
- Une surveillance humaine 24h/24 pendant le pilote.
- Tactical RMM, pour raison de licence.
