# Le Garde-Manger

PWA de liste de courses, en français. Usage quotidien, simple : on note ce qui manque, on coche en magasin,
« Courses terminées » envoie les articles cochés dans l'historique.
En ligne : https://gitchy-man.github.io/LeGardeManger/ (dépôt public `gitchy-man/LeGardeManger`).

## Commandes

- `npm run dev` : serveur de développement
- `npm test` : tests unitaires (Vitest, jsdom, fake-indexeddb)
- `npm run test:e2e` : tests Playwright (téléphone simulé Pixel 7) sur la version construite, service worker compris
- `npm run build` : vérification des types (`tsc`) puis construction
- `npm run icons` : régénère les icônes PNG depuis `public/logo.svg`

## Plan par versions

Plan détaillé (étapes, tests, état) : `docs/PLAN.md`, à tenir à jour en même temps que ce résumé.

Une étape = une version livrée (`npm version x.y.0 --no-git-tag-version`), chaque étape a un test concret
(unitaire + Playwright), puis un test manuel sur les téléphones de l'utilisateur (Android et iPhone).

- **A, seul, données sur l'appareil** : A0 squelette PWA ✅, A1 listes/articles/suggestions ✅,
  A2 mode courses ✅, A3 historique (à valider sur téléphone), **A4 hors ligne complet + export/import JSON** (prochaine étape).
  Ensuite : pause de quelques semaines d'usage réel avant la version B.
- **B, comptes et synchro (l'utilisateur seul, plusieurs appareils)** : choisir le serveur à ce moment-là
  (Firebase, Supabase ou auto-hébergé type PocketBase) ; migration des données locales via l'import.
- **C, partage** : listes partagées par lien d'invitation, temps réel, foyer (en dernier).
- **D, confort** : fusion/renommage de produits, scan de codes-barres (doit marcher sur iPhone, donc
  bibliothèque et non l'API BarcodeDetector seule).

## Décisions produit (ne pas remettre en cause sans demander)

- Pas de gestion de stock ni de quantités : une note libre facultative par article (« x2 », « bio »).
- Un article coché **reste à sa place, barré** (le déplacer faisait cocher le mauvais article sous le doigt).
- Pas de disparition à la coche : seul le bouton « Courses terminées » valide ; « Annuler » juste après.
- Version C : une coche appartient à la personne qui l'a mise ; « Courses terminées » ne valide que ses
  propres coches (deux personnes peuvent faire les courses en même temps dans deux magasins) ; seule la
  personne qui a coché peut décocher ; les autres voient « pris par X » et un bandeau « X fait les courses ».
  Pas d'indicateur « qui regarde la liste ».
- Droits sur une liste partagée : tout membre ajoute, coche, valide ; seul le propriétaire supprime ou gère le partage.

## Architecture

- Vanilla TypeScript + `lit-html` (rendu), `idb` (IndexedDB), `vite-plugin-pwa` (manifest, service worker).
- **Toute donnée passe par l'interface `Store`** (`src/data/types.ts`) ; `IdbStore` en est l'implémentation
  locale. La version B ajoutera une autre implémentation : ne pas appeler IndexedDB ailleurs.
- Un produit est identifié par `productKey(nom)` (`src/domain/normalize.ts` : casse, accents, ponctuation, œ/æ).
  Un produit n'apparaît qu'une fois par liste : id d'article = `listId|productKey`.
- Migrations IndexedDB : incrémenter la version dans `openIdbStore` et ajouter un bloc `if (oldVersion < N)`.
  Ne jamais modifier les blocs existants ; tester la mise à niveau depuis la version précédente
  (voir le test « mise à niveau des données existantes »). L'utilisateur a de vraies données sur ses téléphones.
- Logique pure dans `src/domain/` (testée unitairement), affichage dans `src/ui/`.
- Navigation par hash (`#/liste/<id>`, `#/historique`, `#/historique/produits`, `#/historique/produit/<clé>`),
  compatible GitHub Pages.

## Conventions

- Textes de l'interface, commentaires, noms de tests et messages de commit en français.
- Champs de saisie à 16px minimum (sinon l'iPhone zoome), zones tactiles d'au moins 2.75rem.
- Mise en ligne : un push sur `main` lance `.github/workflows/deploy.yml` (tests unitaires + Playwright,
  puis build avec `BASE_PATH=/LeGardeManger/` et déploiement Pages). Rien n'est publié si un test échoue.

## Pièges connus

- Git Bash convertit les chemins : construire avec `MSYS_NO_PATHCONV=1 BASE_PATH=/LeGardeManger/ npx vite build`
  pour vérifier localement les chemins de production.
- Python n'est pas installé sur la machine.
- Playwright : attendre que l'écran reflète un enregistrement (titre, statut) avant `page.goto`, sinon
  la navigation interrompt l'écriture IndexedDB.
- Les tests d'historique simulent l'horloge (`page.clock`) ; construire les dates en heure locale
  (`new Date(2026, 10, 23, …)`) pour ne pas dépendre du fuseau (la CI tourne en UTC).
