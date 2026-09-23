# DigitalEase

A friendly, high-contrast web app that helps people with low digital literacy — especially those on older devices — stay safe online. Built as a static, dependency-free front-end prototype.

## Features

- **Scam & Suspicious Link Checker** — paste a URL or message and get a plain-language risk check, labelled as a database match, a heuristic warning, or unverified. Never claims a link is definitely safe.
- **Employment Terms Glossary** — 50+ searchable job/salary/workplace terms (including Singapore-specific terms like CPF, Employment Pass, SkillsFuture) with plain explanations, examples, and synonym-aware search.
- **Mobile Data Tracker** — manual entry of your allowance, usage, and reset date, with a usage percentage, remaining data, a daily-average estimate, saving tips, and instructions for checking real usage on Android/iPhone.
- **Habits & Streaks** — a daily checklist of five digital-safety habits, with streaks, points, and badges. Each habit can only be rewarded once per day.
- **Accounts** — client-side registration/login with username format validation, duplicate checks, SHA-256 password hashing, generic login errors, and a simple attempt-based lockout.
- **Help Assistant** — a floating chat widget powered by a free [OpenRouter](https://openrouter.ai) model, for plain-language questions about using the app or staying safe online.

## Help Assistant & API keys — read this before deploying

This is a static site (GitHub Pages has no server), so **nothing shipped to the browser can be kept secret from visitors** — "encrypting" a key in client-side JavaScript doesn't help, because the decryption code has to ship in the same bundle a visitor can already read. There are three options, in order of how well they actually hide the key:

**Option A — Cloudflare Worker proxy (fully hides the key from visitors — best for a public repo)**
Deploy the included worker so your key never reaches the repo or the browser:

```bash
cd worker
npm install -g wrangler   # once
wrangler login             # once
wrangler secret put OPENROUTER_API_KEY   # paste your real key when prompted
wrangler deploy
```

Copy the printed `https://*.workers.dev` URL into `ASSISTANT_PROXY_URL` near the top of `js/chatbot.js`, commit that one-line change, and push. Every visitor then gets a working assistant automatically — no key prompt, and no key anywhere a browser can see it. The worker only forwards to an allow-listed set of free models and caps conversation length, so it can't be abused to run up a bill even if someone finds the worker URL. Tighten `ALLOWED_ORIGIN` in the worker to your GitHub Pages domain before relying on it publicly.

**Option B — GitHub Actions + repository secret (keeps the key out of your repo/git history, but NOT out of the deployed page)**
1. Repo → **Settings → Secrets and variables → Actions → New repository secret**, name it `OPENROUTER_API_KEY`, paste your key.
2. Repo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
3. Push to `main`. `.github/workflows/deploy.yml` runs automatically, writes your secret into `js/config.js` at build time, and deploys.

This means the key never sits in a commit, and you can rotate or revoke it from Settings without touching code. **However**, the `js/config.js` file that gets deployed is a normal public file — anyone can still find the key with "View Source" on the live site. This is a real improvement over hardcoding (nothing in git history, easy rotation) but it is not secrecy from visitors. Use Option A for that.

**Option C — Bring your own key (zero setup, used automatically if neither A nor B is configured)**
Each visitor opens the Help Assistant, pastes their own free key from [openrouter.ai/keys](https://openrouter.ai/keys), and it's saved only in their own browser's `localStorage`. Fine for personal use or a demo; every visitor needs their own key.

**Temporary option — hardcode it locally while testing**
`TEMP_HARDCODED_KEY` near the top of `js/chatbot.js` is a placeholder for quick local testing. Fill it in on your machine, test, then **blank it out again before you `git push` to a public repo** — it's marked with a `⚠️` comment as a reminder.

Whichever option you use, note that OpenRouter's free models are rate-limited (roughly 20 requests/minute, 50/day per key as of writing) and the specific free model IDs rotate — check [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0) if the assistant stops responding, and update `DEFAULT_MODEL` in `js/chatbot.js` (and `ALLOWED_MODELS` in the worker, if used).


## Running it locally

No build step or dependencies are required.

```bash
git clone https://github.com/<your-username>/digitalease.git
cd digitalease
# any static server works, e.g.:
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser. Opening `index.html` directly by double-clicking also works in most browsers.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.

## Project structure

```
digitalease/
├── index.html          # App shell (header, nav, main content mount point)
├── .github/
│   └── workflows/
│       └── deploy.yml    # Builds + deploys to GitHub Pages, injects the secret (Option B)
├── css/
│   └── style.css        # All styling, including the purple/black theme
├── js/
│   ├── app.js             # App logic: routing, auth, all four core features
│   ├── chatbot.js         # Help Assistant chat widget (OpenRouter client)
│   └── config.example.js  # Template showing the shape of the auto-generated config.js
├── worker/
│   ├── openrouter-worker.js  # Optional Cloudflare Worker proxy (Option A above)
│   └── wrangler.toml          # Worker config for `wrangler deploy`
└── README.md
```

**Important — upload this as a folder structure, not flat files.** If you use GitHub's web "Add file → Upload files" button, drag the whole unzipped `digitalease` folder in (most browsers preserve subfolders when you drag a folder). If you instead select individual files, GitHub will flatten them into the repo root and `index.html`'s `css/...` and `js/...` paths will break — you'll see unstyled text and non-working buttons. The safest approach is to use git directly:

```bash
cd digitalease
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```


## Important limitations

This is a **front-end-only prototype** meant for learning and demonstration, not a production system:

- There is no real backend or shared database. "Accounts" and progress are stored only in `localStorage`, in one browser, on one device.
- Passwords are hashed client-side with SHA-256 as a demonstration of "never store plaintext" — this is **not** equivalent to a production system using salted Argon2id/bcrypt on a real server, HttpOnly/Secure session cookies, or server-side rate limiting.
- The Scam Checker uses a small bundled sample list plus simple heuristics to stand in for live threat-intelligence feeds such as URLhaus or ThreatFox, since a static site cannot securely hold an API key. See `SCAM_CHECKER_DATA` and `analyzeInput()` in `js/app.js`.
- There is no CSRF protection, server-side input validation, or audit logging, because there is no server.

## What would be needed for production

- A real backend (e.g. Node/Express) with a proper database (PostgreSQL/SQLite).
- Argon2id or bcrypt password hashing with per-user salts, done server-side.
- Session-based auth with HttpOnly, Secure, SameSite cookies, CSRF protection, and server-side rate limiting.
- Live, server-side integration with a threat-intelligence API (e.g. URLhaus, ThreatFox) using a securely stored API key.
- A security review before handling real user accounts or data.

## License

MIT — see [LICENSE](LICENSE).
