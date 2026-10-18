# Snitchbot: project knowledge

<!-- Written by Idea HQ. Edit it in Idea HQ or here; keep the section headings so it can be read back. -->

## What it is and who it is for

Snitchbot (package name `snitchbot`, public site snitchbot.app) reads Warcraft Logs raid reports for World of Warcraft TBC Classic ("TBC Anniversary / Fresh") and checks who came prepared: flasks, elixirs, food, potions and weapon enchants. Raid leaders and guild officers paste a log link to get a per-player table and score. Players can also look up a character or a whole guild, and a Discord bot uses the lookup API.

## Technology

- JavaScript only (no TypeScript). Next.js 14 (pages router), React 18.
- Login: `next-auth` with Discord (JWT sessions).
- Database: Neon Postgres via `@neondatabase/serverless` (`lib/db.js`).
- Cache and usage stats: Upstash Redis over its REST API (`lib/redis.js`); it silently does nothing if the keys are missing.
- Data source: Warcraft Logs GraphQL API v2, both www and `fresh.` hosts (`lib/wcl.js`).
- Other libraries: `formidable` (uploads), `jszip`.
- Hosting: Vercel serverless. The in-app readme page says it auto-builds from GitHub `main`.

## How it is organised

- `pages/` – screens: `index.js` (home, renders `components/SnitchbotApp.jsx`), `lookup`, `guild`, `loot`, `reports/[code]`, `dashboard`, `characters`, `compare`, `settings`, `suggest`, `admin`, `live` (active-time % per boss kill), `readme` (in-app docs).
- `pages/api/` – server routes: `analyze`, `activity`, `players/*`, `lookup/*`, `guild/*`, `loot/*`, `reports/*`, `settings/buffs`, `bot/channels`, `admin`, `debug_*`.
- `lib/` – `constants.js` (buff/spell ID lists), `scoring.js`, `wcl.js`, `wcl-consumables.js`, `raid-week.js`, `loot-raids.js`, `redis.js`, `db.js`.
- `components/` – table, player panel, rankings, loading UI.
- Tables seen in code: `users`, `reports`, `user_settings`, `user_characters`, `player_lookup_profiles`, `player_lookup_bosses`, `player_lookup_weeks`, `loot_sessions`, `loot_entries`, `suggestions`, `bot_guild_channels`, `guild_lookup_cache`.

## How to run, test and ship

- `npm install`, then `npm run dev` (run locally), `npm run build`, `npm start`. These are the only scripts in `package.json`.
- There are no tests and no linter configured.
- Environment variables used (names only): `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`, `WCL_FRESH_CLIENT_ID`, `WCL_FRESH_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ADMIN_PASSWORD`. Get them from the owner; never commit them.
- Shipping: `pages/readme.js` describes a Python `push_all.py` upload to `vitoc82-se/Snitchbot`, then a Vercel auto-deploy. That script is not in this repo. Most git history is commits titled "Deploy".

## Rules and things not to touch

- Do not edit anything under `.github/workflows` (the Idea HQ workflow).
- Never write secrets or `.env` files (they are git-ignored).
- Keep the ID lists in `lib/constants.js` and the matching tables in `pages/readme.js` in step.
- `pages/api/lookup/bot.js` says its rating formula is copied by hand from `pages/lookup/index.js`; change both together.
- Admin routes (`api/admin`, `api/suggestions`) check `?password=` against `ADMIN_PASSWORD`. Keep that check.
- Follow the existing style: plain JS, comments that explain why, inline styles plus `styles/globals.css`.

## Known quirks and lessons

- Reports come from the Fresh WCL host. The www host omits buff events, which used to drop consumables drunk at the pull (comment in `pages/api/analyze.js`).
- Some flasks have two same-named spells: a "Dummy" item wrapper and the real aura. Only the aura shows in logs (`lib/constants.js`).
- Raid weeks reset on Wednesday for EU and Tuesday for US (`lib/raid-week.js`).
- Several tables are created on the fly with `CREATE TABLE IF NOT EXISTS` inside API routes. The readme page says there is no migration tool or staging database, so schema changes hit live data.
- `pages/api/debug_*` routes have no auth and are temporary dev tools.
- I could not verify the deployment process, because `push_all.py` is absent here.

## Other notes

# Snitchbot — Development Documentation

Complete technical reference for continuing development. Written so a new developer (or AI) can understand the entire system cold.

---

## What Is This?

