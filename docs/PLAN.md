# Le Garde-Manger : plan

PWA de gestion de courses. Données locales (version A), hébergée sur GitHub Pages.

## Principes
- Une étape à la fois, tests écrits avant le code, arrêt à la fin de chaque étape pour validation.
- Identifiants uniques (UUID), dates de création/modification et numéro de version
  du format de données sur tout ce qui est stocké (prépare la migration vers la version B).
- Dépôt public : aucun secret dans le code.

## Version A : seul, données sur le téléphone
| # | Étape | Test | État |
|---|---|---|---|
| A0 | Base du projet (Vite, TypeScript, Vitest, Playwright), mise en ligne GitHub Pages, page installable | Installation sur Android et iPhone ; npm test passe | fait |
| A1 | Listes et articles : plusieurs listes, suggestions, normalisation des noms, note facultative | Tests unitaires de normalisation ; "Lait" puis "lait " = un seul article ; rechargement | fait |
| A2 | Mode courses : cocher, décocher, "Courses terminées" | 4 articles, 3 cochés, 1 décoché, rechargement, validation : 2 partent dans l'historique, 2 restent | fait |
| A3 | Historique : par séance, par produit, toutes listes confondues | Tests unitaires sur dates fixes ; vérification visuelle | fait |
| A4 | Hors ligne complet, export et import JSON | Mode avion : ouvrir, cocher, valider ; aller-retour exporter, vider, importer | fait |

Pause : quelques semaines d'usage réel avant la version B.

## Version B : comptes et données en ligne, pour moi seul sur plusieurs appareils
- B1 : connexion et règles d'accès (choix du serveur d'abord).
- B2 : migration des données locales, puis synchronisation.

## Version C : partage avec d'autres personnes
- C1 : invitation par lien.
- C2 : coches par personne, "pris par...", validation séparée.
- C3 : foyer.

## Version D : confort
- D1 : fusion et renommage de produits.
- D2 : scan de codes-barres (Android et iPhone), à préciser.
