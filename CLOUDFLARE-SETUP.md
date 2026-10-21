# Cloudflare setup (Windows-friendly)

This deploys the current prototype to Cloudflare Workers with a Turso database. Do not add real IPTV credentials until you have deployed privately and tested the application.

## 1. Install prerequisites

1. Create/sign in to a Cloudflare account: https://dash.cloudflare.com/
2. Install Node.js 20 LTS: https://nodejs.org/
3. Download and extract this project ZIP.
4. Open PowerShell in the extracted `vodstack` folder.
5. Run:

   ```powershell
   npm install
   npx wrangler login
   ```

   Wrangler opens a browser so you can authorize it to access your Cloudflare account.

## 2. Create the database

Follow [`TURSO-SETUP.md`](./TURSO-SETUP.md) to create the Turso database and add `TURSO_URL` and `TURSO_TOKEN` as Worker secrets. VODStack creates its tables automatically.

## 3. Create the encryption key

This key encrypts IPTV credentials and the TMDB key. Losing it means encrypted credentials cannot be decrypted, so keep a secure offline backup. Never put it in GitHub or paste it into chat.

In PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$key = [Convert]::ToBase64String($bytes)
$key | npx wrangler secret put ENCRYPTION_KEY
```

Wrangler prompts you to confirm the secret. Save a copy of the generated key in a password manager or other secure offline location before closing the PowerShell window. Cloudflare stores Worker secrets encrypted and exposes them to the application at runtime. See https://developers.cloudflare.com/workers/configuration/secrets/.

## 5. Test locally first (recommended)

```powershell
npm run dev
```

Wrangler displays a local URL, usually `http://localhost:8787`. The local server also needs the encryption secret. For local development only, create a `.dev.vars` file in the project folder containing:

```dotenv
ENCRYPTION_KEY="PASTE_THE_SAME_BASE64_KEY_HERE"
```

Do not commit `.dev.vars`; it is ignored by `.gitignore`. Remove it when you finish local testing if you do not need it anymore.

## 6. Deploy

```powershell
npm run deploy
```

Wrangler prints a URL similar to `https://vodstack.<your-subdomain>.workers.dev`. Open it, create a setup, and save the recovery code. The recovery code is shown once. Then connect an authorized IPTV VOD source.

## 7. Add TMDB matching

1. Create/sign in to your TMDB account and visit https://www.themoviedb.org/settings/api.
2. Request/use a TMDB API key (v3).
3. In the app, open **Setup & security → TMDB matching**.
4. Paste the v3 API key and choose **Save & validate key**.
5. Once validated, choose **Match titles now** to match what is already imported. After that, matching runs automatically after every import or refresh. Titles that can't be matched confidently keep the provider's own name and poster rather than getting a wrong match.

TMDB matching uses provider titles and optional year hints. Automated title matching can still be wrong; inspect results before relying on the metadata. Manual match correction and deeper episode matching are future improvements.

## Updating an existing deployment

Database changes are applied automatically by the Worker on its first request after an update. There are no migration steps.

## How imports work (and why)

Cloudflare's Workers Free plan gives each request about 10 ms of CPU and 50 database calls, and the database's free plan has usage limits. A big IPTV library cannot be imported inside one request under those limits, so the import is split up:

1. The Worker downloads each provider list **once** and streams it to your browser unchanged. M3U = 1 provider request per import; Xtream = 5 (account check, movie categories, series categories, all movies, all series).
2. Your browser parses the data and compares it with what is already saved.
3. Only new or changed titles are sent back, a few hundred at a time; each batch is saved with a single SQL statement.

Keep the dashboard tab open until the import finishes. Refreshes only write titles that changed, and the library is shared, so friends who join cost no imports at all.

Stored stream links never contain your password: Xtream links are rebuilt from the encrypted source settings at play time, and M3U links store placeholders that are filled in at play time.

## Important limitations before public use

- The addon routes are still a generic compatibility scaffold; verify the exact Nuvio addon contract before depending on playback.
- Xtream series are listed but cannot be played yet (season/episode lists are not implemented). M3U series episodes play individually.
- Manual TMDB match correction is not complete.
- M3U grouping/classification varies by provider.
- This prototype still needs production hardening (especially outbound URL/SSRF protection, rate limiting, import batching, and playback URL handling) before being advertised for public multi-user use.
- TMDB API keys and IPTV credentials are encrypted at rest with `ENCRYPTION_KEY`, but the running application can decrypt them. Protect the Cloudflare account and keep the key private.
