---
name: git-flow
description: Branch, commit and pull request practice for EasyAD. Knows the two remotes, the base branch, the documents that change with the code, the checks that must pass, and the files that must never be committed. Use when the user says "git flow", "start a branch", "commit this", "open a PR", "ship this", "handle the review", "resolve the conflict", or "clean up branches".
---

# Git flow for EasyAD

The shared file holds the practice. This file holds the facts of this
repository. Read both.

**Never push to `origin`. Never merge a pull request without the user's word.**

---

## The two remotes are the reverse of the usual pattern

```
origin  https://github.com/zxcs001/easyad-mvp     the team repository. The base.
fork    https://github.com/hunterAntal/easyad-mvp Hunter's fork. Push here.
```

`origin` is **not** where you push. Read the names before every push, because
the habit from other repositories is wrong here.

```bash
git push -u fork <branch>
gh pr create --repo zxcs001/easyad-mvp --base main --head hunterAntal:<branch> \
  --title "<type(scope): subject>" --body-file <file>
```

The base branch is `main` on `origin`. The team lands pull requests as merge
commits, so each commit you write stays in the history. Write them for a
reader.

## The team edits at the same time

Yuchen Tu (`zxcs001`) owns the team repository and works on the same files.
Pull request #4 collected conflicts in three files while two branches drifted
from `main`: `app/component/toronto-starter.tsx`, `app/i18n/fr-additional.ts`
and `app/page.tsx`. Those three, plus `app/component/dashboard-shell.tsx` and
`app/ooh-app.tsx`, are the hot files. Expect a conflict there.

- Pull `main` into the branch every day the branch stays open.
- Never branch from a branch that waits for review. #4 started from the #3
  branch, so #4 carried #3's commits and #3 had to merge first.
- A conflict in `fr-additional.ts` is almost always additive: both sides added
  keys to the same object. Keep **both** sets, then check for a duplicate key.

```bash
git fetch origin && git merge origin/main
```

## Documents change with the code

The repository has two documents that a change must keep current, in the same
commit as the change:

- `README.md` — setup, ports, commands, environment, anything a new person runs.
- `DESIGN.md` — the design system: a rule about layout, colour, state, wording
  or component behaviour belongs here. A layout fault fixed against an existing
  rule does not; say so in the commit instead.

Write both in Simplified Technical English, like the commit message.

## Never commit these

| Path | Why |
|---|---|
| `DEMO_ACCOUNTS.md` | Local demo credentials. Git ignores it. Never print it either. |
| `.env.local` | Local secrets. |
| `next-env.d.ts` | Next.js rewrites it on every start. |
| `package-lock.json` | Only when a dependency really changed. `npm install` alone touches it. |
| `.next/`, `playwright-report/`, `test-results/` | Build and test output. |

`ad-ca-mvp.pem` is already committed at the repository root from an earlier
change. Do not add more of them, and do not remove it without the user's word.

## Check before you ask for review

```bash
npx tsc --noEmit          # must be clean
npm test                  # baseline on 2026-09-17: 187 passed, 9 skipped
npm run build             # must compile
```

A change to a screen needs the app as well, not only the tests:

- The dev server is pinned to port **3001** in `package.json`. Port 3000
  belongs to a different project on this machine.
- Sign in with an account from `DEMO_ACCOUNTS.md`. Sign-in allows 10 attempts
  per account in 15 minutes, and a block reads exactly like a wrong password.
  A script must use a different account from the person testing by hand.
- The eight demo screens ship with `advertising_opt_in = false`, so Find
  screens is empty until they are opted in. An empty screen is data, not a
  fault.

Name the result in the commit and in the pull request. "npm test passes 178
with 9 skipped" is a fact. "Tested" is not.

## The pull request

Follow the description shape in the shared file. Two sections matter here:

- **Limits.** The demo accounts have no listed screens, bookings, invoices,
  approvals or media. Say which states you could not render, and how you
  checked them instead.
- **Out of scope.** The audits found faults that need a product decision. List
  the ones you left, so nobody thinks they were missed.

## After the merge

```bash
git switch main && git pull --ff-only
git branch --merged main | grep -v '^\*\|main'
git branch -d <branch>
```

Yuchen merges most pull requests. Do not merge one yourself unless the user
says so.
