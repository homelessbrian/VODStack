# Security notes

Before exposing this prototype publicly:

1. Configure a unique, random 32-byte `ENCRYPTION_KEY` as a Worker secret. Back it up securely outside the repository. Do not rotate it without a credential re-encryption migration.
2. Restrict source URL egress to trusted public provider hosts or use an egress proxy that blocks private, loopback, link-local, and metadata-service addresses after DNS resolution. URL string checks alone do not fully prevent SSRF or DNS rebinding.
3. Add per-IP and per-setup rate limits to recovery, login, import, refresh, and addon endpoints. Consider Turnstile for recovery abuse.
4. Add request size limits and background/batched imports for large playlists.
5. Review provider terms and confirm that you are authorized to access and transform the source content.
6. Confirm Nuvio's exact addon contract before production. The current adapter is a Stremio-style scaffold and may not match Nuvio's custom manifest, metadata, or playback expectations.
7. Never log provider URLs containing credentials, recovery codes, session tokens, addon tokens, or decrypted source configuration.
8. Add account deletion, session revocation, export/import backups, and an incident-response plan before multi-user public launch.

The recovery code is a bearer secret. Anyone who obtains it can access that setup. The addon URL is also a bearer secret because it authorizes catalog access and playback URL resolution; do not publish it publicly.
