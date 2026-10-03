---
name: lights-off
description: End-of-session shutdown for EasyAD. Verifies the work, updates README.md and DESIGN.md, commits to the feature branch, stops servers this session started, cleans up, and reports what is left. Use when the user says "lights off", "shut down", "wrap up", "end the session", or "pack up".
---

# Lights off

Close the session safely. Leave the repository committed, the documents current,
the machine quiet, and the user told what remains.

Work through the six steps in order. Do not skip step 1. Do not commit if
step 2 fails.

**Never push. Never open a pull request. Never merge.** Those reach other people
and are the user's decision. Report them as remaining work instead.

---

## 1. Survey before you touch anything

Collect the facts first. Report them before you change state.

```bash
git branch --show-current
git status --short
git log --oneline @{u}..HEAD 2>/dev/null | wc -l   # unpushed commits
lsof -nP -iTCP -sTCP:LISTEN | grep -i node          # what is listening
```

Also list background tasks you started this session.

Stop and ask the user if any of these are true:

- The branch is `main`. Never commit there. Ask which branch to use.
- A merge or rebase is in progress.
- A file you did not change is modified and you cannot explain it.

## 2. Verify before committing

Broken work must not be committed silently.

```bash
npx tsc --noEmit
npm test
npm run build
```

If any command fails: **do not commit**. Report the failure with its output, and
ask whether to fix it or to leave the work uncommitted.

Say plainly how many tests passed, skipped, and failed. Never round a failure
into success.

## 3. Update the documents

This project requires it. A change that alters behaviour, setup, or
architecture is recorded in the same commit as the change.

- `README.md` — setup, how to run, traps a future reader will hit
- `DESIGN.md` — design rules, layout rules, vocabulary, accessibility rules
- `docs/adr/` — add an ADR only for a decision with a lasting consequence

Write in ASD-STE100 Simplified Technical English: short active sentences, one
idea per sentence, one word for one meaning.

Record the **rule**, not the diff. "A scanning list carries only what a person
scans by" is useful. "Changed discover-view.css" is not.

If nothing behavioural changed, say so rather than padding a file.

## 4. Commit

One commit per coherent change. Never one commit for the whole session if the
session did several unrelated things.

The message gives the reason, not only the summary. Include:

- What was wrong, in plain terms
- Why it was wrong
- The measurement before and after, where one exists
- Any fault the work exposed, including faults you caused yourself
- What you did **not** fix, named honestly
- The verification: tests passed, skipped, and failed; tsc; build

End the message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### Never commit these

Check before every `git add`:

- `DEMO_ACCOUNTS.md` — local credentials, gitignored on purpose
- `.env.local`
- `.claude/scheduled_tasks.lock`
- `package-lock.json` when only its `dev` markers churned
- `next-env.d.ts` when only `next dev` rewrote its import path

Prefer `git add <path> ...` over `git add -A`. If you use `-A`, exclude the
files above and read `git status` afterwards to confirm what is staged.

## 5. Quiet the machine

Stop only what this session started.

**Stop** a dev server that you started for testing, a Monitor, and any polling
loop.

**Leave running, and say so:** a server the user is actively using, a server on
a port belonging to a different project, and any long-lived process the user
set up.

This machine has run two servers at once. Port 3000 belongs to
`/Users/hunts/Austins Thing/easyad-prototype`, a separate codebase. This
repository is pinned to **3001** in `package.json`. Never stop 3000 unless the
user asks.

Ask before stopping anything you did not start.

Finally, clear scratch files you created outside the repository. Leave the
user's files alone.

## 6. Report

Short, in Simplified Technical English. Give the user:

| Item | Say |
|---|---|
| Commits | The count and one line for each |
| Documents | Which files changed and the rule recorded |
| Tests | Passed, skipped, failed |
| Servers | What stopped, what still runs and why |
| Not pushed | The count, and that a push needs their word |
| Left open | Every known fault you did not fix |

End with the one thing you would do next.

---

## The rules that outrank convenience

1. **Never push to `main`.** Permanent. No end date.
2. **Never push or open a pull request during lights off.** Ask instead.
3. **Never commit a credential.**
4. **Never report a failure as a success.** If tests fail, say so with the
   output. If you skipped a step, say which.
5. **Never stop a server you did not start** without asking.
