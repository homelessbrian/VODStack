# Relay setup (Render), browser only

Some IPTV providers sit behind Cloudflare and block requests that come from Cloudflare
Workers. VODStack then shows **"error code: 1106"**. The relay is a tiny service on
[Render](https://render.com) that downloads the provider's playlist/API data for VODStack,
so the provider sees an ordinary server instead of a Cloudflare Worker.

- It only passes data through and stores nothing.
- It only accepts requests that carry your secret `RELAY_KEY`.
- Provider passwords are sent in the request body, never in the address, so they don't show
  up in Render's logs.
- Render's free tier puts the relay to sleep after 15 idle minutes. VODStack wakes it in the
  background when someone opens Nuvio, and before a refresh, so it's awake while people are watching
  and asleep otherwise (well within Render's 750 free hours a month).
- Series episode lists are remembered after the first open and refreshed daily in the background,
  so most series opens don't need the relay at all.

## 1. Create the relay on Render

1. Go to [render.com](https://render.com) and sign up with **GitHub**.
2. Choose **New → Blueprint**.
3. Connect GitHub if asked, give Render access to the **VODStack** repository, then select it.
4. Render reads `render.yaml` and shows one service, **vodstack-relay** (Free plan). Click
   **Deploy Blueprint** (or **Apply**).
5. Wait until the service shows **Live**. This takes a minute or two.

## 2. Copy the relay's address and key

1. Open the **vodstack-relay** service.
2. Copy its address at the top. It looks like `https://vodstack-relay-xxxx.onrender.com`.
3. Open its **Environment** tab, reveal **RELAY_KEY**, and copy the value.

Treat the key like a password.

## 3. Give them to VODStack in Cloudflare

1. In the Cloudflare dashboard open **Workers & Pages → vodstack → Settings → Variables and Secrets**.
2. Click **Add**, set the type to **Secret**, name it `RELAY_URL`, and paste the Render address.
3. Click **Add** again, set the type to **Secret**, name it `RELAY_KEY`, and paste the key.
4. Click **Deploy** (or **Save**).

Use the **Secret** type for both. Plain-text variables set in the dashboard can be wiped the
next time the code is deployed from GitHub, but secrets are kept.

## 4. Use it

Reload VODStack (Ctrl+Shift+R). The Sources page now says downloads go through your relay.
Press **Refresh** on a source. The plain button works again; you no longer need a file.

If the provider blocks Render as well, VODStack will say so. In that case keep using
**Refresh from file** for that provider.

To stop using the relay, delete the two secrets in Cloudflare. To remove it completely,
delete the **vodstack-relay** service in Render.

## Alternative: Deno Deploy (recommended)

Deno Deploy's free plan wakes in a fraction of a second (no one-minute wait), has no monthly hours
limit and includes 20 GB of data a month (Render: 5 GB). The relay code for it is `relay/deno.ts`.

1. Go to [console.deno.com](https://console.deno.com) and sign in with **GitHub**. Create an
   organization (any name).
2. Press **+ New App** and pick the **VODStack** repository. If it isn't listed, use
   **Configure GitHub App permissions** to give Deno Deploy access to it.
3. In **App Config**, press **Edit build config**:
   - Framework preset: **No Preset**
   - Install command: *(empty)* · Build command: *(empty)*
   - Runtime configuration: **Dynamic**
   - Dynamic Entrypoint: `relay/deno.ts`
   Close the drawer to save.
4. Press **Add/Edit environment variables** → **+ Add variable**: name `RELAY_KEY`, value = the
   same key VODStack already uses (copy it from Render → vodstack-relay → Environment), type
   **Secret**, contexts **Production** and **Development**. **Save**.
5. Press **Create App** and wait for the build. Copy the app's URL from the top of the build page.
   Opening `<that URL>/health` should show `{"ok":true,…,"host":"deno"}`.
6. In Cloudflare (**Workers & Pages → vodstack → Settings → Variables and Secrets**), change
   `RELAY_URL` to the Deno URL and deploy. `RELAY_KEY` stays the same.
7. Press **Refresh now** in VODStack. If the provider refuses the Deno relay, put `RELAY_URL` back
   to the Render URL; nothing else changes.

Both relays compress what they send to VODStack (about 10× smaller), so data limits are a
non-issue either way.
