# VODStack (prototype)

A VOD-only IPTV catalog manager for Nuvio. Imports Xtream Codes and M3U sources, preserves the provider's original movie/series groups, and stores custom display names and visibility separately from source data.

## Included

- Recovery-code based setup access and revocable server-side sessions.
- Server-side AES-256-GCM encryption for IPTV connection details and TMDB API keys.
- Xtream Codes and M3U VOD import that fits the Cloudflare Free plan: one provider request per list, browser-side parsing, batched writes, and refreshes that only write changed titles.
- Separate movie and series catalogs per provider group.
- Rename, hide/show, reorder catalogs.
- Refresh reconciles items into original groups and preserves catalog settings.
- TMDB v3 key validation and batch title matching (20 items per request), including metadata/artwork enrichment and stored match status.
- Cloudflare Workers + D1 deployment configuration and migrations.

## Deploy

Follow [`CLOUDFLARE-SETUP.md`](./CLOUDFLARE-SETUP.md) for Windows PowerShell instructions, including D1 setup, encryption secret creation, migrations, deployment and TMDB setup.

## Important limitations

This is a prototype, not a production-ready public service. The addon routes are a generic Stremio-style compatibility scaffold; confirm the exact addon contract supported by your Nuvio fork before relying on playback. Series season/episode expansion, manual TMDB match correction, stronger SSRF controls, rate limiting, and robust queued imports for very large playlists still need implementation/testing. M3U formats vary and may not contain enough information to separate series episodes reliably.

Do not expose this publicly until the security checklist in `SECURITY.md` has been reviewed. Provider URLs may contain credentials; they must be treated as secrets. The running Worker can decrypt encrypted data, so secure your Cloudflare account and keep `ENCRYPTION_KEY` private.
