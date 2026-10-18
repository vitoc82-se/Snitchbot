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
- `pages/` – screens: `index.js` (home, renders `components/SnitchbotApp.jsx`), `lookup`, `guild`, `loot`, `reports/[code]`, `dashboard`, `characters`, `compare`, `settings`, `suggest`, `admin`, `readme` (in-app docs).
- `pages/api/` – server routes: `analyze`, `lookup/*`, `guild/*`, `loot/*`, `reports/*`, `settings/buffs`, `bot/channels`, `admin`, `debug_*`.
- `lib/` – `constants.js` (buff/spell ID lists), `scoring.js`, `wcl.js`, `wcl-consumables.js`, `raid-week.js`, `loot-raids.js`, `redis.js`, `db.js`.
- `components/` – table, player panel, rankings, loading UI.
- Tables seen in code: `users`, `reports`, `user_settings`, `user_characters`, `player_lookup_profiles`, `player_lookup_bosses`, `loot_sessions`, `loot_entries`, `suggestions`, `bot_guild_channels`, `guild_lookup_cache`.

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
