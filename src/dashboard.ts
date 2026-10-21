// The dashboard page: one HTML document with inline styles and two scripts
// (the importer from client-import.ts, and the page logic below).
// Both scripts are plain JS inside String.raw, so they contain no backticks or dollar-brace sequences.
import { CLIENT_IMPORT_JS } from './client-import';

const CSS = String.raw`
:root{color-scheme:dark;--bg:#0b0e14;--panel:#131925;--panel2:#192131;--line:#283246;--muted:#9aa8bc;--text:#f3f6fb;--accent:#9aafff;--red:#ff8585;--green:#89e0b4}*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 90% -20%,#24365a 0%,transparent 60%),var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}button,input,select{font:inherit}button{cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--text);padding:10px 14px;border-radius:10px;font-weight:650}button.primary{background:var(--accent);color:#101522;border-color:transparent}button.danger{color:var(--red)}button:disabled{opacity:.5;cursor:wait}input,select{width:100%;border:1px solid var(--line);background:#0c111a;color:var(--text);border-radius:9px;padding:11px 12px;outline:none}input:focus,select:focus{border-color:var(--accent)}label{display:block;color:var(--muted);font-size:13px;margin:10px 0 6px}.app{max-width:1120px;margin:auto;padding:30px 20px 70px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}.brand{display:flex;align-items:center;gap:12px}.logo{width:44px;height:44px;border-radius:13px;background:linear-gradient(140deg,#a8b9ff,#6579d8);color:#0b1020;display:grid;place-items:center;font-size:22px;font-weight:900}.eyebrow{font-size:11px;color:var(--accent);font-weight:800;letter-spacing:.14em;text-transform:uppercase}.title{font-size:28px;line-height:1.15;margin:2px 0 0;letter-spacing:-.04em}.muted{color:var(--muted)}.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px}.side,.panel{border:1px solid var(--line);border-radius:16px;background:rgba(19,25,37,.92)}.side{padding:13px;height:max-content}.nav{width:100%;text-align:left;background:transparent;border-color:transparent;color:var(--muted);margin:2px 0}.nav.active{background:var(--panel2);color:var(--text);border-color:var(--line)}.side-note{border-top:1px solid var(--line);margin-top:12px;padding:14px 8px 4px;font-size:12px;color:var(--muted)}.content{min-width:0}.page-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.page-head h2{margin:0;font-size:22px;letter-spacing:-.03em}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}.stat{border:1px solid var(--line);border-radius:14px;padding:16px;background:var(--panel)}.stat strong{display:block;font-size:27px;letter-spacing:-.04em}.stat span{color:var(--muted);font-size:12px}.panel{padding:18px;margin-bottom:16px}.panel h3{margin:0 0 4px;font-size:16px}.panel p{margin:4px 0 14px;color:var(--muted);font-size:13px}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.wide{grid-column:1/-1}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.catalog{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}.catalog:last-child{border-bottom:0}.catalog-title{font-weight:700;overflow-wrap:anywhere}.meta{font-size:12px;color:var(--muted);margin-top:3px}.catalog-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.small{padding:7px 9px;font-size:12px}.pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px 8px;font-size:11px;color:var(--muted);margin-right:6px}.hidden{opacity:.6}.notice{border:1px solid #3a4c72;background:#17233b;border-radius:12px;padding:12px 14px;color:#c8d6ff;font-size:13px;margin-bottom:16px}.error{color:var(--red);font-size:13px;margin-top:10px}.success{color:var(--green);font-size:13px;margin-top:10px}.empty{text-align:center;padding:38px 12px;color:var(--muted)}.empty strong{display:block;color:var(--text);font-size:17px;margin-bottom:4px}.code{font:700 18px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em;word-break:break-word}.divider{border:0;border-top:1px solid var(--line);margin:16px 0}.row{display:flex;gap:10px;align-items:center}.row>*{flex:1}.switch{width:auto}.help{font-size:12px;color:var(--muted)}@media(max-width:760px){.layout{grid-template-columns:1fr}.side{display:flex;gap:5px;overflow:auto}.nav{white-space:nowrap;width:auto}.side-note{display:none}.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.stat{padding:12px}.stat strong{font-size:22px}.formgrid{grid-template-columns:1fr}.wide{grid-column:auto}.top{align-items:flex-start}.catalog{grid-template-columns:1fr}.catalog-actions{justify-content:flex-start}.title{font-size:24px}}
`;

