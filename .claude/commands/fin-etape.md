---
description: Clôture une étape du plan : tests, build, état dans docs/PLAN.md, bilan et message de commit proposé (sans commit)
argument-hint: <étape, ex. A5>
disable-model-invocation: true
allowed-tools: Bash(npm test), Bash(npm run build), Bash(git status *), Bash(git diff *), Bash(git log *), Read, Edit(docs/PLAN.md)
---

Clôture de l'étape **$ARGUMENTS**.

Règle absolue : ne jamais lancer `git add`, `git commit` ni `git push`, même si tout passe.
Le commit reste une décision de l'utilisateur.

1. **Étape visée** : si `$ARGUMENTS` est vide, ou ne correspond à aucune ligne du tableau
   de `docs/PLAN.md`, s'arrêter et demander quelle étape clôturer.

2. **Tests** : lancer `npm test`. En cas d'échec, s'arrêter là : lister les tests en échec,
   ne rien modifier dans `docs/PLAN.md`.

3. **Build** : lancer `npm run build` (vérification des types + construction). Même règle en cas d'échec.

4. **État git** : `git status --short` et `git diff --stat`. Signaler tout fichier qui ne
   devrait pas partir dans le commit (fichiers `.idea/`, `dist/`, `.claude/settings.local.json`,
   fichiers temporaires).

5. **Plan** : dans `docs/PLAN.md`, passer la colonne « État » de la ligne $ARGUMENTS à
   « à tester sur téléphone ». Ne pas mettre « fait » : ça n'arrive qu'après le test manuel
   sur Android et iPhone. Ne pas toucher au ✅ de `CLAUDE.md` pour la même raison.

6. **Bilan**, en français :
   - résultat des tests (nombre passés) et du build ;
   - fichiers créés / modifiés / supprimés, avec une ligne sur le rôle de chacun ;
   - version dans `package.json` : signaler si elle n'a pas été incrémentée pour cette étape ;
   - ce qu'il reste à tester à la main sur les téléphones (d'après la colonne « Test » du plan).

7. **Message de commit proposé**, dans le style de l'historique (`git log --oneline -10`),
   par exemple « Étape A5 : … », avec un corps de 2-3 lignes. L'afficher dans un bloc de code,
   puis demander si l'utilisateur veut que je le fasse.
