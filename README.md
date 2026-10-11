# Guardian

A Destiny 2 profile page for any Guardian: raid, dungeon and exotic-mission clears, flawless and lowman plaques, equipped gear, recent activity, and a holographic share card with a rarity tier.

**Live:** https://ludgar.github.io/guardian/

## Pages

| File | What it does |
| --- | --- |
| `index.html` | Redirects to the search page (also the Bungie sign-in return URL) |
| `Guardian Search.dc.html` | Find a Guardian by Bungie Name, or sign in and open your own profile |
| `Guardian Landing.dc.html` | Profile: characters and gear, plaques, latest activity, clears with run timelines |
| `Guardian Share Card.dc.html` | 3D holographic card with tier, stats, pips and a QR code; owners can pick the card emblem |
| `Profile Data Editor.dc.html` | Owner-only editor for sherpas, full raid clears and extra tags |

Profiles are addressed by `?p=<membershipType>-<membershipId>` or `?player=Name%231234`.

## Data sources

- **Bungie API (live):** characters, gear, emblems, light level, Guardian rank, Triumph score, commendations, clear counts, run timelines, Trio/Solo/Flawless detection
- **Entered by the owner:** sherpas, full raid clears and tags the live check missed. The live check only adds tags; it never removes them.
- **Supabase:** card numbers (order of first lookup) and the owner's shared edits

Bungie doesn't reliably mark full vs. checkpoint runs or first-time clears, so full clears and sherpas can't be computed live.

## Tier score

Only live stats count, so every Guardian is scored the same way:

| Stat | Points |
| --- | --- |
| Raid clears | 0.6 each |
| Dungeon clears | 0.4 each |
| Flawless activity | 40 |
| Lowman activity | 30 |
| Flawless lowman activity | 60 |
| Triumph score | 1 per 1,000 |
| Guardian rank | 50 per rank |
| Commendations | 0.1 each |

**C** < 800 · **R** 800 · **SR** 1,600 · **UR** 2,600 · **SPR** 3,600+

## Setup

### 1. Bungie application

At [bungie.net/en/Application](https://www.bungie.net/en/Application):

- **Origin Header:** `https://ludgar.github.io`
- **OAuth Client Type:** Public
- **Redirect URL:** `https://ludgar.github.io/guardian/`

Put the API key and OAuth Client ID in `guardian.js` (`KEY`, `BUNGIE_CLIENT_ID`).

### 2. Supabase

1. Run `supabase-setup.sql` in the SQL Editor. It creates `guardians` and `guardian_edits`.
2. Deploy the Edge Function `supabase/functions/save-guardian` with JWT verification **off** (set in `supabase/config.toml`):
   ```
   supabase functions deploy save-guardian --no-verify-jwt
   ```
3. Add the function secrets:
   ```
   supabase secrets set BUNGIE_API_KEY=<your key> SITE_ORIGIN=https://ludgar.github.io
   ```
4. Put the project URL and publishable key in `guardian.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).

### 3. GitHub Pages

Settings → Pages → deploy from `main`, root folder.

## Security notes

- The Bungie API key and Supabase publishable key are visible in the page source. Both are meant to be public, and the Bungie key is limited to this site's origin.
- Edits are only saved after the Edge Function checks the visitor's Bungie sign-in against the Guardian's memberships.
- The `guardians` table is only reachable through `register_guardian()`. Card numbers could still be claimed with made-up IDs; add a Bungie lookup in a function if that becomes a problem.
- Bungie sign-in for public clients lasts about an hour, then visitors sign in again.

## Files

```
index.html                         redirect to search
guardian.js                        shared config, Bungie + Supabase helpers, sign-in
profile.json                       activity list + LudGar's default data
timelines.json                     LudGar's legacy run timelines
support.js                         page runtime
supabase-setup.sql                 database schema
supabase/config.toml               function config
supabase/functions/save-guardian/  owner-verified save
archive/                           earlier single-player versions
```

Not affiliated with Bungie. Destiny is a trademark of Bungie, Inc.
