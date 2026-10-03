---
name: lights-on
description: Start-of-session startup for EasyAD. Fetches what teammates pushed, brings up PostgreSQL and the dev server on port 3001, checks the app answers, and summarizes the last session in Simplified Technical English. Use when the user says "lights on", "start up", "boot up", "good morning", or "pick up where we left off".
---

# Lights on

Open the session. Bring the work up to date, bring the machine up, and tell the
user where things stand before they ask.

Work through the five steps in order. Step 1 protects their work. Do not skip
it.

**Never push. Never merge into `main`. Never discard local work.** Fetch and
report. Ask before anything that rewrites history.

---

## 1. Protect local work, then fetch

Look before pulling. Uncommitted work must survive.

```bash
git branch --show-current
git status --short
git fetch origin --prune
git fetch fork --prune 2>/dev/null
```

Then report three counts:

```bash
git log --oneline HEAD..origin/main | wc -l    # what teammates added
git log --oneline origin/main..HEAD | wc -l    # what we have not proposed
git log --oneline @{u}..HEAD 2>/dev/null | wc -l  # what we have not pushed
```

- **Working tree dirty?** Say so and leave it alone. Do not stash without
  asking. Do not merge on top of it.
- **New commits on `origin/main`?** Report what they are and who wrote them,
  then ask before merging. A merge changes their branch.
- **Clean tree and the user said to pull?** Merge `origin/main` into the
  feature branch. Never the other way round.

A merge conflict in `app/i18n/fr-additional.ts` is normal and almost always
additive: both sides add keys at the top of the same object. Keep **both**
sets, then check for duplicate keys.

## 2. Bring up PostgreSQL first

The app will start without a database and then fail on every page. Start the
database first.

```bash
docker info >/dev/null 2>&1 || open -a Docker      # then wait for the daemon
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d postgres
```

Two traps on this machine, both real:

- **The credential helper.** `docker` comes from Homebrew, but
  `docker-credential-desktop` lives only inside Docker Desktop. Without that
  `PATH` line the image pull fails with a credentials error.
- **Docker Desktop can block on a Rosetta prompt.** If the daemon never comes
  up, read
  `~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log`.
  `UseVirtualizationFrameworkRosetta: false` in
  `~/Library/Group Containers/group.com.docker/settings-store.json` clears it.
  The PostgreSQL image is native arm64, so nothing is lost.

Confirm the database answers, and apply the schema if the app has never run
here:

```bash
npm run db:migrate      # idempotent, safe to repeat
```

## 3. Start the dev server

Only this project's server. It is pinned to **3001** in `package.json`.

```bash
npm run dev             # already means: next dev -p 3001
```

Wait for `Ready in`, then prove it answers:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
```

**Port 3000 is not ours.** It belongs to
`/Users/hunts/Austins Thing/easyad-prototype`, a separate codebase. Never start
it, never stop it, and never send the user there. Confusing the two has already
cost an hour.

If 3001 is taken, find out by whom before killing anything.

## 4. Check the state of the data

An empty marketplace looks broken. Confirm before the user finds out.

```bash
npm run seed:demo-data   # idempotent; needs local DEMO_ACCOUNTS.md
```

If the seeder stops because `DEMO_ACCOUNTS.md` is missing, that file is
gitignored on purpose and holds local credentials. Tell the user. Never commit
it and never paste its contents into a message.

The eight demo screens ship with `advertising_opt_in = false`, because they are
civic screens. Discover is empty until they are opted in. Say so rather than
letting the user think the page is broken.

## 5. Summarize the last session

Write in ASD-STE100 Simplified Technical English. Short active sentences. One
idea per sentence. One word for one meaning.

Build the summary from facts, not memory:

```bash
git log --oneline -15
git log --since="36 hours ago" --pretty=format:"%h %s"
```

Give the user this, and nothing padded:

| Item | Say |
|---|---|
| Last session | What changed, one line per commit, in plain words |
| Uncommitted | Any file left modified, and why if you know |
| Not pushed | The count. A push needs their word. |
| Teammates | What arrived on `origin/main`, and from whom |
| Running | The database and the server, with the address |
| Left open | Every known fault nobody has fixed |

End with the one thing you would do first, and wait.

### Two facts worth repeating each morning

- **Sign in** at `http://localhost:3001/login`. Credentials are in
  `DEMO_ACCOUNTS.md`.
- **Sign-in is rate limited**: 10 attempts per account per 15 minutes, and a
  block returns the same message as a wrong password. Browser test scripts
  must use a different account from the person testing by hand.

---

## The rules that outrank convenience

1. **Never discard or stash local work** without asking.
2. **Never push, and never merge into `main`.** Fetch and report.
3. **Never start or stop port 3000.** It belongs to another project.
4. **Never commit or print `DEMO_ACCOUNTS.md` or `.env.local`.**
5. **Never report a service as up without checking it.** Curl it, then say so.
