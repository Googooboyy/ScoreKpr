# The Scorekeeper

Track your board game wins and bragging rights. A web app for running campaigns with friends: log wins, see leaderboards, tally round-by-round scores, and share invite or view-only links.

**Public Beta · v0.9.5** — Free while we build.

## Features

- **Sign in with Google** — One account, all your campaigns
- **Campaigns (playgroups)** — Create campaigns, invite via link, leave when you're done. Each campaign has its own meeples, games, and rankings
- **Add wins** — 3-step flow: pick game → pick winner & players → pick date. Optional BoardGameGeek search when adding games
- **Tally Scores** — Round-by-round score tabulation for games with multiple phases (VP, objectives, cards, resources, coins). Record the winner in one tap
- **Leaderboard** — Per-campaign standings; meeples ranked by wins; favourite quotes on cards; share a read-only link
- **Meeple profiles** — Click any meeple for stats: total wins, favourite game, win rate, campaign breakdown, recent wins. Link your account to a meeple for cross-campaign stats
- **History** — Browse and filter past games; edit or delete entries; audit trail on changes
- **Data** — Export JSON backup, import, or clear (when signed in)
- **Guest viewing** — Anyone with the invite link can view the leaderboard without signing in
- **Personalisation** — Custom meeple photos (tier-dependent), game images, preset avatars, colours
- **Membership tiers** — Commoner (free), Noble, Royal. Tiers control campaign limit and party permit (max meeples per campaign)

## Tech

- Static frontend: HTML, CSS, JavaScript (no build step)
- Backend: [Supabase](https://supabase.com) (Auth, Postgres, RLS, Storage for media)
- Migrations in `supabase/migrations/`

## Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/Googooboyy/Scorekeeper.git
   cd Scorekeeper
   ```

2. **Supabase**
   - Create a project at [Supabase](https://supabase.com)
   - Enable Google sign-in in Authentication → Providers
   - Run the migrations in `supabase/migrations/` (e.g. via Supabase Dashboard SQL editor or CLI)
   - Create a storage bucket for media if using image uploads (see migration `038_storage_scorekpr_media_policies.sql`)

3. **App config**
   - Copy the example config:
     ```bash
     cp js/config.supabase.example.js js/config.supabase.js
     ```
   - In Supabase: **Settings → API** — copy **Project URL** and **anon public** key
   - Put them in `js/config.supabase.js`:
     - `window.SCOREKEEPER_SUPABASE_URL`
     - `window.SCOREKEEPER_SUPABASE_ANON_KEY`

4. **Run**
   - Open `index.html` in a browser, or serve the folder (e.g. `npx serve .` or any static server).

`js/config.supabase.js` is gitignored; never commit real keys.

## License

Private / unlicensed unless otherwise noted.
