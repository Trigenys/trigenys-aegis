# Pilote d'informatique gérée : démo de 15 minutes

Statut : v0 du 2026-11-18. Marché : PME de 10 à 50 salariés à Douala et à Yaoundé, WhatsApp comme canal principal (voir `cibles.md`). Le prix par poste, en FCFA, est repris de l'offre quand elle sera validée.

La démo se fait sur le **labo de démonstration** prévu par le comex (OPNsense, MeshCentral, Wazuh, GLPI), jamais sur l'environnement d'un client. On montre les écrans, on ne nomme pas les outils sauf si le prospect le demande.

## Préparation (la veille)

- Relire la fiche du prospect : secteur, nombre de postes, douleur repérée, note de qualification (`cibles.md`).
- Vérifier le labo : au moins 3 postes de démonstration en ligne, dont un avec une mise à jour en retard, un avec un disque presque plein et une alerte de sécurité simulée (par exemple plusieurs échecs de connexion).
- Préparer un ticket de démonstration ouvert depuis un téléphone, et un rapport mensuel d'exemple en PDF.
- Couper les notifications personnelles ; avoir une connexion de secours (partage du téléphone) et un ordinateur chargé, en cas de coupure d'électricité.

## Déroulé

| Minute | Étape | Ce qu'on fait | Ce qu'on dit |
|---|---|---|---|
| 0 à 2 | Accroche | Se présenter, rappeler l'objectif | « En 15 minutes, je vous montre ce que vous verriez chaque mois, puis vous me dites si cela vaut un essai. D'abord, deux ou trois questions. » |
| 2 à 5 | Découverte | Poser 3 à 4 questions ci-dessous, noter les mots exacts du dirigeant | Écouter ; ne pas montrer d'écran |
| 5 à 7 | Vue d'ensemble | Écran de synthèse : nombre de postes, postes hors ligne, score de santé | « Voici votre cabinet en un coup d'œil. Vert, tout va bien ; orange, on s'en occupe ; rouge, je vous appelle. » |
| 7 à 9 | Un problème réel | Le poste à jour en retard et le disque presque plein | « Ce poste n'a pas reçu ses correctifs depuis 40 jours (donnée du labo). C'est exactement la porte d'entrée des virus. Je le corrige à distance, en dehors des heures de travail. » |
| 9 à 11 | Sécurité | L'alerte simulée, avec son explication en une phrase | « Quelqu'un a essayé 30 fois un mot de passe sur ce poste cette nuit (scénario du labo). Vous n'avez rien à faire : je vous préviens et je bloque, avec votre accord. » |
| 11 à 12 | Support | Ouvrir un ticket depuis le téléphone, le montrer arriver | « Votre salarié m'écrit sur WhatsApp ou par un lien. Plus besoin que ce soit vous qui gériez. » |
| 12 à 13 | Rapport | Montrer le rapport mensuel PDF d'une page | « Chaque mois, une page : ce qui allait, ce qui a été corrigé, ce qui reste à décider. » |
| 13 à 15 | Proposition | Proposer le pilote (voir plus bas), convenir de la suite | « Est-ce que cela réglerait {la douleur qu'il a citée} ? » |

Si le prospect relance une étape qui le touche, rester dessus et sauter une autre étape. Ne jamais dépasser 15 minutes sans demander la permission.

## Questions de découverte

À poser entre la minute 2 et la minute 5 ; en garder 3 ou 4 selon la conversation.

1. Combien de personnes travaillent sur ordinateur chez vous ?
2. Qui s'occupe de l'informatique aujourd'hui, et comment le joignez-vous ?
3. Quelle a été la dernière panne ou le dernier souci ? Combien de temps avez-vous été bloqués ?
4. Si un ordinateur était volé ou chiffré par un virus ce soir, que perdriez-vous ? Où sont vos sauvegardes ?
5. Avez-vous déjà reçu un faux courriel de fournisseur ou un message frauduleux ?
6. Quand un salarié part, que faites-vous de ses accès ?
7. Combien dépensez-vous en informatique sur une année, à peu près ?
8. Qu'est-ce qui vous ferait dire, dans 3 mois, que cela valait la peine ?

La réponse à la question 8 devient le critère de réussite écrit dans la proposition de pilote.

## Objections probables et réponses

| Objection | Réponse |
|---|---|
| « C'est trop cher. » | « Comparons avec une journée perdue : combien vous coûte un cabinet à l'arrêt ? Le pilote dure 3 mois ; si vous n'y voyez pas de valeur, vous arrêtez. » |
| « J'ai déjà quelqu'un qui s'en occupe. » | « Très bien, je ne le remplace pas forcément. Je surveille en continu ce qu'il ne voit qu'en venant sur place, et il garde les interventions. Que fait-il quand il n'est pas là ? » |
| « On n'a jamais eu de problème. » | « Tant mieux. Savez-vous si vos mises à jour sont faites et si vos sauvegardes fonctionnent ? Le premier rapport vous le dira, chiffres à l'appui. » |
| « Je n'ai pas envie qu'on accède à mes ordinateurs. » | « C'est légitime. Rien n'est modifié sans votre accord, chaque accès est tracé, et vous pouvez tout retirer en un jour. » |
| « Et si vous avez un incident chez moi ? » | « Le contrat précise ce que je fais et ce que je ne fais pas. Pendant le pilote, je n'interviens pas la nuit ni le week-end, et je vous le dis dès maintenant. » |
| « Vous êtes une petite structure. Et si vous disparaissez ? » | « Je n'utilise aucun logiciel propriétaire qui vous enfermerait. Si on arrête, je vous remets l'inventaire de votre parc et je retire mes outils. » |
| « Je dois réfléchir. » | « Bien sûr. Qu'est-ce qui vous ferait hésiter ? » Puis fixer une date de rappel précise, dans les 7 jours. |
| « Envoyez-moi une documentation. » | « Avec plaisir. Pour qu'elle vous serve, à quoi doit-elle répondre en priorité ? » Envoyer une page, avec une date de rappel. |
| « On verra l'année prochaine. » | « Je ne prends que 3 entreprises pour ce pilote, et le démarrage se fait avant la fin de l'année. Voulez-vous que je vous garde une place ? » |

## Proposition de pilote (fin de démo)

À dire, puis à confirmer par écrit dans la journée :

- **Durée** : 3 mois, avec un point à la fin de chaque mois.
- **Périmètre** : jusqu'à {N} postes et 1 site ; surveillance, mises à jour, sécurité de base, support des salariés aux heures ouvrées, rapport mensuel.
- **Hors périmètre pendant le pilote** : interventions la nuit et le week-end, actions sur les ordinateurs sans accord du dirigeant.
- **Mise en service** : installation des outils sur les postes en une demi-journée, sans interrompre le travail.
- **Prix** : prix par poste et par mois de l'offre validée (hypothèse : tarif de pilote réduit, en échange d'un retour d'expérience et, si le client est satisfait, d'un témoignage ou d'une recommandation).
- **Critère de réussite** : la réponse du dirigeant à la question 8 de la découverte.
- **Sortie** : si le critère n'est pas atteint, arrêt sans pénalité à la fin du pilote, avec remise de l'inventaire du parc et retrait des outils.

Question de clôture : « Si je vous envoie la proposition aujourd'hui, pouvons-nous démarrer la semaine du {date} ? »

Le pilote n'est compté comme payant (critère de révision du comex au 2027-02-18) qu'une fois la première facture réglée.

## Après la démo

- Dans l'heure : message WhatsApp de remerciement avec la proposition d'une page et la date convenue.
- Mettre à jour la liste de suivi (`cibles.md`, section Suivi).
- Noter les objections nouvelles et les mots exacts du dirigeant, pour améliorer ce document.