const PAGE_JS = String.raw`(function () {
  var root = document.getElementById('root');
  var topAction = document.getElementById('topAction');
  var S = { tab: 'rows', data: null, filter: 'all', status: 'all', q: '', recovery: null };
  var invite = new URLSearchParams(location.search).get('invite');

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function say(id, text, ok) { var e = el(id); if (e) { e.className = ok ? 'success' : 'error'; e.textContent = text; } }
  function n(v) { return Number(v || 0).toLocaleString(); }
  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var r = await fetch(path, init);
    var d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }
  function field(label, name, type, placeholder, value, help) {
    return '<div><label>' + label + '</label><input name="' + name + '" type="' + (type || 'text') + '" placeholder="' + esc(placeholder || '') + '" value="' + esc(value || '') + '" autocomplete="off">' + (help ? '<div class="help">' + help + '</div>' : '') + '</div>';
  }
  function copyButton(id, text) {
    var b = el(id);
    if (b) b.onclick = function () { navigator.clipboard.writeText(text).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); }); };
  }

  async function load() {
    try { S.data = await api('/api/state'); render(); }
    catch (e) { S.data = null; welcome(); }
  }

  // ---------- signed out ----------
  function welcome() {
    topAction.innerHTML = '';
    var recover = '<div class="row" style="margin-top:6px"><input id="recoverCode" placeholder="VOD-XXXXXX-XXXXXX-XXXXXX-XXXXXX" autocomplete="off"><button id="recoverBtn" style="flex:0 0 auto">Recover</button></div>';
    if (invite) {
      root.innerHTML = '<div class="panel"><div class="eyebrow">INVITE</div><h2 id="invTitle">Checking your invite…</h2><p id="invText"></p><form id="joinForm" style="display:none"><div class="formgrid" id="joinFields"></div><div class="actions"><button class="primary" id="joinBtn" type="submit">Get my Nuvio link</button></div></form><div id="msg"></div><hr class="divider"><div class="help">Already set up and want to change your login? Enter your recovery code:</div>' + recover + '</div>';
      api('/api/invite?code=' + encodeURIComponent(invite)).then(function (d) {
        el('invTitle').textContent = 'Watch ' + d.name + ' in Nuvio';
        el('invText').textContent = 'Enter the ' + (d.kind === 'xtream' ? 'Xtream Codes login' : 'M3U playlist link') + ' you got for ' + d.name + '. You’ll get your own personal link to add to Nuvio.';
        el('joinFields').innerHTML = loginFields(d.kind);
        el('joinForm').style.display = 'block';
      }).catch(function (e) { el('invTitle').textContent = 'This invite link isn’t valid'; say('msg', e.message); });
      el('joinForm').onsubmit = async function (e) {
        e.preventDefault();
        el('joinBtn').disabled = true;
        say('msg', 'Checking your login…', true);
        try {
          var body = Object.fromEntries(new FormData(el('joinForm')).entries());
          body.code = invite;
          var d = await api('/api/join', { method: 'POST', body: body });
          history.replaceState(null, '', location.pathname);
          invite = null;
          joined(d);
        } catch (err) { say('msg', err.message); el('joinBtn').disabled = false; }
      };
    } else {
      root.innerHTML = '<div class="notice">VODStack turns your IPTV provider’s movies and series into rows, search and playback inside Nuvio.</div><div class="panel"><div class="eyebrow">WELCOME</div><h2>Get started</h2><p>Use your recovery code to get back into your setup, or start a new one. Joining someone’s shared library? Open the invite link they sent you.</p>' + recover + '<div class="actions"><button id="newBtn">Start a new setup</button></div><div id="msg"></div></div>';
      el('newBtn').onclick = async function () {
        try { var d = await api('/api/setup', { method: 'POST', body: {} }); S.recovery = d.recoveryCode; await load(); } catch (e) { say('msg', e.message); }
      };
    }
    el('recoverBtn').onclick = async function () {
      try {
        var code = el('recoverCode').value.trim();
        if (!code) throw new Error('Enter your recovery code.');
        await api('/api/recover', { method: 'POST', body: { code: code } });
        history.replaceState(null, '', location.pathname); invite = null;
        await load();
      } catch (e) { say('msg', e.message); }
    };
  }

  function joined(d) {
    topAction.innerHTML = '';
    root.innerHTML = '<div class="panel"><div class="eyebrow">ALL SET</div><h2>Your Nuvio link</h2><p>In Nuvio, add this as an addon. It’s personal to you, so don’t share it.</p><div class="code" style="font-size:13px">' + esc(d.addonUrl) + '</div><div class="actions"><button class="primary" id="copyAddon">Copy</button></div>' +
      '<hr class="divider"><h3>Your recovery code</h3><p>Keep this somewhere safe. You only need it if you ever want to come back and change your login.</p><div class="code">' + esc(d.recoveryCode) + '</div><div class="actions"><button id="copyRecovery">Copy</button><button id="doneBtn">Done</button></div></div>';
    copyButton('copyAddon', d.addonUrl);
    copyButton('copyRecovery', d.recoveryCode);
    el('doneBtn').onclick = function () { load(); };
  }

  // ---------- family member: one simple page ----------
  function memberPage() {
    var d = S.data;
    return '<div class="panel"><div class="eyebrow">' + esc(d.library.name) + '</div><h2>Your Nuvio link</h2><p>Add this to Nuvio as an addon. It’s personal to you, so don’t share it.</p>' +
      (d.login ? '' : '<div class="notice">Save your login below first, or nothing will play.</div>') +
      '<div class="code" style="font-size:13px">' + esc(d.addonUrl || '') + '</div><div class="actions"><button class="primary" id="copyAddon">Copy</button></div></div>' +
      '<div class="panel"><h3>Your login</h3><p>Only used when you press play, so it’s your own account and connection limit.</p><form id="memberLogin"><div class="formgrid">' + loginFields(d.library.kind, d.login) + '</div><div class="actions"><button id="saveLogin" type="submit">Update login</button></div><div id="msg"></div></form></div>' +
      '<div class="panel"><h3>Recovery code</h3><p>Your way back to this page from another device.</p><button id="rotate" class="danger">Make a new recovery code</button></div>';
  }
  function wireMember() {
    copyButton('copyAddon', S.data.addonUrl || '');
    el('memberLogin').onsubmit = async function (e) {
      e.preventDefault();
      el('saveLogin').disabled = true;
      say('msg', 'Checking your login…', true);
      try { await api('/api/login', { method: 'POST', body: Object.fromEntries(new FormData(el('memberLogin')).entries()) }); await load(); say('msg', 'Login updated.', true); }
      catch (err) { say('msg', err.message); el('saveLogin').disabled = false; }
    };
    el('rotate').onclick = async function () {
      if (!confirm('Make a new recovery code? The current one will stop working.')) return;
      try { var r = await api('/api/recovery-code/rotate', { method: 'POST', body: {} }); S.recovery = r.recoveryCode; render(); } catch (err) { alert(err.message); }
    };
  }

  // ---------- signed in ----------
  function render() {
    var d = S.data;
    topAction.innerHTML = '<button id="logout">Lock</button>';
    el('logout').onclick = async function () { await api('/api/logout', { method: 'POST', body: {} }); S.data = null; welcome(); };
    if (d.role === 'member') {
      root.innerHTML = (S.recovery ? '<div class="notice"><strong>Your new recovery code:</strong><div class="code">' + esc(S.recovery) + '</div></div>' : '') + memberPage();
      wireMember();
      return;
    }
    var tabs = d.role === 'owner' ? [['rows', '▦ Rows'], ['library', '⇄ Library'], ['settings', '⚙ Settings']]
      : [['setup', '⇄ Set up provider'], ['settings', '⚙ Settings']];
    if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];
    var banner = S.recovery ? '<div class="notice"><strong>Save your recovery code now.</strong> It’s the only way back into this setup from another device, and it’s shown only once.<div class="code">' + esc(S.recovery) + '</div><div class="actions"><button id="copyRecovery">Copy</button><button id="dismissRecovery">I saved it</button></div></div>' : '';
    var page = S.tab === 'rows' ? rowsPage() : S.tab === 'library' ? libraryPage() : S.tab === 'setup' ? setupPage() : settingsPage();
    root.innerHTML = banner + '<div class="layout"><aside class="side">' + tabs.map(function (t) { return '<button class="nav ' + (S.tab === t[0] ? 'active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      '<div class="side-note">' + (d.library ? esc(d.library.name) + '<br>' + (d.role === 'owner' ? 'You own this library' : 'Shared library') : 'No provider yet') + '</div></aside><section class="content">' + page + '</section></div>';
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); }; });
    if (S.recovery) { copyButton('copyRecovery', S.recovery); el('dismissRecovery').onclick = function () { S.recovery = null; render(); }; }
    ({ rows: wireRows, library: wireLibrary, setup: wireSetup, settings: wireSettings })[S.tab]();
  }

  // ---------- rows ----------
  function isNew(c) {
    var lib = S.data.library;
    var now = Date.now() / 1000;
    return !!(c.createdAt && lib && lib.createdAt && c.createdAt > lib.createdAt + 3600 && now - c.createdAt < 14 * 86400);
  }
  var STATUS = {
    all: function () { return true; },
    shown: function (c) { return !c.hidden && !c.mergedInto && c.item_count > 0; },
    hidden: function (c) { return c.hidden; },
    merged: function (c) { return c.isMerge || c.mergedInto; },
    new: isNew,
    empty: function (c) { return !c.item_count; },
  };
  function visibleRows() {
    var q = S.q.toLowerCase();
    return S.data.catalogs.filter(function (c) {
      return (S.filter === 'all' || c.media_type === S.filter) && STATUS[S.status](c) &&
        (!q || c.name.toLowerCase().indexOf(q) >= 0 || c.source_category_name.toLowerCase().indexOf(q) >= 0);
    });
  }
  function rowsPage() {
    var cats = S.data.catalogs;
    if (!cats.length) return '<div class="panel"><div class="empty"><strong>No rows yet</strong>' + 'Import your provider on the Library page.' + '</div></div>';
    var shown = cats.filter(function (c) { return !c.hidden && c.item_count > 0 && !c.mergedInto; }).length;
    var titles = cats.reduce(function (t, c) { return t + (c.isMerge ? 0 : c.item_count); }, 0);
    return '<div class="page-head"><div><h2>Rows</h2><div class="muted">The rows everyone in your library sees in Nuvio. Only you can change them.</div></div></div>' +
      '<div class="cards"><div class="stat"><strong>' + n(cats.length) + '</strong><span>Categories</span></div><div class="stat"><strong>' + n(shown) + '</strong><span>Shown in Nuvio</span></div><div class="stat"><strong>' + n(titles) + '</strong><span>Titles</span></div></div>' +
      '<div class="notice">Tip: hide categories you don’t watch. Fewer rows means Nuvio’s home screen loads faster.</div>' + rulesPanel() +
      '<div class="panel"><div class="row"><input id="rowSearch" placeholder="Filter categories…" value="' + esc(S.q) + '"><select id="rowType" style="max-width:130px"><option value="all">All types</option><option value="movie">Movies</option><option value="series">Series</option></select><select id="rowStatus" style="max-width:130px"><option value="all">Any status</option><option value="shown">Shown</option><option value="hidden">Hidden</option><option value="merged">Merged</option><option value="new">New</option><option value="empty">Empty</option></select></div>' +
      '<div class="actions"><button class="small" id="showAll">Show all listed</button><button class="small" id="hideAll">Hide all listed</button><button class="small" id="pickAll">Select all listed</button><button class="small primary" id="mergeBtn">Merge selected</button><select id="sortRows" style="width:auto;padding:7px 9px;font-size:12px"><option value="">Sort all rows…</option><option value="az">Name A–Z</option><option value="za">Name Z–A</option><option value="most">Most titles first</option><option value="fewest">Fewest titles first</option><option value="movie">Movies first</option><option value="series">Series first</option></select></div><div class="help">Merge: tick two or more categories (or a merged row plus the categories to add to it), then press Merge selected. New titles in any of them keep showing up in the merged row.</div><div id="msg"></div><div id="viewer"></div><div id="rowList">' + rowList() + '</div></div>';
  }
  function rulesPanel() {
    var st = S.data.library.settings || { hideNew: false, hideRules: [] };
    return '<div class="panel"><h3>Auto-hide</h3><p>Categories whose name contains any of these words are hidden automatically, including new ones from future refreshes. Separate words with commas.</p>' +
      '<input id="hideRules" placeholder="e.g. ARABIC, XXX, |FR|, ADULT" value="' + esc(st.hideRules.join(', ')) + '">' +
      '<label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="hideNew" style="width:auto"' + (st.hideNew ? ' checked' : '') + '> New categories from the provider start hidden (they get a “New” badge so you can review them)</label>' +
      '<div class="actions"><button class="small" id="saveRules">Save</button><button class="small primary" id="applyRules">Save and hide matching now</button></div><div id="msgRules"></div></div>';
  }
  function rowHtml(c, indent) {
    var cats = S.data.catalogs;
    var parent = c.mergedInto ? find(c.mergedInto) : null;
    var members = c.isMerge ? cats.filter(function (m) { return m.mergedInto === c.id; }) : [];
    var meta = '<span class="pill">' + (c.media_type === 'movie' ? 'Movies' : 'Series') + '</span>' +
      (c.isMerge ? '<span class="pill">Merged</span>' : '') + (isNew(c) ? '<span class="pill" style="color:var(--green)">New</span>' : '') +
      (c.renamed && !c.isMerge ? 'Provider name: ' + esc(c.source_category_name) + ' · ' : '') + n(c.item_count) + ' titles · ' +
      (parent ? 'Shown inside “' + esc(parent.name) + '”' : c.item_count ? (c.hidden ? 'Hidden' : 'Shown') : 'Empty');
    var buttons = parent
      ? '<button class="small" data-unmerge="' + c.id + '">Remove from merge</button>'
      : '<button class="small" data-rename="' + c.id + '">Rename</button><button class="small" data-toggle="' + c.id + '">' + (c.hidden ? 'Show' : 'Hide') + '</button>' +
        (c.isMerge ? '<button class="small" data-unmerge="' + c.id + '">Unmerge</button>' : '') +
        '<button class="small" data-order="' + c.id + '" title="How titles are ordered in this row">' + (c.titleOrder === 'recent' ? 'Newest first' : 'A–Z') + '</button>' +
        '<button class="small" data-move="' + c.id + '" data-dir="top" title="Move to top">⤒</button><button class="small" data-move="' + c.id + '" data-dir="-1">↑</button><button class="small" data-move="' + c.id + '" data-dir="1">↓</button><button class="small" data-move="' + c.id + '" data-dir="bottom" title="Move to bottom">⤓</button>';
    var grip = indent ? '' : '<span data-drag="' + c.id + '" title="Drag to reorder" style="cursor:grab;touch-action:none;user-select:none;color:var(--muted);font-size:18px;line-height:1;padding:2px 4px">⠿</span>';
    var row = '<div class="catalog ' + (c.hidden || !c.item_count || parent ? 'hidden' : '') + '"' + (indent ? ' style="margin-left:28px"' : '') + '><div style="display:flex;gap:8px;align-items:flex-start">' + grip + '<input type="checkbox" data-pick="' + c.id + '" style="width:auto;margin-top:4px"' + (S.picked && S.picked[c.id] ? ' checked' : '') + '><div><div class="catalog-title">' + esc(c.name) + '</div><div class="meta">' + meta + '</div></div></div>' +
      '<div class="catalog-actions"><button class="small" data-view="' + c.id + '">View</button>' + buttons + '</div></div>';
    if (indent) return row;
    return '<div data-group="' + c.id + '">' + row + members.map(function (m) { return rowHtml(m, true); }).join('') + '</div>';
  }
  function rowList() {
    var list = visibleRows();
    if (!list.length) return '<div class="empty">No categories match.</div>';
    // Categories inside a merged row are listed under it (unless the merged row itself is filtered out).
    var listed = {};
    list.forEach(function (c) { listed[c.id] = true; });
    return list.filter(function (c) { return !c.mergedInto || !listed[c.mergedInto]; }).map(function (c) { return rowHtml(c, false); }).join('');
  }
  function wireRows() {
    var type = el('rowType'); if (!type) return;
    type.value = S.filter;
    type.onchange = function () { S.filter = type.value; el('rowList').innerHTML = rowList(); wireRowButtons(); };
    el('rowStatus').value = S.status;
    el('rowStatus').onchange = function () { S.status = el('rowStatus').value; el('rowList').innerHTML = rowList(); wireRowButtons(); };
    el('sortRows').onchange = function () {
      var how = el('sortRows').value;
      if (!how) return;
      if (!confirm('Re-order all rows this way? Your current order will be replaced.')) { el('sortRows').value = ''; return; }
      var top = topRows().slice().sort(SORTS[how]);
      saveTopOrder(top);
    };
    el('pickAll').onclick = function () {
      S.picked = S.picked || {};
      visibleRows().forEach(function (c) { S.picked[c.id] = true; });
      el('rowList').innerHTML = rowList(); wireRowButtons();
    };
    var saveRules = function (apply) {
      return async function () {
        var words = el('hideRules').value.split(',').map(function (w) { return w.trim(); }).filter(Boolean);
        try {
          var r = await api('/api/library/settings', { method: 'POST', body: { hideRules: words, hideNew: el('hideNew').checked, apply: apply } });
          await load();
          say('msgRules', apply ? 'Saved. ' + n(r.hidden) + ' categories hidden.' : 'Saved.', true);
        } catch (e) { say('msgRules', e.message); }
      };
    };
    el('saveRules').onclick = saveRules(false);
    el('applyRules').onclick = saveRules(true);
    el('rowSearch').oninput = function () { S.q = el('rowSearch').value; el('rowList').innerHTML = rowList(); wireRowButtons(); };
    function bulk(hidden) {
      return async function () {
        var list = visibleRows();
        try {
          await api('/api/catalogs/bulk', { method: 'POST', body: { ids: list.map(function (c) { return c.id; }), is_hidden: hidden } });
          list.forEach(function (c) { c.hidden = hidden; });
          render();
        } catch (e) { say('msg', e.message); }
      };
    }
    el('mergeBtn').onclick = async function () {
      var ids = Object.keys(S.picked || {}).filter(function (k) { return S.picked[k]; }).map(Number);
      var rows = ids.map(find).filter(Boolean);
      var target = rows.filter(function (c) { return c.isMerge; })[0];
      if (rows.length < 2) return say('msg', 'Tick at least two categories first.');
      var name = target ? target.name : prompt('Name for the merged row:', rows.map(function (c) { return c.name; }).join(' + ').slice(0, 80));
      if (name === null) return;
      try { await api('/api/merges', { method: 'POST', body: { ids: ids, name: name } }); S.picked = {}; await load(); say('msg', 'Merged.', true); }
      catch (e) { say('msg', e.message); }
    };
    el('showAll').onclick = bulk(false);
    el('hideAll').onclick = bulk(true);
    wireRowButtons();
  }
  // Save a new top-level order. Categories inside merged rows keep following their merged row.
  async function saveTopOrder(top) {
    var inner = S.data.catalogs.filter(function (c) { return c.mergedInto; });
    S.data.catalogs = top.concat(inner);
    el('rowList').innerHTML = rowList(); wireRowButtons();
    try { await api('/api/catalog-order', { method: 'POST', body: { ids: S.data.catalogs.map(function (c) { return c.id; }) } }); }
    catch (e) { say('msg', e.message); load(); }
  }
  function topRows() { return S.data.catalogs.filter(function (c) { return !c.mergedInto; }); }
  var SORTS = {
    az: function (a, b) { return a.name.localeCompare(b.name); },
    za: function (a, b) { return b.name.localeCompare(a.name); },
    most: function (a, b) { return b.item_count - a.item_count; },
    fewest: function (a, b) { return a.item_count - b.item_count; },
    movie: function (a, b) { return (a.media_type === 'movie' ? 0 : 1) - (b.media_type === 'movie' ? 0 : 1); },
    series: function (a, b) { return (a.media_type === 'series' ? 0 : 1) - (b.media_type === 'series' ? 0 : 1); },
  };
  // Drag a row by its handle (mouse or touch). Rows you can't see because of a filter keep their places.
  function wireDrag() {
    document.querySelectorAll('[data-drag]').forEach(function (h) {
      h.onpointerdown = function (e) {
        e.preventDefault();
        var list = el('rowList');
        var group = h.closest('[data-group]');
        group.style.opacity = '0.6';
        h.style.cursor = 'grabbing';
        try { h.setPointerCapture(e.pointerId); } catch (x) {}
        var move = function (ev) {
          var groups = Array.prototype.slice.call(list.querySelectorAll(':scope > [data-group]'));
          var before = null;
          for (var k = 0; k < groups.length; k++) {
            if (groups[k] === group) continue;
            var r = groups[k].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) { before = groups[k]; break; }
          }
          if (before !== group.nextSibling) list.insertBefore(group, before);
        };
        var up = function () {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          h.removeEventListener('pointercancel', up);
          group.style.opacity = '';
          h.style.cursor = 'grab';
          var shown = Array.prototype.slice.call(list.querySelectorAll(':scope > [data-group]')).map(function (g) { return find(g.dataset.group); });
          var shownSet = {};
          shown.forEach(function (c) { shownSet[c.id] = true; });
          var k = 0;
          var top = topRows().map(function (c) { return shownSet[c.id] ? shown[k++] : c; });
          saveTopOrder(top);
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      };
    });
  }
  // Look inside a row: posters, years and whether TMDB matched them.
  async function openViewer(c, skip, q) {
    var v = el('viewer');
    v.innerHTML = '<div class="panel" style="margin:12px 0"><div class="row"><h3 style="margin:0">' + esc(c.name) + '</h3><button class="small" id="closeViewer" style="flex:0 0 auto">Close</button></div><div class="row" style="margin-top:10px"><input id="viewerSearch" placeholder="Find a title in this row…" value="' + esc(q || '') + '"></div><div id="viewerList" class="help" style="margin-top:10px">Loading…</div></div>';
    el('closeViewer').onclick = function () { v.innerHTML = ''; };
    var timer = null;
    el('viewerSearch').oninput = function () {
      clearTimeout(timer);
      timer = setTimeout(function () { openViewer(c, 0, el('viewerSearch').value.trim()); }, 400);
    };
    if (q) { var box = el('viewerSearch'); box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    if (v.scrollIntoView) v.scrollIntoView({ block: 'nearest' });
    try {
      var d = await api('/api/catalogs/' + c.id + '/titles?skip=' + skip + (q ? '&q=' + encodeURIComponent(q) : ''));
      var items = d.titles.map(function (t) {
        var img = t.tmdb_poster || t.poster_url;
        var status = t.imdb_id ? '<span style="color:var(--green)">Full metadata</span>' : t.tmdb_match_status === 'pending' ? 'Waiting for TMDB' : t.tmdb_match_status === 'skip' ? 'Episode' : 'Provider info only';
        return '<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">' +
          (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" style="width:40px;height:60px;object-fit:cover;border-radius:4px;background:var(--panel2)">' : '<div style="width:40px;height:60px;border-radius:4px;background:var(--panel2)"></div>') +
          '<div><div style="color:var(--text);font-weight:600">' + esc(t.title) + '</div><div>' + (t.year ? t.year + ' · ' : '') + status + '</div></div></div>';
      }).join('');
      el('viewerList').innerHTML = (items || '<div class="empty">Nothing here' + (q ? ' matches “' + esc(q) + '”' : '') + '.</div>') +
        '<div class="actions">' + (skip > 0 ? '<button class="small" id="viewerPrev">← Previous</button>' : '') + (d.more ? '<button class="small" id="viewerNext">Next 100 →</button>' : '') + '</div>';
      if (el('viewerPrev')) el('viewerPrev').onclick = function () { openViewer(c, Math.max(0, skip - 100), q); };
      if (el('viewerNext')) el('viewerNext').onclick = function () { openViewer(c, skip + 100, q); };
    } catch (e) { el('viewerList').textContent = e.message; }
  }
  function find(id) { return S.data.catalogs.filter(function (c) { return String(c.id) === String(id); })[0]; }
  // Changes are applied in the page directly, so the dashboard doesn't have to reload everything.
  function wireRowButtons() {
    wireDrag();
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = function () { openViewer(find(b.dataset.view), 0, ''); };
    });
    document.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onchange = function () { S.picked = S.picked || {}; S.picked[b.dataset.pick] = b.checked; };
    });
    document.querySelectorAll('[data-order]').forEach(function (b) {
      b.onclick = async function () {
        var c = find(b.dataset.order);
        var next = c.titleOrder === 'recent' ? 'az' : 'recent';
        try { await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { title_order: next } }); c.titleOrder = next; el('rowList').innerHTML = rowList(); wireRowButtons(); }
        catch (e) { say('msg', e.message); }
      };
    });
    document.querySelectorAll('[data-unmerge]').forEach(function (b) {
      b.onclick = async function () {
        var c = find(b.dataset.unmerge);
        if (c.isMerge && !confirm('Split “' + c.name + '” back into its categories?')) return;
        try { await api('/api/catalogs/' + c.id + '/unmerge', { method: 'POST', body: {} }); await load(); }
        catch (e) { say('msg', e.message); }
      };
    });
    document.querySelectorAll('[data-rename]').forEach(function (b) {
      b.onclick = async function () {
        var c = find(b.dataset.rename);
        var name = prompt('Row name (leave empty to use the provider’s name):', c.renamed ? c.name : '');
        if (name === null) return;
        try {
          await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { display_name: name } });
          c.name = name.trim() || c.source_category_name; c.renamed = !!name.trim();
          el('rowList').innerHTML = rowList(); wireRowButtons();
        } catch (e) { say('msg', e.message); }
      };
    });
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.onclick = async function () {
        var c = find(b.dataset.toggle);
        try { await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { is_hidden: !c.hidden } }); c.hidden = !c.hidden; el('rowList').innerHTML = rowList(); wireRowButtons(); }
        catch (e) { say('msg', e.message); }
      };
    });
    document.querySelectorAll('[data-move]').forEach(function (b) {
      b.onclick = async function () {
        var top = topRows();
        var i = top.indexOf(find(b.dataset.move));
        var dir = b.dataset.dir;
        if (dir === 'top' || dir === 'bottom') {
          var item = top.splice(i, 1)[0];
          if (dir === 'top') top.unshift(item); else top.push(item);
        } else {
          var j = i + Number(dir);
          if (j < 0 || j >= top.length) return;
          var t = top[i]; top[i] = top[j]; top[j] = t;
        }
        saveTopOrder(top);
      };
    });
  }

  // ---------- importing (owner) ----------
  async function matchAfter(r, show) {
    var note = r.withTmdb ? ' ' + n(r.withTmdb) + ' came with TMDB IDs from the provider.' : '';
    try {
      var m = await VODImport.match(function (t) { show(t, true); });
      if (m.skipped) return note + ' Add a TMDB key in Settings for full metadata.';
      return note + (m.total ? ' TMDB matched ' + n(m.matched) + ' of ' + n(m.total) + ' new titles.' : '');
    } catch (e) { return note + ' TMDB matching stopped: ' + e.message + ' (press “Match titles now” in Settings to continue)'; }
  }
  async function runImport(fileText, show) {
    var r = await VODImport.run(S.data.library.kind, function (t) { show(t, true); }, fileText);
    var extra = await matchAfter(r, show);
    await load();
    return 'Done: ' + n(r.total) + ' titles (' + n(r.added) + ' new, ' + n(r.changed) + ' updated, ' + n(r.removed) + ' removed).' + (r.skippedLive ? ' Skipped ' + n(r.skippedLive) + ' live channels.' : '') + extra;
  }
  function loginFields(kind, login) {
    login = login || {};
    return kind === 'xtream'
      ? field('Server URL', 'baseUrl', 'url', 'http://server.example:8080', login.baseUrl) + field('Username', 'username', 'text', '', login.username) + field('Password', 'password', 'password', login.username ? 'Re-enter to change' : '', '')
      : '<div class="wide">' + field('Playlist URL', 'playlistUrl', 'url', 'http://server.example:8080/get.php?username=…&password=…&type=m3u_plus', '', login.hasPlaylist ? 'Saved. Re-enter to change it.' : 'Your personal M3U link from the provider.') + '</div>';
  }
  var fileHelp = '<label>Use a playlist file (optional)</label><input type="file" id="m3uFile" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"><div class="help">Only if your provider blocks VODStack: open your playlist URL in a new tab so it downloads, then pick that file here.</div>';

  function setupPage() {
    return '<div class="page-head"><div><h2>Set up your provider</h2><div class="muted">You’ll own this library. Friends on the same provider can join it later with an invite link, so it only has to be imported once.</div></div></div>' +
      '<div class="panel"><form id="setupForm"><div class="formgrid"><div><label>Name</label><input name="name" placeholder="My IPTV" required></div><div><label>Connection type</label><select name="kind" id="kind"><option value="xtream">Xtream Codes</option><option value="m3u">M3U playlist</option></select></div><div class="wide formgrid" id="loginFields" style="padding:0">' + loginFields('xtream') + '</div><div class="wide" id="fileField" style="display:none">' + fileHelp + '</div>' +
      '<div class="wide">' + field('User-Agent (optional)', 'userAgent', 'text', 'Leave blank to use VLC’s', '', 'Only if your provider rejects requests (HTTP 401/403): try IPTVSmartersPro.') + '</div></div><div class="actions"><button class="primary" id="setupBtn" type="submit">Save and import</button></div><div id="msg"></div></form></div>';
  }
  function wireSetup() {
    var kind = el('kind');
    kind.onchange = function () { el('loginFields').innerHTML = loginFields(kind.value); el('fileField').style.display = kind.value === 'm3u' ? 'block' : 'none'; };
    el('setupForm').onsubmit = async function (e) {
      e.preventDefault();
      var body = Object.fromEntries(new FormData(el('setupForm')).entries());
      var btn = el('setupBtn'); btn.disabled = true;
      try {
        await api('/api/library', { method: 'POST', body: body });
        S.data = await api('/api/state');
        var file = el('m3uFile') && el('m3uFile').files[0];
        var text = await runImport(file ? await file.text() : undefined, function (t, ok) { say('msg', t, ok); });
        S.tab = 'rows'; render(); say('msg', text, true);
      } catch (err) { say('msg', err.message); btn.disabled = false; }
    };
  }

  function libraryPage() {
    var d = S.data, lib = d.library, st = lib.stats || {};
    return '<div class="page-head"><div><h2>' + esc(lib.name) + '</h2><div class="muted">' + (lib.kind === 'xtream' ? 'Xtream Codes' : 'M3U playlist') + ' · shared library you own</div></div></div>' +
      (d.relayConfigured ? '<div class="notice">Provider downloads go through your relay on Render.</div>' : '') +
      '<div class="cards"><div class="stat"><strong>' + n(st.total) + '</strong><span>Titles</span></div><div class="stat"><strong>' + n(st.withImdb) + '</strong><span>With full metadata</span></div><div class="stat"><strong>' + n(st.pending) + '</strong><span>Waiting for TMDB</span></div></div>' +
      '<div class="panel"><h3>Refresh</h3><p>Downloads the latest lists once and updates the library for everyone who joined. Only new or changed titles are saved.</p><div class="help">' + (lib.lastRefreshAt ? 'Last refresh: ' + esc(lib.lastRefreshAt) + ' UTC · ' : '') + esc(lib.status || 'Not imported yet') + '</div>' +
      '<div class="actions"><button class="primary" id="refreshBtn">Refresh now</button>' + (lib.kind === 'm3u' ? '<button id="fileRefreshBtn">Refresh from file</button><input type="file" id="refreshFile" style="display:none" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain">' : '') + '</div><div id="msg"></div></div>' +
      '<div class="panel"><h3>Invite friends</h3><p>Send this link to family on the same provider. They enter their own login on one page and get their own Nuvio link. They see your rows exactly as you set them up.</p>' +
      (d.inviteUrl ? '<div class="code" style="font-size:13px">' + esc(d.inviteUrl) + '</div><div class="actions"><button id="copyInvite">Copy</button><button id="newInvite">Make a new link</button></div><div class="help">Making a new link stops the old one from working. People who already joined keep working.</div>' : '<div class="actions"><button class="primary" id="newInvite">Create invite link</button></div>') + '<div id="msg3"></div></div>' +
      '<div class="panel"><h3>Your provider login</h3><p>Used for importing and for your own playback.</p><form id="loginForm"><input type="hidden" name="name" value="' + esc(lib.name) + '"><div class="formgrid">' + loginFields(lib.kind, d.login) + '</div><div class="actions"><button type="submit">Save login</button></div><div id="msg4"></div></form>' +
      '<hr class="divider"><label>User-Agent</label><div class="row"><input id="ua" placeholder="Default (VLC)" value="' + esc(d.login ? d.login.userAgent : '') + '"><button id="saveUa" style="flex:0 0 auto">Save</button></div></div>' +
      '<div class="panel"><h3>Delete library</h3><p>Removes all imported titles for you and everyone who joined.</p><button class="danger" id="deleteLib">Delete library</button></div>';
  }
  function wireLibrary() {
    var show = function (t, ok) { say('msg', t, ok); };
    el('refreshBtn').onclick = async function () {
      el('refreshBtn').disabled = true;
      try { var t = await runImport(undefined, show); S.tab = 'library'; render(); say('msg', t, true); }
      catch (e) { show(e.message); el('refreshBtn').disabled = false; }
    };
    if (el('fileRefreshBtn')) el('fileRefreshBtn').onclick = function () {
      var p = el('refreshFile'); p.value = '';
      p.onchange = async function () {
        if (!p.files[0]) return;
        try { show('Reading ' + p.files[0].name + '…', true); var t = await runImport(await p.files[0].text(), show); S.tab = 'library'; render(); say('msg', t, true); }
        catch (e) { show(e.message); }
      };
      p.click();
    };
    if (S.data.inviteUrl) copyButton('copyInvite', S.data.inviteUrl);
    el('newInvite').onclick = async function () {
      if (S.data.inviteUrl && !confirm('Make a new invite link? The current link will stop working.')) return;
      try { var r = await api('/api/library/invite', { method: 'POST', body: {} }); S.data.inviteUrl = r.inviteUrl; render(); }
      catch (e) { say('msg3', e.message); }
    };
    el('loginForm').onsubmit = async function (e) {
      e.preventDefault();
      try { await api('/api/library', { method: 'POST', body: Object.fromEntries(new FormData(el('loginForm')).entries()) }); say('msg4', 'Login saved.', true); }
      catch (err) { say('msg4', err.message); }
    };
    el('saveUa').onclick = async function () {
      try { await api('/api/login', { method: 'PATCH', body: { userAgent: el('ua').value } }); say('msg4', 'User-Agent saved.', true); }
      catch (e) { say('msg4', e.message); }
    };
    el('deleteLib').onclick = async function () {
      if (!confirm('Delete this library and all its titles, for you and everyone who joined?')) return;
      try { await api('/api/library', { method: 'DELETE' }); await load(); } catch (e) { alert(e.message); }
    };
  }

  // ---------- settings ----------
  function tmdbText(d) {
    if (!d.configured) return 'No TMDB key saved yet.';
    return 'Key saved. ' + n(d.matched) + ' titles matched (' + n(d.withImdb) + ' with full metadata in Nuvio), ' + n(d.pending) + ' waiting, ' + n(d.unmatched) + ' not found.';
  }
  function settingsPage() {
    var d = S.data;
    return '<div class="page-head"><div><h2>Settings</h2></div></div>' +
      '<div class="panel"><h3>Your Nuvio link</h3><p>In Nuvio, add this as an addon. It gives you the rows, search and playback. It’s personal: treat it like a password.</p>' +
      '<div class="code" style="font-size:13px">' + esc(d.addonUrl || '') + '</div><div class="actions"><button id="copyAddon">Copy</button></div><div class="help">After VODStack gets new features, remove the addon in Nuvio and add it again.</div><div id="msg2"></div></div>' +
      (d.role === 'owner' ? '<div class="panel"><h3>TMDB matching</h3><p>Links titles to their real TMDB/IMDb entries so Nuvio shows its normal posters, cast and descriptions. Runs automatically after each refresh, and matches are shared with everyone in the library.</p><form id="tmdbForm"><label>TMDB API key (v3)</label><input id="tmdbKey" type="password" placeholder="' + (d.tmdbConfigured ? 'Saved (paste a new key to replace it)' : 'Paste your TMDB v3 API key') + '" autocomplete="new-password"><div class="actions"><button class="primary" type="submit">Save key</button><button type="button" id="runMatch">Match titles now</button><button type="button" id="retryMatch">Retry not-found titles</button></div><div class="help" id="tmdbStatus">…</div><div id="tmdbMsg"></div></form><div class="help" style="margin-top:8px">Get a free key at <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">TMDB API settings</a>.</div></div>' : '') +
      '<div class="panel"><h3>Recovery code</h3><p>Your way back into this setup from another device. Making a new one stops the old one working.</p><button id="rotate" class="danger">Make a new recovery code</button><div id="newCode"></div></div>';
  }
  function wireSettings() {
    copyButton('copyAddon', S.data.addonUrl || '');
    el('rotate').onclick = async function () {
      if (!confirm('Make a new recovery code? The current one will stop working.')) return;
      try { var r = await api('/api/recovery-code/rotate', { method: 'POST', body: {} }); S.recovery = r.recoveryCode; render(); } catch (e) { alert(e.message); }
    };
    if (S.data.role !== 'owner') return;
    var status = el('tmdbStatus');
    var refresh = function () { api('/api/tmdb/status').then(function (d) { status.textContent = tmdbText(d); }).catch(function () { status.textContent = ''; }); };
    refresh();
    var out = function (t, ok) { say('tmdbMsg', t, ok); };
    el('tmdbForm').onsubmit = async function (e) {
      e.preventDefault();
      try { await api('/api/tmdb/key', { method: 'POST', body: { apiKey: el('tmdbKey').value.trim() } }); el('tmdbKey').value = ''; out('Key saved. Press “Match titles now” to match what’s already imported.', true); refresh(); }
      catch (err) { out(err.message); }
    };
    el('runMatch').onclick = async function () {
      el('runMatch').disabled = true;
      try { var m = await VODImport.match(function (t) { out(t, true); }); out(m.skipped ? 'Save a TMDB key first.' : 'Done: ' + n(m.matched) + ' of ' + n(m.total) + ' titles matched.', !m.skipped); }
      catch (err) { out(err.message); }
      finally { el('runMatch').disabled = false; refresh(); }
    };
    el('retryMatch').onclick = async function () {
      try { var r = await api('/api/tmdb/retry', { method: 'POST', body: {} }); out(n(r.reset) + ' titles queued again. Press “Match titles now”.', true); refresh(); }
      catch (err) { out(err.message); }
    };
  }

  load();
})();
`;

export function dashboard() {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VODStack</title><style>' +
    CSS +
    '</style></head><body><div class="app"><header class="top"><div class="brand"><div class="logo">VS</div><div><div class="eyebrow">VODSTACK · IPTV TOOLS</div><h1 class="title">VODStack</h1></div></div><div id="topAction"></div></header><main id="root"><div class="empty">Loading…</div></main></div><script>' +
    CLIENT_IMPORT_JS +
    '</script><script>' +
    PAGE_JS +
    '</script></body></html>'
  );
}
