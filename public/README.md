# `public/` — Static HTML & Asset Uploads

Anything in this folder is served at the site root by Next.js. A file at `public/11a.html` is reachable at `https://<domain>/11a.html` — no build step, no routing, no auth. Treat every upload here as **publicly accessible the moment it merges to `main`**.

This guide covers the matchup HTML graphics (`11a.html`, `11b.html`, …) and any other static HTML you drop in here.

---

## File naming convention

| Type | Pattern | Example |
| ---- | ------- | ------- |
| Season matchups | `<season><slot>.html` | `11a.html`, `11b.html`, `11c.html`, `11d.html` |
| One-off graphic | `<event-slug>.html` | `finals-2026.html` |
| Images | lowercase, hyphenated | `default-avatar.webp` |

Rules:
- **Lowercase only.** URLs are case-sensitive on Vercel/Linux; mixed case will 404 for some users.
- **No spaces, no underscores.** Use hyphens.
- **No PII in filenames** — they're guessable. Don't put player emails or phone numbers in the path.

---

## Upload workflow

### Option A — GitHub web UI (quickest, single file)

1. Navigate to `public/` on `main`.
2. **Add file → Upload files** (or **Create new file** to paste content).
3. Drop the `.html` file in.
4. Commit message: `matchups season <N>` or similar — match the existing style (see `git log public/`).
5. **Commit directly to `main`** only if you've reviewed locally first (see checklist below). Otherwise: **Create a new branch** and open a PR.

### Option B — Local clone + PR (recommended for >1 file or any edit)

```bash
git clone https://github.com/nfrimando/padelleague.git
cd padelleague
git checkout -b matchups-season-12
cp ~/Downloads/12a.html public/
cp ~/Downloads/12b.html public/
git add public/12a.html public/12b.html
git commit -m "matchups season 12"
git push -u origin matchups-season-12
gh pr create --fill
```

Vercel will auto-deploy a preview URL on the PR. Open it, click through every new file, and confirm the rendered output before merging.

---

## Pre-upload review checklist (do this **before** committing)

Run through this for every HTML file. It takes 2 minutes and prevents the most common production embarrassments.

### 1. Open the file in a browser locally
Double-click the `.html` from your file manager, or `npm run dev` and visit `http://localhost:3000/<file>.html`. **Never upload a file you haven't rendered.**

### 2. Validate the markup
- File starts with `<!DOCTYPE html>` and has `<html>`, `<head>`, `<body>`.
- `<meta charset="UTF-8">` present (matchup files use special characters and emoji).
- All tags closed. Paste into <https://validator.w3.org/#validate_by_input> for a quick lint if anything looks off.

### 3. Check the content
- **Spelling** of every player name. Cross-reference the players table in Supabase if unsure.
- **Scores and dates** match the source of truth (admin panel / spreadsheet).
- **No placeholder text** left in (`Lorem ipsum`, `TODO`, `Player A`, `XX-XX`).
- **No internal-only notes** in HTML comments — `<!-- ... -->` is visible to anyone who views source.

### 4. Check what's loaded externally
Open DevTools → Network tab and reload. Every external request should be:
- A pinned version (`@fontsource/inter@5/...`) — not `@latest`. Pinned versions can't change underneath you.
- HTTPS only.
- A trusted CDN (jsdelivr, unpkg, fonts.googleapis.com, our own domain).

**Reject anything that loads tracking pixels, analytics scripts, or third-party JS you didn't put there.** Static matchup graphics should not need JavaScript at all.

### 5. Check for leaked secrets
Before committing, search the file for anything that shouldn't be public:

```bash
grep -iE 'api[_-]?key|secret|token|password|sk_|whsk_|service_role' public/*.html
```

Should return nothing. Also scan for:
- Supabase project URLs you don't want exposed (the anon URL is fine; service role anything is not).
- PayMongo keys (`sk_*`, `whsk_*`) — never.
- Personal email addresses or phone numbers.

### 6. Check file size
Matchup HTML files are typically 8–15 KB. If yours is >100 KB, you've probably embedded a base64 image — extract it to a separate `.webp`/`.png` and reference it by URL instead.

```bash
ls -lh public/*.html
```

### 7. Visual review on the deployed preview
After pushing, open the Vercel preview URL (posted as a PR comment). Check:
- Renders identically to local.
- Mobile viewport (DevTools device toolbar, 375px wide) — matchup files are fixed-width 480px; confirm that's intentional.
- No console errors (DevTools → Console).
- No 404s in the Network tab.

### 8. Don't break existing files
- **Never overwrite** an existing matchup file unless you intend to. Once `11a.html` is shared on social, the URL is permanent — replacing the content silently changes what people see when they revisit.
- If you need to fix a published file, commit the fix as a new commit (not a force-push), with a message like `fix typo in 11a.html`.

---

## What does **not** belong in `public/`

- Anything requiring auth or per-user data — use a Next.js route under `src/app/`.
- `.env`, `.env.local`, `*.key`, `*.pem`, `service-account*.json` — these are gitignored for a reason. If you find one here, **stop and rotate the credential**.
- Source files (`.tsx`, `.ts`, `.scss`) — those go under `src/`.
- Large media (>2 MB). Use a CDN or Supabase Storage.
- Internal documents (player lists, financials, draft announcements).

---

## If you uploaded something by mistake

1. **Don't just delete and commit** — Git history still has it, and Google may have already indexed the URL.
2. If it contains a secret: **rotate the secret immediately** (Supabase / PayMongo dashboard), then remove the file.
3. Open an issue or message Nico so the team is aware.
4. For full history removal, `git filter-repo` is required — coordinate before doing this; it rewrites history for everyone.

---

## Quick reference

```bash
# List what's currently public
ls public/

# Diff a new matchup file against the previous season's format
diff public/10a.html public/11a.html | head -50

# Check all HTML files for secrets before committing
grep -iE 'api[_-]?key|secret|token|sk_|whsk_' public/*.html

# Render locally
npm run dev   # then visit http://localhost:3000/11a.html
```