**Snitchbot** is a web app for World of Warcraft TBC Classic (Anniversary/Fresh) raid leaders. It reads a [Warcraft Logs](https://www.warcraftlogs.com) report and shows which players skipped their consumables — flask, food, elixirs, potions, weapon buffs.

**Live site:** https://snitchbot.app  
**Preview/staging site:** https://new.snitchbot.app  
**Live GitHub repo:** `vitoc82-se/USETHEPOTS` (private)  
**Preview GitHub repo:** `vitoc82-se/Snitchbot` (private)

The app has two modes:
- **Anonymous** — paste a WCL URL and check it. No login required.
- **Logged in (Discord OAuth)** — save reports, view player history over time, configure which buffs are mandatory for scoring.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14, Pages Router |
| Hosting | Vercel (two separate projects) |
| Auth | NextAuth.js v4, Discord OAuth provider |
| Database | Neon (serverless Postgres) via `@neondatabase/serverless` |
| Cache / Admin stats | Upstash Redis (HTTP pipeline API) |
| WCL data | Warcraft Logs GraphQL API v2 |
| Styling | Single global CSS file (`styles/globals.css`), dark WoW theme |
| Deployment | Python scripts using the GitHub Git Tree API (atomic commits, no local git) |

**Important:** There is no local git repository. All deploys happen by pushing file blobs directly to GitHub via the REST API using `push_all.py` (live) or `push_preview.py` (preview).

---

## Repository Structure

```
C:\Users\freem\Guidevision.eu\
├── src/
│   ├── lib/
│   │   ├── constants.js      ← All magic IDs and UI constants
│   │   ├── scoring.js        ← Scoring functions (score, maxScore, isPrepared, etc.)
│   │   ├── db.js             ← Neon Postgres client
│   │   └── redis.js          ← Upstash Redis client (admin stats only)
│   ├── components/
│   │   ├── SnitchbotApp.jsx  ← Main app component (state, layout, orchestration)
│   │   ├── PlayerTable.jsx   ← Class-grouped consumable table with score badges
│   │   ├── PlayerModal.jsx   ← Slide-in player detail panel (named PlayerPanel inside)
│   │   ├── RankingsView.jsx  ← Raid-wide rankings tab
│   │   ├── LoadingStatus.jsx ← Animated loading steps indicator
│   │   └── Cell.jsx          ← Reusable table cell (✓ / ✗ / — / count)
│   ├── pages/
│   │   ├── index.js          ← Entry point, renders <SnitchbotApp />
│   │   ├── readme.js         ← Documentation page (/readme)
│   │   ├── admin.js          ← Admin panel (/admin), password-protected
│   │   ├── settings.js       ← Mandatory buff settings (/settings), login required
│   │   ├── dashboard/
│   │   │   ├── index.js      ← Saved reports + player roster (/dashboard)
│   │   │   └── players/
│   │   │       └── [name].js ← Per-player history (/dashboard/players/Vitok)
│   │   ├── reports/
│   │   │   └── [code].js     ← Shareable report URL (/reports/ABC123)
│   │   └── api/
│   │       ├── analyze.js        ← Main WCL fetch + analysis endpoint
│   │       ├── admin.js          ← Admin stats endpoint
│   │       ├── auth/
│   │       │   └── [...nextauth].js  ← NextAuth handler + authOptions export
│   │       ├── reports/
│   │       │   ├── save.js       ← POST save a report
│   │       │   ├── index.js      ← GET list user's reports
│   │       │   └── [id].js       ← GET single report, DELETE report
│   │       ├── players/
│   │       │   ├── index.js      ← GET player roster (aggregated from reports)
│   │       │   └── [name].js     ← GET per-player history across reports
│   │       ├── settings/
│   │       │   └── buffs.js      ← GET/POST mandatory buff settings
│   │       ├── debug_timestamps.js  ← Debug: fight timestamps from a log
│   │       ├── debug_potions.js     ← Debug: potion casts from a log
│   │       └── debug_gear.js        ← Debug: weapon enchant IDs from a log
│   └── styles/
│       └── globals.css       ← All CSS (managed remotely, see Deployment)
├── push_all.py       ← Deploy to LIVE site (vitoc82-se/USETHEPOTS)
├── push_preview.py   ← Deploy to PREVIEW site (vitoc82-se/Snitchbot)
└── DEVELOPMENT.md    ← This file
```

---

## Environment Variables

Both Vercel projects need these. Set them in Vercel → Project → Settings → Environment Variables.

| Variable | Description |
|---|---|
| `WCL_CLIENT_ID` | Warcraft Logs API client ID (from warcraftlogs.com/api/clients) |
| `WCL_CLIENT_SECRET` | Warcraft Logs API client secret |
| `DISCORD_CLIENT_ID` | Discord OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth app client secret |
| `NEXTAUTH_URL` | Full URL of the site (e.g. `https://new.snitchbot.app`) |
| `NEXTAUTH_SECRET` | Any long random string — used to sign JWTs |
| `DATABASE_URL` | Neon Postgres connection string (full URL with SSL params) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `ADMIN_PASSWORD` | Password for the /admin page (currently `Niklas26!`) |

The preview site uses **the same Neon database** as the live site. This is intentional — player data and saved reports are shared. If you want true isolation, create a separate Neon project for preview.

**Discord OAuth redirect URIs** must include the callback URL for each site:
- `https://snitchbot.app/api/auth/callback/discord`
- `https://new.snitchbot.app/api/auth/callback/discord`
Add both in the Discord Developer Portal → your app → OAuth2 → Redirects.

---

## Database Schema

Three tables in Neon Postgres. All IDs are UUID generated by Postgres.

```sql
-- Created by NextAuth signIn callback
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id     TEXT UNIQUE NOT NULL,
  discord_name   TEXT,
  discord_avatar TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Saved reports (full analyzed JSON stored in data column)
CREATE TABLE reports (
  id
