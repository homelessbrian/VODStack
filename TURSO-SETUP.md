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
- **Hide/Show**, **Rename**, drag the **⠿** handle (or use ↑ ↓ ⤒ ⤓) to reorder, or **Sort all rows**.
- **View** a row to see its titles, with posters and whether TMDB matched them.
- **A–Z / Newest first** per row sets how its titles are ordered in Nuvio.
- **Merge**: tick categories and press **Merge selected**. The merged row always shows everything in its
  categories, so new titles from the provider appear in it automatically. **Unmerge** splits it back.
- **Auto-hide**: words like `ARABIC, XXX` hide matching categories, including future ones. Optionally,
  new categories start hidden and get a **New** badge.

Titles the provider removes are deleted automatically 90 days later (they come back with their
TMDB match if the provider re-adds them before then).
