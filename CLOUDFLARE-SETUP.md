# Cloudflare setup (Windows-friendly)

This deploys the current prototype to Cloudflare Workers with a persistent D1 database. Do not add real IPTV credentials until you have deployed privately and tested the application.

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

## 2. Create the D1 database

Run:

```powershell
npx wrangler d1 create vodstack
```

Cloudflare returns a database UUID. Open `wrangler.toml` and replace `REPLACE_WITH_D1_DATABASE_ID` with that exact UUID. Keep the binding name `DB` and database name `vodstack` unchanged unless you also update the config.

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

## 4. Apply database migrations

Apply the schema to your remote D1 database:

```powershell
npx wrangler d1 migrations apply vodstack --remote
```

Review the output and confirm both migrations are applied. This creates the setup/session tables, IPTV source and catalog tables, and TMDB match fields.

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
5. Once validated, choose **Match next 25 items** repeatedly to process the catalog in batches. Unmatched items are retained and marked for review rather than being silently assigned a weak match.

TMDB matching uses provider titles and optional year hints. Automated title matching can still be wrong; inspect results before relying on the metadata. Manual match correction and deeper episode matching are future improvements.

## Important limitations before public use

- The addon routes are still a generic compatibility scaffold; verify the exact Nuvio addon contract before depending on playback.
- Series season/episode expansion and manual TMDB match correction are not complete.
- M3U grouping/classification varies by provider.
- This prototype still needs production hardening (especially outbound URL/SSRF protection, rate limiting, import batching, and playback URL handling) before being advertised for public multi-user use.
- TMDB API keys and IPTV credentials are encrypted at rest with `ENCRYPTION_KEY`, but the running application can decrypt them. Protect the Cloudflare account and keep the key private.
