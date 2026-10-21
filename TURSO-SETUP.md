# Database setup (Turso), browser only

VODStack's website runs on Cloudflare Workers. Its data (titles, logins, settings) lives in a
[Turso](https://turso.tech) database. Turso's free plan counts usage **per month** (500 million
rows read, 10 million rows written), so a heavy day like a first import doesn't lock you out the
way Cloudflare D1's daily limits did.

VODStack creates its own tables the first time it runs. There is nothing to paste into a console.

## 1. Create the database

1. Go to [app.turso.tech](https://app.turso.tech) and sign up with **GitHub** (free, no card).
2. Click **Create Database**.
   - Name: `vodstack`
   - Location: the one closest to you (for example US East).
   - Leave the **TursoDB** toggle **off** (VODStack uses the standard libSQL database).
3. Open the database and copy its **URL** (`libsql://vodstack-<you>.turso.io`).
4. Create a token (**Create Token** / **Generate Token**): expiration **Never**, access
   **Read & Write**. Copy it. It is shown only once. Treat it like a password.

## 2. Connect it to the website

1. Cloudflare dashboard → **Workers & Pages → vodstack → Settings → Variables and Secrets**.
2. **Add variable** → type **Secret** → name `TURSO_URL` → paste the URL.
3. **Add variable** → type **Secret** → name `TURSO_TOKEN` → paste the token.
4. **Deploy**.

Use the **Secret** type for both. They don't belong in `wrangler.toml`, and secrets survive deploys.

## 3. First use

Open VODStack, choose **Start a new setup**, save the recovery code, and set up your provider.
The import and TMDB matching run in your browser tab; keep it open until they finish.

## Sharing with family

The person who sets up the provider owns the **library**. It is imported, refreshed and matched
with TMDB **once**, and shared. The owner also decides the rows (names, order, hidden).

On the Library page, create an invite link and send it to family on the same provider. They open
it, enter **their own** Xtream login or M3U link, and get **their own** Nuvio link on the same page.
Their playback uses their own account. They see the rows exactly as the owner set them up.

## Managing rows (owner)

On the **Rows** page:
- **Only show titles with full metadata in Nuvio** (on by default): titles TMDB couldn't match are kept
  out of Nuvio, rows and search, but stay in VODStack and appear once they're matched.
- **Only titles originally in English** (TMDB's original language) and **Hide copies the provider labels
  as another language** ("IT - Title", "[ITA]", "ITALIAN MOVIES"…): both off by default, switch on/off
  any time. Turning one on the first time fills in language info for the existing library (a few minutes).
  Rows left with nothing to show disappear from Nuvio.
- Each row's menu: **Shown**, **Hide row** (off the home screen, but its titles still appear in search,
  smart rows and stream choices) or **Hide everywhere** (kept out of all of those too).
  **Visibility of all listed…** sets it for every row the filter shows.
- **Rename** edits the name right in the row (Enter saves, Esc cancels). Drag the **⠿** handle (or use
  ↑ ↓ ⤒ ⤓) to reorder, or **Sort all rows**.
- **View** a row to see its titles, with posters and whether TMDB matched them.
- Each row's order menu: **A–Z**, **Newest first**, or **Shuffle** (a new random order every 4 hours, the
  same for everyone within those 4 hours). **Title order of all listed…** sets it for many rows at once.
- **Merge**: tick categories and press **Merge selected**. The merged row always shows everything in its
  categories, so new titles from the provider appear in it automatically. **Unmerge** splits it back.
  Ticks stay while you change the filter; **Add selected to…** puts everything ticked into an existing
  merged row, and ticking merged rows combines them into the chosen one.
- **Auto-hide**: words like `ARABIC, XXX` hide matching categories everywhere, including future ones. Optionally,
  new categories start hidden and get a **New** badge.

- **Smart rows**: rows built from TMDB lists (Trending today/this week, Popular, Top rated, Now in
  theaters, Airing now, or Popular in a genre), showing only titles your provider has, in TMDB's
  order. They refresh themselves every few hours. **Add starter set** adds trending, popular and top
  rated for movies and series in one click. **Build your own…** makes a custom one: genres (all or any),
  decade or years, sort (popular, highest rated, most voted, newest, oldest, box office), minimum
  rating, original language, US age rating, and how many titles (it keeps looking until it finds
  that many you have). **Preview** before saving; **Edit** later. Needs the TMDB key.

Titles the provider removes are deleted automatically 90 days later (they come back with their
TMDB match if the provider re-adds them before then).
