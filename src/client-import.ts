// Browser-side importer, embedded into the dashboard page as a plain <script>.
//
// Why the browser does this work: on the Cloudflare Workers Free plan a single
// request gets ~10 ms of CPU and 50 database calls, which is nowhere near enough
// to parse a large playlist and write thousands of titles. So:
//
//   1. The Worker downloads each provider list ONCE and streams it straight back
//      to the browser untouched (almost no Worker CPU).
//   2. The browser parses it and works out what changed since the last import.
//   3. The browser sends only new/changed titles back in chunks; the Worker saves
//      each chunk with a single SQL statement.
//
// Provider requests per import:  M3U = 1.  Xtream = 5 (account, 2 category lists,
// all movies, all series), regardless of how many categories the provider has.
//
// Kept as plain JS inside String.raw so it needs no build step. Do not use
// backticks or dollar-brace sequences in here.
export const CLIENT_IMPORT_JS = String.raw`
window.VODImport = (function () {
  var ITEM_CHUNK = 400;
  var CATALOG_CHUNK = 500;
  var REMOVE_CHUNK = 2000;

  // 53-bit string hash (cyrb53), hex encoded. Used for change detection and for
  // turning credential-bearing URLs into stable, non-reversible IDs.
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  async function call(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var r = await fetch(path, opts);
    var data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.error || ('Request failed (HTTP ' + r.status + ')'));
    return data;
  }

  function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }

  // Ask the Worker to fetch one list from the provider. Exactly one provider request.
  async function providerText(part, label, progress) {
    progress('Downloading ' + label + '…');
    var r = await fetch('/api/library/provider?part=' + part, { credentials: 'same-origin' });
    if (!r.ok) {
      var d = {};
      try { d = await r.json(); } catch (e) {}
      throw new Error(d.error || ('Downloading ' + label + ' failed (HTTP ' + r.status + ')'));
    }
    if (!r.body || !r.body.getReader) return await r.text();
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var parts = [];
    var received = 0;
    var lastShown = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      received += step.value.length;
      parts.push(decoder.decode(step.value, { stream: true }));
      if (received - lastShown > 262144) { lastShown = received; progress('Downloading ' + label + '… ' + mb(received)); }
    }
    parts.push(decoder.decode());
    return parts.join('');
  }

  function parseJson(text, label) {
    try { return JSON.parse(text); }
    catch (e) {
      var start = text.trim().slice(0, 140).replace(/\s+/g, ' ');
      throw new Error('The provider did not return valid data for ' + label + '. It sent: "' + (start || '(empty response)') + '"');
    }
  }

  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function yearOf(v) { var m = str(v).match(/\b(19\d{2}|20\d{2})\b/); return m ? Number(m[1]) : null; }
  // In a title, only "(1999)" or "… - 1999" count as a year, so "1917" or "Blade Runner 2049" aren't misread.
  function yearInName(v) {
    var m = str(v).match(/\(\s*((?:19|20)\d{2})\s*\)|\s[-–]\s((?:19|20)\d{2})\s*(?:\[[^\]]*\])?\s*$/);
    var y = m ? Number(m[1] || m[2]) : null;
    return y && y <= new Date().getFullYear() + 1 ? y : null;
  }
  function clip(v, n) { var s = str(v).trim(); return s ? s.slice(0, n) : null; }
  function tmdbId(x) { var n = Number(x.tmdb || x.tmdb_id || 0); return n > 0 && n < 1e9 && Math.floor(n) === n ? n : null; }
  function httpUrl(v) { var s = str(v).trim(); return /^https?:\/\//i.test(s) ? s.slice(0, 1000) : null; }

  // ---------- M3U ----------
  function parseM3U(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/);
    var items = [];
    var cats = {};
    var info = null;
    var group = '';
    var live = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXTINF:') === 0) { info = line; group = ''; continue; }
      if (line.indexOf('#EXTGRP:') === 0) { group = line.slice(8).trim(); continue; }
      if (line.charAt(0) === '#' || !info) continue;
      var extinf = info; info = null;
      if (!/^https?:\/\//i.test(line)) continue;
      var attr = function (name) {
        var m = extinf.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"', 'i'));
        return m ? m[1] : '';
      };
      var comma = extinf.indexOf(',', extinf.lastIndexOf('"') + 1);
      var title = comma >= 0 ? extinf.slice(comma + 1).trim() : '';
      var urlPath = line.split('?')[0].toLowerCase();
      if (!title) title = decodeURIComponent(urlPath.split('/').pop() || 'Untitled');
      var t = null;
      if (/\/series\//.test(urlPath) || /\bs\d{1,2}\s?e\d{1,3}\b/i.test(title)) t = 'series';
      else if (/\/movies?\//.test(urlPath) || /\.(mkv|mp4|avi|mov|m4v|wmv)$/.test(urlPath) || /\/(vod|films?)\//.test(urlPath)) t = 'movie';
      if (!t) { live++; continue; }
      var g = attr('group-title') || group || 'Uncategorized';
      // Xtream-style URLs end in /<id>.<ext>; anything else gets a hash of the URL
      // (the raw URL usually contains the account password, so never use it as an ID).
      var idm = line.split('?')[0].match(/\/(movie|movies|series)\/[^\/]+\/[^\/]+\/(\d+)\.[a-z0-9]+$/i);
      var p = idm ? idm[2] : 'u' + hash(line);
      cats[t + '|' + g] = { t: t, c: g.slice(0, 200), n: g.slice(0, 150) };
      items.push({ t: t, c: g.slice(0, 200), p: p, title: title.slice(0, 300), y: yearInName(title), img: httpUrl(attr('tvg-logo')), d: null, pb: line.slice(0, 2000) });
    }
    return { items: items, catalogs: Object.keys(cats).map(function (k) { return cats[k]; }), skippedLive: live };
  }

  // ---------- Xtream ----------
  async function loadXtream(progress) {
    var acct = parseJson(await providerText('account', 'account info', progress), 'account info');
    var ui = acct && acct.user_info;
    if (!ui || String(ui.auth) === '0') throw new Error('The provider rejected the login. Double-check the server URL, username and password.');
    if (ui.status && String(ui.status).toLowerCase() !== 'active') throw new Error('The provider says this account is "' + ui.status + '".');

    var vodCats = parseJson(await providerText('vod_categories', 'movie categories', progress), 'movie categories');
    var serCats = parseJson(await providerText('series_categories', 'series categories', progress), 'series categories');
    var movies = parseJson(await providerText('vod_streams', 'all movies', progress), 'movies');
    var series = parseJson(await providerText('series', 'all series', progress), 'series');
    progress('Reading provider data…');

    var cats = {};
    var names = {};
    function addCats(t, list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (c) {
        var id = str(c.category_id !== undefined ? c.category_id : c.id);
        if (id) names[t + '|' + id] = clip(c.category_name || c.name, 150) || ('Category ' + id);
      });
    }
    addCats('movie', vodCats);
    addCats('series', serCats);

    var items = [];
    function catFor(t, raw) {
      var id = str(raw) || 'uncategorized';
      var key = t + '|' + id;
      if (!cats[key]) cats[key] = { t: t, c: id.slice(0, 200), n: names[key] || (id === 'uncategorized' ? 'Uncategorized' : 'Category ' + id) };
      return cats[key].c;
    }
    if (Array.isArray(movies)) movies.forEach(function (x) {
      var p = str(x.stream_id); if (!p) return;
      var ext = str(x.container_extension || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'mp4';
      items.push({ t: 'movie', c: catFor('movie', x.category_id), p: p, title: clip(x.name || x.title, 300) || 'Untitled',
        y: yearOf(x.year) || yearOf(x.releaseDate || x.release_date) || yearInName(x.name), img: httpUrl(x.stream_icon), d: clip(x.plot, 2000), pb: 'xt:' + ext, tm: tmdbId(x) });
    });
    if (Array.isArray(series)) series.forEach(function (x) {
      var p = str(x.series_id); if (!p) return;
      items.push({ t: 'series', c: catFor('series', x.category_id), p: p, title: clip(x.name || x.title, 300) || 'Untitled',
        y: yearOf(x.year) || yearOf(x.releaseDate || x.release_date) || yearInName(x.name), img: httpUrl(x.cover), d: clip(x.plot, 2000), pb: null, tm: tmdbId(x) });
    });
    return { items: items, catalogs: Object.keys(cats).map(function (k) { return cats[k]; }), skippedLive: 0 };
  }

  // ---------- Save ----------
  async function save(data, progress) {
    var base = '/api/library';
    if (!data.items.length) throw new Error('No movies or series were found in this source.' + (data.skippedLive ? ' (' + data.skippedLive.toLocaleString() + ' live channels were skipped.)' : ''));

    for (var i = 0; i < data.catalogs.length; i += CATALOG_CHUNK) {
      progress('Saving categories… ' + Math.min(i + CATALOG_CHUNK, data.catalogs.length) + ' / ' + data.catalogs.length);
      await call('POST', base + '/import/catalogs', { catalogs: data.catalogs.slice(i, i + CATALOG_CHUNK) });
    }

    // What is already stored, so unchanged titles are not re-sent or re-written.
    progress('Checking what changed…');
    var existing = {};
    var after = 0;
    for (;;) {
      var page = await call('GET', base + '/index?after=' + after);
      page.rows.forEach(function (r) { existing[r[1] + '|' + r[2] + '|' + r[3]] = { id: r[0], h: r[4], a: r[5] }; });
      if (page.next === null || page.next === undefined) break;
      after = page.next;
    }

    var seen = {};
    var send = [];
    var added = 0, changed = 0, unchanged = 0;
    data.items.forEach(function (it) {
      var key = it.t + '|' + it.c + '|' + it.p;
      if (seen[key]) return;
      seen[key] = true;
      it.h = hash([it.t, it.c, it.p, it.title, it.y, it.img, it.d, it.pb, it.tm || ''].join('\u0001'));
      var old = existing[key];
      if (!old) { added++; send.push(it); }
      else if (old.h !== it.h || !old.a) { changed++; send.push(it); }
      else unchanged++;
    });

    for (var j = 0; j < send.length; j += ITEM_CHUNK) {
      progress('Saving titles… ' + Math.min(j + ITEM_CHUNK, send.length).toLocaleString() + ' / ' + send.length.toLocaleString());
      await call('POST', base + '/import/items', { items: send.slice(j, j + ITEM_CHUNK) });
    }

    var gone = [];
    Object.keys(existing).forEach(function (k) { if (!seen[k] && existing[k].a) gone.push(existing[k].id); });
    for (var k = 0; k < gone.length; k += REMOVE_CHUNK) {
      progress('Marking removed titles…');
      await call('POST', base + '/import/remove', { ids: gone.slice(k, k + REMOVE_CHUNK) });
    }

    var total = Object.keys(seen).length;
    var withTmdb = data.items.filter(function (it) { return it.tm; }).length;
    var status = 'OK · ' + total.toLocaleString() + ' titles (' + added.toLocaleString() + ' new, ' + changed.toLocaleString() + ' updated, ' + gone.length.toLocaleString() + ' removed)';
    await call('POST', base + '/import/finish', { status: status });
    return { withTmdb: withTmdb, total: total, added: added, changed: changed, unchanged: unchanged, removed: gone.length, catalogs: data.catalogs.length, skippedLive: data.skippedLive, status: status };
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // If a relay is set up, make sure it is awake before downloading (Render free tier sleeps).
  async function wakeRelay(progress) {
    var w = await call('GET', '/api/relay/wake');
    if (!w.configured || w.ready) return;
    var started = Date.now();
    while (Date.now() - started < 180000) {
      progress('Waking up the relay… (this can take about a minute after it has been idle)');
      await sleep(4000);
      w = await call('GET', '/api/relay/wake');
      if (w.ready) return;
    }
    throw new Error('The relay did not wake up within 3 minutes. Check that the vodstack-relay service is running in Render.');
  }

  // Link titles to TMDB/IMDb in small batches (each batch stays under Workers Free limits).
  async function match(progress) {
    progress = progress || function () {};
    var st = await call('GET', '/api/tmdb/status');
    if (!st.configured) return { skipped: true };
    var ids = [];
    var after = 0;
    for (;;) {
      var page = await call('GET', '/api/tmdb/pending?after=' + after);
      ids = ids.concat(page.ids);
      if (page.next === null || page.next === undefined) break;
      after = page.next;
    }
    var total = ids.length, done = 0, matched = 0, unmatched = 0, pause = 0, limited = 0;
    var batches = [];
    for (var i = 0; i < ids.length; i += st.batch) batches.push(ids.slice(i, i + st.batch));
    async function worker() {
      for (var b = batches.shift(); b; b = batches.shift()) {
        if (pause) await sleep(pause);
        var r = await call('POST', '/api/tmdb/match', { ids: b });
        done += r.checked; matched += r.matched; unmatched += r.unmatched + r.errors;
        // Rate-limited: back off and retry the batch later (the server skips titles already done).
        if (r.rateLimited) {
          if (++limited > 40) throw new Error('TMDB keeps rate-limiting this key. Try "Match titles" again in a few minutes.');
          pause = 3000; batches.push(b);
        } else pause = 0;
        progress('Matching with TMDB… ' + done.toLocaleString() + ' / ' + total.toLocaleString() + ' (' + matched.toLocaleString() + ' matched)');
      }
    }
    if (total) { await Promise.all([worker(), worker(), worker()]); await call('POST', '/api/tmdb/stats', {}); }
    return { total: total, matched: matched, unmatched: unmatched };
  }

  var running = false;
  // fileText: playlist contents the user picked from their own device. Used when the
  // provider blocks requests coming from Cloudflare (e.g. "error code: 1106").
  async function run(kind, progress, fileText) {
    if (running) throw new Error('An import is already running. Wait for it to finish.');
    running = true;
    progress = progress || function () {};
    try {
      var data;
      if (kind === 'xtream' && typeof fileText === 'string') throw new Error('Playlist files can only be used with M3U sources. Add this provider as an M3U playlist instead.');
      if (typeof fileText !== 'string') await wakeRelay(progress);
      if (kind === 'xtream') data = await loadXtream(progress);
      else {
        var text = typeof fileText === 'string' ? fileText : await providerText('playlist', 'playlist', progress);
        progress('Reading playlist…');
        if (text.replace(/^﻿/, '').trim().indexOf('#EXTM3U') !== 0 && text.indexOf('#EXTINF') < 0) {
          var start = text.trim().slice(0, 140).replace(/\s+/g, ' ');
          throw new Error('That URL did not return an M3U playlist. It sent: "' + (start || '(empty response)') + '"');
        }
        data = parseM3U(text);
      }
      return await save(data, progress);
    } catch (e) {
      try { await call('POST', '/api/library/import/finish', { error: e.message }); } catch (e2) {}
      throw e;
    } finally {
      running = false;
    }
  }

  return { run: run, match: match, _parseM3U: parseM3U, _hash: hash };
})();
`;
