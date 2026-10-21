// The VODStack web page: one HTML document with inline styles and scripts.
// PAGE_JS lives inside String.raw, so it must not contain backticks or dollar-brace.
import { CLIENT_IMPORT_JS } from './client-import';

const CSS = String.raw`
:root{
  color-scheme:dark;
  --ink:#0d191d; --deck:#12232a; --raised:#1a2f37; --well:#0a1417; --rule:#25404a; --rule-soft:#1c333b;
  --paper:#e9efec; --fog:#91a7aa; --dim:#6b8286;
  --brass:#e8b24c; --brass-soft:rgba(232,178,76,.14); --brass-ink:#241904;
  --red:#ec6a52; --red-soft:rgba(236,106,82,.12); --mint:#7fd6a3;
  --display:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;
  --ui:'Instrument Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --r-s:6px; --r-m:10px; --r-l:16px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ink);color:var(--paper);font:15px/1.55 var(--ui);font-feature-settings:"ss01","cv11"}
a{color:var(--brass)}
::selection{background:var(--brass);color:var(--brass-ink)}
:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
h1,h2,h3{font-family:var(--display);font-weight:700;letter-spacing:-.02em;margin:0;line-height:1.15}
h1{font-size:30px}
h2{font-size:20px}
h3{font-size:16px;letter-spacing:-.01em}
p{margin:6px 0 0;color:var(--fog);max-width:68ch}
code{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--paper);background:var(--well);padding:1px 6px;border-radius:4px}

/* controls */
button,input,select,textarea{font:inherit;color:inherit}
.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);background:var(--raised);color:var(--paper);padding:9px 14px;border-radius:var(--r-m);font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.btn:hover{border-color:#36575f;background:#20383f}
.btn:disabled{opacity:.5;cursor:progress}
.btn.primary{background:var(--brass);border-color:var(--brass);color:var(--brass-ink)}
.btn.primary:hover{background:#f2c062}
.btn.ghost{background:transparent;border-color:transparent;color:var(--fog)}
.btn.ghost:hover{color:var(--paper);background:var(--raised)}
.btn.danger{color:var(--red);background:transparent;border-color:rgba(236,106,82,.4)}
.btn.danger:hover{background:var(--red-soft)}
.btn.sm{padding:6px 10px;font-size:13px;border-radius:var(--r-s)}
.icon-btn{display:inline-grid;place-items:center;width:32px;height:32px;border:1px solid transparent;background:transparent;color:var(--fog);border-radius:var(--r-s);cursor:pointer}
.icon-btn:hover{background:var(--raised);color:var(--paper)}
input,select,textarea{width:100%;background:var(--well);border:1px solid var(--rule);border-radius:var(--r-m);padding:10px 12px;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--brass)}
input[type=checkbox]{width:16px;height:16px;padding:0;accent-color:var(--brass);flex:0 0 auto;cursor:pointer}
input[type=file]{padding:8px}
select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--fog) 50%),linear-gradient(135deg,var(--fog) 50%,transparent 50%);background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
select.compact{width:auto;padding:6px 28px 6px 10px;font-size:13px;border-radius:var(--r-s);background-color:var(--raised);background-position:calc(100% - 13px) 52%,calc(100% - 8px) 52%}
label{display:block;color:var(--fog);font-size:13px;font-weight:500;margin:14px 0 6px}
.check{display:flex;gap:10px;align-items:flex-start;color:var(--paper);font-size:15px;font-weight:500;margin:14px 0 0;cursor:pointer}
.check input{margin-top:3px}
.help{font-size:13px;color:var(--dim);margin-top:5px;max-width:70ch}
.check+.help{margin-left:26px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.fields .wide{grid-column:1/-1}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px}
.success,.error{font-size:14px;margin-top:10px}
.success{color:var(--mint)}
.error{color:var(--red)}
.success:empty,.error:empty{display:none}

/* app shell */
.top{position:sticky;top:0;z-index:20;background:rgba(13,25,29,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--rule-soft)}
.top-in{max-width:1120px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:28px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--paper);flex:0 0 auto}
.brand svg{display:block}
.wordmark{font-family:var(--display);font-weight:800;font-size:21px;letter-spacing:-.035em}
.tabs{display:flex;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{border:0;background:transparent;color:var(--fog);padding:8px 12px;border-radius:var(--r-s);font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;position:relative}
.tab:hover{color:var(--paper)}
.tab.active{color:var(--paper)}
.tab.active::after{content:"";position:absolute;left:12px;right:12px;bottom:-13px;height:2px;border-radius:2px;background:var(--brass)}
.who{display:flex;align-items:center;gap:12px;flex:0 0 auto;color:var(--fog);font-size:13px}
.who strong{color:var(--paper);font-weight:600}
main{max-width:1120px;margin:0 auto;padding:32px 24px 120px}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.summary{display:flex;gap:18px;flex-wrap:wrap;color:var(--fog);font-size:14px;margin-top:8px}
.summary b{color:var(--paper);font-weight:600;font-variant-numeric:tabular-nums}

/* sections */
.section{background:var(--deck);border:1px solid var(--rule-soft);border-radius:var(--r-l);padding:22px 24px;margin-bottom:16px}
.section>h2+p,.section>h3+p{margin-top:4px}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.split .section{margin-bottom:0}
.kv{display:flex;gap:28px;flex-wrap:wrap;margin-top:14px}
.kv div{font-size:13px;color:var(--fog)}
.kv b{display:block;font-family:var(--display);font-size:24px;letter-spacing:-.02em;color:var(--paper);font-variant-numeric:tabular-nums}
.callout{border:1px solid rgba(232,178,76,.35);background:var(--brass-soft);border-radius:var(--r-m);padding:14px 16px;margin-bottom:16px;color:var(--paper)}
.callout p{color:var(--paper);opacity:.85}
.secret{display:flex;gap:8px;align-items:stretch;margin-top:12px}
.secret code{flex:1;min-width:0;display:block;padding:10px 12px;border:1px solid var(--rule);border-radius:var(--r-m);overflow-wrap:anywhere;font-size:13px;line-height:1.45}
.secret.big code{font-size:17px;letter-spacing:.04em}
.rule{border:0;border-top:1px solid var(--rule-soft);margin:22px 0}

/* rows */
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.toolbar .search{flex:1;min-width:220px;position:relative}
.toolbar .search input{padding-left:36px}
.toolbar .search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--dim)}
.toolbar select{width:auto}
.list{border:1px solid var(--rule-soft);border-radius:var(--r-l);background:var(--deck);overflow:hidden}
.item{position:relative;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px 12px 18px;border-top:1px solid var(--rule-soft)}
[data-group]:first-child>.item{border-top:0}
.item::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--brass)}
.item[data-state=row]::before{background:transparent;box-shadow:inset 0 0 0 1px var(--fog)}
.item[data-state=all]::before{background:var(--red)}
.item[data-state=empty]::before,.item[data-state=off]::before{background:var(--rule)}
.item[data-state=inside]::before{display:none}
.item[data-state=row] .name,.item[data-state=all] .name,.item[data-state=empty] .name{color:var(--fog)}
.item.inner{padding-left:58px;background:var(--well)}
.item:hover{background:rgba(255,255,255,.015)}
.grip{display:grid;place-items:center;width:20px;height:28px;color:var(--dim);cursor:grab;touch-action:none;user-select:none;border-radius:4px}
.grip:hover{color:var(--paper);background:var(--raised)}
.dragging{opacity:.55}
.name-line{display:flex;align-items:center;gap:8px;min-width:0}
.name{font-family:var(--display);font-weight:600;font-size:16px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.caret{border:0;background:transparent;color:var(--brass);cursor:pointer;padding:2px;display:grid;place-items:center;transition:transform .15s}
.caret[aria-expanded=true]{transform:rotate(90deg)}
.tag{display:inline-block;font-size:11.5px;font-weight:600;line-height:1;padding:4px 7px;border-radius:999px;background:var(--raised);color:var(--fog);white-space:nowrap}
.tag.smart{background:var(--brass-soft);color:var(--brass)}
.tag.new{background:rgba(127,214,163,.13);color:var(--mint)}
.meta{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px;color:var(--dim);margin-top:3px}
.meta .state-all{color:var(--red)}
.ctl{display:flex;gap:6px;align-items:center;justify-content:flex-end}
.rename{display:flex;gap:6px;align-items:center}
.rename input{padding:7px 10px}
.empty{padding:48px 20px;text-align:center;color:var(--fog)}
.empty strong{display:block;color:var(--paper);font-family:var(--display);font-size:18px;margin-bottom:4px}

/* menus */
.menu{position:relative}
.menu>summary{list-style:none}
.menu>summary::-webkit-details-marker{display:none}
.menu-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:15;min-width:210px;background:var(--raised);border:1px solid var(--rule);border-radius:var(--r-m);padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.45)}
.menu-pop button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--paper);padding:8px 10px;border-radius:var(--r-s);font-size:14px;cursor:pointer}
.menu-pop button:hover{background:#244049}
.menu-pop button.warn{color:var(--red)}
.menu-pop hr{border:0;border-top:1px solid var(--rule);margin:5px 4px}
.menu-pop label{margin:6px 6px 4px}
.menu-pop select{margin:0 0 6px}
.menu.wide .menu-pop{min-width:270px;padding:8px 10px}

/* selection bar */
.pickbar{position:sticky;bottom:18px;z-index:12;margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--raised);border:1px solid rgba(232,178,76,.5);border-radius:var(--r-l);padding:10px 12px 10px 16px;box-shadow:0 18px 50px rgba(0,0,0,.5);animation:rise .18s ease-out}
.pickbar strong{font-family:var(--display);font-size:16px}
.pickbar .grow{flex:1}
.pickbar input{width:260px;max-width:100%;padding:8px 10px}
@keyframes rise{from{transform:translateY(10px);opacity:0}}

/* drawer */
.scrim{position:fixed;inset:0;z-index:30;background:rgba(4,10,12,.55)}
.drawer{position:fixed;top:0;right:0;bottom:0;z-index:31;width:min(460px,100%);background:var(--deck);border-left:1px solid var(--rule);display:flex;flex-direction:column;animation:slide .2s ease-out}
@keyframes slide{from{transform:translateX(24px);opacity:.4}}
.drawer-head{display:flex;gap:10px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--rule-soft)}
.drawer-head h2{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drawer-body{padding:14px 20px 24px;overflow:auto;flex:1}
.title{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rule-soft)}
.poster{width:44px;height:66px;border-radius:5px;object-fit:cover;background:var(--raised);display:block}
.title b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.title small{color:var(--dim);font-size:12.5px}
.title small.ok{color:var(--mint)}
.posters{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.posters figure{margin:0;width:78px}
.posters img,.posters .ph{width:78px;height:117px;border-radius:6px;object-fit:cover;background:var(--raised);display:block}
.posters figcaption{font-size:11.5px;color:var(--fog);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}

/* builder */
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{position:relative}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip span{display:inline-block;padding:6px 11px;border-radius:999px;border:1px solid var(--rule);font-size:13px;color:var(--fog);cursor:pointer;user-select:none}
.chip input:checked+span{background:var(--brass-soft);border-color:rgba(232,178,76,.6);color:var(--brass)}
.chip input:focus-visible+span{outline:2px solid var(--brass);outline-offset:2px}

/* signed-out / family pages */
.solo{max-width:520px;margin:0 auto;padding:56px 22px 80px}
.solo .mark{display:flex;align-items:center;gap:12px;margin-bottom:34px}
.solo .mark .wordmark{font-size:28px}
.solo h1{font-size:34px;letter-spacing:-.03em}
.solo .section{margin-top:22px}
.lede{font-size:17px;color:var(--fog);margin-top:10px}
.or{display:flex;align-items:center;gap:12px;color:var(--dim);font-size:13px;margin:26px 0 4px}
.or::before,.or::after{content:"";flex:1;border-top:1px solid var(--rule-soft)}
.inline{display:flex;gap:8px}
.inline input{flex:1;min-width:0}

@media (max-width:820px){
  .top-in{gap:14px;padding:0 14px;height:auto;flex-wrap:wrap;padding-top:10px}
  .tabs{order:3;flex-basis:100%;margin:0 -6px;padding-bottom:6px}
  .tab.active::after{bottom:-1px}
  .who{margin-left:auto}
  .who span{display:none}
  main{padding:22px 14px 120px}
  .split{grid-template-columns:1fr}
  .fields{grid-template-columns:1fr}
  .item{grid-template-columns:auto auto minmax(0,1fr);padding-right:10px}
  .ctl{grid-column:3/-1;justify-content:flex-start;flex-wrap:wrap}
  .item.inner{padding-left:40px}
  .section{padding:18px 16px}
  h1{font-size:26px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}

`;

const PAGE_JS = String.raw`(function () {
  var app = document.getElementById('app');
  var S = { tab: 'rows', data: null, filter: 'all', status: 'all', q: '', recovery: null, picked: {}, open: {} };
  var invite = new URLSearchParams(location.search).get('invite');

  // ---------- helpers ----------
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function say(id, text, ok) { var e = el(id); if (e) { e.className = ok ? 'success' : 'error'; e.textContent = text; } }
  function n(v) { return Number(v || 0).toLocaleString(); }
  function plural(v, one, many) { return n(v) + ' ' + (Number(v) === 1 ? one : many); }
  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var r = await fetch(path, init);
    var d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || 'Something went wrong (HTTP ' + r.status + ').');
    return d;
  }
  function field(label, name, type, placeholder, value, help, wide) {
    return '<div' + (wide ? ' class="wide"' : '') + '><label for="f-' + name + '">' + label + '</label><input id="f-' + name + '" name="' + name + '" type="' + (type || 'text') + '" placeholder="' + esc(placeholder || '') + '" value="' + esc(value || '') + '" autocomplete="off">' + (help ? '<div class="help">' + help + '</div>' : '') + '</div>';
  }
  function copyButton(id, text) {
    var b = el(id);
    if (b) b.onclick = function () { navigator.clipboard.writeText(text).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); }); };
  }
  function secret(text, copyId, big) {
    return '<div class="secret' + (big ? ' big' : '') + '"><code>' + esc(text) + '</code><button class="btn" id="' + copyId + '" type="button">Copy</button></div>';
  }
  var ICONS = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    grip: '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/></svg>',
    more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    caret: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };
  // The VODStack mark: three stacked rows, the top one carrying a play symbol.
  function logo(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 32 32" role="img" aria-label="VODStack"><rect x="2" y="3" width="28" height="10" rx="3" fill="#e8b24c"/><path d="M13.6 5.4v5.2l4.6-2.6z" fill="#0d191d"/><rect x="4.5" y="15.5" width="23" height="6" rx="2.4" fill="#e8b24c" fill-opacity=".62"/><rect x="7" y="24" width="18" height="5" rx="2" fill="#e8b24c" fill-opacity=".32"/></svg>';
  }
  function mark() { return '<div class="mark">' + logo(36) + '<span class="wordmark">VODStack</span></div>'; }

  // Close any open ⋯ menu when clicking elsewhere.
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  async function load() {
    try { S.data = await api('/api/state'); render(); sortBackfill(); }
    catch (e) { S.data = null; welcome(); }
  }
  // One-time, in the background: give older titles their clean A–Z sort names.
  var sorting = false;
  async function sortBackfill() {
    var lib = S.data && S.data.library;
    if (sorting || S.data.role !== 'owner' || !lib || lib.sortReady) return;
    sorting = true;
    try {
      for (var i = 0; i < 200; i++) {
        var r = await api('/api/library/sort-backfill', { method: 'POST', body: {} });
        if (r.done) { lib.sortReady = true; break; }
      }
    } catch (e) {} finally { sorting = false; }
  }

  // ---------- signed out ----------
  function recoverBlock(label) {
    return '<div class="or">' + label + '</div><label for="recoverCode">Recovery code</label><div class="inline"><input id="recoverCode" placeholder="VOD-XXXXXX-XXXXXX-XXXXXX-XXXXXX" autocomplete="off"><button class="btn" id="recoverBtn" type="button">Sign in</button></div>';
  }
  function welcome() {
    if (invite) {
      app.innerHTML = '<div class="solo">' + mark() + '<h1 id="invTitle">Checking your invite…</h1><p class="lede" id="invText"></p>' +
        '<form id="joinForm" class="section" style="display:none"><h2>Your login</h2><div class="fields" id="joinFields"></div><div class="actions"><button class="btn primary" id="joinBtn" type="submit">Get my Nuvio link</button></div><div id="msg"></div></form>' +
        recoverBlock('Already joined on another device?') + '</div>';
      api('/api/invite?code=' + encodeURIComponent(invite)).then(function (d) {
        el('invTitle').textContent = 'Watch ' + d.name + ' in Nuvio';
        el('invText').textContent = 'Enter the ' + (d.kind === 'xtream' ? 'Xtream Codes login' : 'M3U playlist link') + ' you got for ' + d.name + '. You’ll get a personal link to add to Nuvio.';
        el('joinFields').innerHTML = loginFields(d.kind);
        el('joinForm').style.display = 'block';
      }).catch(function (e) { el('invTitle').textContent = 'This invite link has expired'; el('invText').textContent = e.message; });
      el('joinForm').onsubmit = async function (e) {
        e.preventDefault();
        el('joinBtn').disabled = true;
        say('msg', 'Checking your login with the provider…', true);
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
      app.innerHTML = '<div class="solo">' + mark() + '<h1>Your provider’s movies and shows, arranged for Nuvio.</h1><p class="lede">Import an IPTV library once, shape it into rows, and share it with family. Everyone signs in with their own login.</p>' +
        '<div class="section"><h2>New here?</h2><p>Set up your provider and you’ll get a recovery code to come back with.</p><div class="actions"><button class="btn primary" id="newBtn" type="button">Start a new setup</button></div></div>' +
        recoverBlock('Coming back?') + '<div id="msg"></div><p class="help" style="margin-top:22px">Joining someone’s library? Open the invite link they sent you.</p></div>';
      el('newBtn').onclick = async function () {
        try { var d = await api('/api/setup', { method: 'POST', body: {} }); S.recovery = d.recoveryCode; await load(); } catch (e) { say('msg', e.message); }
      };
    }
    var go = async function () {
      try {
        var code = el('recoverCode').value.trim();
        if (!code) throw new Error('Enter your recovery code.');
        await api('/api/recover', { method: 'POST', body: { code: code } });
        history.replaceState(null, '', location.pathname); invite = null;
        await load();
      } catch (e) { say('msg', e.message); }
    };
    el('recoverBtn').onclick = go;
    el('recoverCode').onkeydown = function (e) { if (e.key === 'Enter') go(); };
  }

  function joined(d) {
    app.innerHTML = '<div class="solo">' + mark() + '<h1>You’re all set</h1><p class="lede">Add your link to Nuvio and the rows appear on your home screen.</p>' +
      '<div class="section"><h2>Your Nuvio link</h2><p>In Nuvio, add this as an addon. It’s personal to you; don’t share it.</p>' + secret(d.addonUrl, 'copyAddon') + '</div>' +
      '<div class="section"><h2>Your recovery code</h2><p>Keep it somewhere safe. You only need it to come back and change your login.</p>' + secret(d.recoveryCode, 'copyRecovery', true) + '</div>' +
      '<div class="actions"><button class="btn primary" id="doneBtn" type="button">Done</button></div></div>';
    copyButton('copyAddon', d.addonUrl);
    copyButton('copyRecovery', d.recoveryCode);
    el('doneBtn').onclick = function () { load(); };
  }

  // ---------- family member: one simple page ----------
  function memberView() {
    var d = S.data;
    app.innerHTML = '<div class="solo"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px">' + mark() + '<button class="btn ghost" id="logout" type="button">Sign out</button></div>' +
      (S.recovery ? '<div class="callout"><strong>Your new recovery code</strong>' + secret(S.recovery, 'copyRecovery', true) + '</div>' : '') +
      '<h1>' + esc(d.library.name) + '</h1><p class="lede">Your personal link and login for watching in Nuvio.</p>' +
      (d.login ? '' : '<div class="callout" style="margin-top:18px">Save your login below first, or nothing will play.</div>') +
      '<div class="section"><h2>Your Nuvio link</h2><p>Add this to Nuvio as an addon. It’s personal; don’t share it.</p>' + secret(d.addonUrl || '', 'copyAddon') + '</div>' +
      '<form class="section" id="memberLogin"><h2>Your login</h2><p>Used only when you press play, so it’s your own account and connection limit.</p><div class="fields">' + loginFields(d.library.kind, d.login) + '</div><div class="actions"><button class="btn" id="saveLogin" type="submit">Update login</button></div><div id="msg"></div></form>' +
      '<div class="section"><h2>Recovery code</h2><p>Your way back to this page from another device.</p><div class="actions"><button class="btn danger" id="rotate" type="button">Make a new recovery code</button></div></div></div>';
    el('logout').onclick = logout;
    if (S.recovery) copyButton('copyRecovery', S.recovery);
    copyButton('copyAddon', d.addonUrl || '');
    el('memberLogin').onsubmit = async function (e) {
      e.preventDefault();
      el('saveLogin').disabled = true;
      say('msg', 'Checking your login with the provider…', true);
      try { await api('/api/login', { method: 'POST', body: Object.fromEntries(new FormData(el('memberLogin')).entries()) }); await load(); say('msg', 'Login updated.', true); }
      catch (err) { say('msg', err.message); el('saveLogin').disabled = false; }
    };
    el('rotate').onclick = rotateRecovery;
  }
  async function logout() { await api('/api/logout', { method: 'POST', body: {} }); S.data = null; welcome(); }
  async function rotateRecovery() {
    if (!confirm('Make a new recovery code? The current one will stop working.')) return;
    try { var r = await api('/api/recovery-code/rotate', { method: 'POST', body: {} }); S.recovery = r.recoveryCode; render(); window.scrollTo(0, 0); } catch (e) { alert(e.message); }
  }

  // ---------- signed in (owner / new) ----------
  var TABS = { owner: [['rows', 'Rows'], ['smart', 'Smart rows'], ['filters', 'Filters'], ['library', 'Library'], ['settings', 'Settings']], new: [['setup', 'Set up provider'], ['settings', 'Settings']] };
  function render() {
    var d = S.data;
    if (d.role === 'member') return memberView();
    var tabs = TABS[d.role] || TABS.new;
    if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];
    var banner = S.recovery ? '<div class="callout"><strong>Save your recovery code now.</strong><p>It’s the only way back into this setup from another device, and it’s shown once.</p>' + secret(S.recovery, 'copyRecovery', true) + '<div class="actions"><button class="btn sm" id="dismissRecovery" type="button">I’ve saved it</button></div></div>' : '';
    var pages = { rows: rowsPage, smart: smartPage, filters: filtersPage, library: libraryPage, settings: settingsPage, setup: setupPage };
    app.innerHTML = '<header class="top"><div class="top-in"><a class="brand" href="/" aria-label="VODStack home">' + logo(30) + '<span class="wordmark">VODStack</span></a>' +
      '<nav class="tabs" aria-label="Sections">' + tabs.map(function (t) { return '<button class="tab' + (S.tab === t[0] ? ' active' : '') + '" data-tab="' + t[0] + '" type="button"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</button>'; }).join('') + '</nav>' +
      '<div class="who">' + (d.library ? '<span><strong>' + esc(d.library.name) + '</strong></span>' : '') + '<button class="btn ghost sm" id="logout" type="button">Sign out</button></div></div></header>' +
      '<main>' + banner + pages[S.tab]() + '</main>';
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }; });
    el('logout').onclick = logout;
    if (S.recovery) { copyButton('copyRecovery', S.recovery); el('dismissRecovery').onclick = function () { S.recovery = null; render(); }; }
    ({ rows: wireRows, smart: wireSmart, filters: wireFilters, library: wireLibrary, setup: wireSetup, settings: wireSettings })[S.tab]();
  }

  // ---------- row helpers ----------
  function onlyMatched() {
    var lib = S.data.library;
    return !!(lib && lib.settings && lib.settings.onlyMatched !== false && lib.stats && lib.stats.withImdb > 0);
  }
  function filtering() {
    var st = (S.data.library && S.data.library.settings) || {};
    return onlyMatched() || st.englishOriginal || st.englishCopy;
  }
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
    smart: function (c) { return !!c.smart; },
    new: isNew,
    empty: function (c) { return !c.item_count; },
  };
  function find(id) { return S.data.catalogs.filter(function (c) { return String(c.id) === String(id); })[0]; }
  function topRows() { return S.data.catalogs.filter(function (c) { return !c.mergedInto; }); }
  function visibleRows() {
    var q = S.q.toLowerCase();
    return S.data.catalogs.filter(function (c) {
      return (S.filter === 'all' || c.media_type === S.filter) && STATUS[S.status](c) &&
        (!q || c.name.toLowerCase().indexOf(q) >= 0 || c.source_category_name.toLowerCase().indexOf(q) >= 0);
    });
  }
  function ago(t) {
    if (!t) return 'Not built yet';
    var m = Math.round((Date.now() / 1000 - t) / 60);
    return m < 60 ? 'Updated ' + m + ' min ago' : 'Updated ' + Math.round(m / 60) + ' h ago';
  }
  function stateOf(c) {
    if (c.mergedInto) return 'inside';
    if (!c.item_count) return 'empty';
    if (c.hideMode === 'all') return 'all';
    if (c.hideMode === 'row') return 'row';
    if (filtering() && !c.visibleCount) return 'off';
    return 'shown';
  }
  var ORDERS = [['az', 'A–Z'], ['recent', 'Newest first'], ['shuffle', 'Shuffle every 4 h']];
  var HIDES = [['none', 'Shown'], ['row', 'Hide row'], ['all', 'Hide everywhere']];
  function options(list, value) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (value === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }

  function rowHtml(c, opts) {
    opts = opts || {};
    var inner = !!c.mergedInto && !opts.flat;
    var parent = c.mergedInto ? find(c.mergedInto) : null;
    var members = c.isMerge ? S.data.catalogs.filter(function (m) { return m.mergedInto === c.id; }) : [];
    var open = !!S.open[c.id];
    var state = opts.flat && c.mergedInto ? 'inside' : stateOf(c);
    var tags = '<span class="tag">' + (c.media_type === 'movie' ? 'Movies' : 'Series') + '</span>' +
      (c.isMerge ? '<span class="tag">' + plural(members.length, 'category', 'categories') + '</span>' : '') +
      (c.smart ? '<span class="tag smart">Smart</span>' : '') + (isNew(c) ? '<span class="tag new">New</span>' : '');
    var stateText = { inside: parent ? 'Inside “' + esc(parent.name) + '”' : '', empty: 'Empty', all: '<span class="state-all">Hidden everywhere</span>', row: 'Row hidden, still in search', off: 'Nothing passes your filters', shown: '' }[state];
    var meta = '<span>' + plural(c.item_count, 'title', 'titles') + '</span>' +
      (!c.smart && filtering() && state !== 'inside' ? '<span>' + n(c.visibleCount) + ' in Nuvio</span>' : '') +
      (c.smart ? '<span>' + ago(c.smart.at) + '</span>' : '') +
      (c.renamed && !c.isMerge && !c.smart ? '<span>Provider name: ' + esc(c.source_category_name) + '</span>' : '') +
      (stateText ? '<span>' + stateText + '</span>' : '');
    var nameLine = S.renaming === c.id
      ? '<div class="rename"><input id="renameBox" value="' + esc(c.renamed || c.smart || c.isMerge ? c.name : '') + '" placeholder="' + esc(c.source_category_name) + '" maxlength="150" aria-label="Row name"><button class="btn primary sm" id="renameSave" type="button">Save</button><button class="btn ghost sm" id="renameCancel" type="button">Cancel</button></div><div class="help">' + (c.smart || c.isMerge ? 'Enter a name for this row.' : 'Leave empty to use the provider’s name.') + ' Enter saves, Esc cancels.</div>'
      : '<div class="name-line">' + (members.length && !opts.flat ? '<button class="caret" data-expand="' + c.id + '" type="button" aria-expanded="' + open + '" aria-label="' + (open ? 'Collapse' : 'Show the categories in this row') + '">' + ICONS.caret + '</button>' : '') + '<span class="name catalog-title">' + esc(c.name) + '</span>' + tags + '</div>';
    var menu = '<details class="menu"><summary class="icon-btn" aria-label="More actions for ' + esc(c.name) + '">' + ICONS.more + '</summary><div class="menu-pop">' +
      '<button data-view="' + c.id + '" type="button">View titles</button>' +
      (inner ? '<button data-unmerge="' + c.id + '" type="button">Remove from merged row</button>'
        : '<button data-rename="' + c.id + '" type="button">Rename</button>' +
          (opts.noMove ? '' : '<button data-move="' + c.id + '" data-dir="top" type="button">Move to top</button><button data-move="' + c.id + '" data-dir="bottom" type="button">Move to bottom</button>') +
          (c.isMerge ? '<hr><button data-unmerge="' + c.id + '" type="button">Unmerge</button>' : '') +
          (c.smart ? '<hr>' + (c.smart.list === 'custom' ? '<button data-smart-edit="' + c.id + '" type="button">Edit settings</button>' : '') + '<button data-smart-refresh="' + c.id + '" type="button">Refresh from TMDB</button><button class="warn" data-smart-delete="' + c.id + '" type="button">Delete smart row</button>' : '')) +
      '</div></details>';
    var ctl = inner ? menu
      : '<select class="compact" data-hide="' + c.id + '" aria-label="Where this row appears">' + options(HIDES, c.hideMode) + '</select>' +
        (c.smart ? '' : '<select class="compact" data-order="' + c.id + '" aria-label="Title order in this row">' + options(ORDERS, c.titleOrder) + '</select>') + menu;
    var grip = opts.noMove || inner ? '<span class="grip" aria-hidden="true" style="visibility:hidden"></span>' : '<span class="grip" data-drag="' + c.id + '" title="Drag to reorder" aria-hidden="true">' + ICONS.grip + '</span>';
    var pick = c.smart ? '<span style="width:16px"></span>' : '<input type="checkbox" data-pick="' + c.id + '" aria-label="Select ' + esc(c.name) + '"' + (S.picked[c.id] ? ' checked' : '') + '>';
    var row = '<div class="item catalog' + (inner ? ' inner' : '') + '" data-state="' + state + '">' + grip + pick + '<div style="min-width:0">' + nameLine + '<div class="meta">' + meta + '</div></div><div class="ctl">' + ctl + '</div></div>';
    if (inner) return row;
    return '<div data-group="' + c.id + '">' + row + (open && !opts.flat ? members.map(function (m) { return rowHtml(m); }).join('') : '') + '</div>';
  }
  function rowList() {
    var list = visibleRows();
    if (!list.length) return '<div class="empty"><strong>No rows match</strong>Try a different search or filter.</div>';
    // Categories inside a merged row never get their own line; their merged row is listed instead.
    var out = [], seen = {};
    list.forEach(function (c) {
      var row = c.mergedInto ? find(c.mergedInto) : c;
      if (!row || seen[row.id]) return;
      seen[row.id] = true;
      out.push(row);
    });
    return out.map(function (c) { return rowHtml(c); }).join('');
  }
  function smartList() {
    var list = S.data.catalogs.filter(function (c) { return c.smart; });
    if (!list.length) return '<div class="empty"><strong>No smart rows yet</strong>Add one above, or start with the starter set.</div>';
    return list.map(function (c) { return rowHtml(c, { noMove: true }); }).join('');
  }
  // Re-draw just the list on the current page (keeps scroll position and inputs).
  function redraw() {
    if (el('rowList')) el('rowList').innerHTML = rowList();
    if (el('smartRowsList')) el('smartRowsList').innerHTML = smartList();
    wireRowButtons();
  }

  // ---------- Rows page ----------
  function rowsPage() {
    var cats = S.data.catalogs;
    if (!cats.length) return '<div class="page-head"><div><h1>Rows</h1></div></div><div class="list"><div class="empty"><strong>No rows yet</strong>Import your provider from the Library tab and its categories show up here.</div></div>';
    var top = topRows();
    var shown = top.filter(function (c) { return stateOf(c) === 'shown'; }).length;
    var titles = cats.reduce(function (t, c) { return t + (c.isMerge || c.smart ? 0 : c.item_count); }, 0);
    return '<div class="page-head"><div><h1>Rows</h1><div class="summary"><span><b>' + n(top.length) + '</b> rows</span><span><b>' + n(shown) + '</b> on the Nuvio home screen</span><span><b>' + n(titles) + '</b> titles</span></div></div></div>' +
      '<div class="toolbar"><div class="search">' + ICONS.search + '<input id="rowSearch" type="search" placeholder="Find a row or category" value="' + esc(S.q) + '" aria-label="Find a row"></div>' +
      '<select id="rowType" class="compact" aria-label="Type"><option value="all">Movies and series</option><option value="movie">Movies</option><option value="series">Series</option></select>' +
      '<select id="rowStatus" class="compact" aria-label="Status"><option value="all">Any status</option><option value="shown">Shown</option><option value="hidden">Hidden</option><option value="merged">Merged</option><option value="smart">Smart</option><option value="new">New</option><option value="empty">Empty</option></select>' +
      '<details class="menu wide"><summary class="btn sm">Change listed rows</summary><div class="menu-pop">' +
      '<label for="bulkHide">Where they appear</label><select id="bulkHide" class="compact" style="width:100%"><option value="">Choose…</option><option value="none">Shown</option><option value="row">Hide rows (keep in search)</option><option value="all">Hide everywhere</option></select>' +
      '<label for="bulkOrder">Title order</label><select id="bulkOrder" class="compact" style="width:100%"><option value="">Choose…</option><option value="az">A–Z</option><option value="recent">Newest first</option><option value="shuffle">Shuffle every 4 h</option></select>' +
      '<label for="sortRows">Sort every row</label><select id="sortRows" class="compact" style="width:100%"><option value="">Choose…</option><option value="az">Name A–Z</option><option value="za">Name Z–A</option><option value="most">Most titles first</option><option value="fewest">Fewest titles first</option><option value="movie">Movies first</option><option value="series">Series first</option></select>' +
      '<hr><button id="pickAll" type="button">Select all listed</button></div></details></div>' +
      '<div id="msg" aria-live="polite"></div><div class="list" id="rowList">' + rowList() + '</div><div id="pickBar"></div><div id="viewer"></div>';
  }
  function wireRows() {
    var type = el('rowType'); if (!type) return;
    type.value = S.filter;
    type.onchange = function () { S.filter = type.value; redraw(); };
    el('rowStatus').value = S.status;
    el('rowStatus').onchange = function () { S.status = el('rowStatus').value; redraw(); };
    el('rowSearch').oninput = function () { S.q = el('rowSearch').value; redraw(); };
    el('sortRows').onchange = function () {
      var how = el('sortRows').value;
      if (!how) return;
      if (!confirm('Re-order every row this way? Your current order will be replaced.')) { el('sortRows').value = ''; return; }
      saveTopOrder(topRows().slice().sort(SORTS[how]));
    };
    el('pickAll').onclick = function () {
      visibleRows().forEach(function (c) { if (!c.smart) S.picked[c.id] = true; });
      closeMenus(); redraw();
    };
    el('bulkOrder').onchange = async function () {
      var order = el('bulkOrder').value;
      if (!order) return;
      var list = visibleRows().filter(function (c) { return !c.mergedInto && !c.smart; });
      try {
        await api('/api/catalogs/bulk', { method: 'POST', body: { ids: list.map(function (c) { return c.id; }), title_order: order } });
        list.forEach(function (c) { c.titleOrder = order; });
        render();
        say('msg', plural(list.length, 'row', 'rows') + ' set to ' + (order === 'shuffle' ? 'shuffle every 4 hours' : order === 'recent' ? 'newest first' : 'A–Z') + '.', true);
      } catch (e) { say('msg', e.message); el('bulkOrder').value = ''; }
    };
    el('bulkHide').onchange = async function () {
      var mode = el('bulkHide').value;
      if (!mode) return;
      var list = visibleRows().filter(function (c) { return !c.mergedInto; });
      try {
        await api('/api/catalogs/bulk', { method: 'POST', body: { ids: list.map(function (c) { return c.id; }), hide: mode } });
        list.forEach(function (c) { c.hideMode = mode; c.hidden = mode !== 'none'; });
        render();
        refreshSmartRows(function () {});
        say('msg', plural(list.length, 'row', 'rows') + ' updated.', true);
      } catch (e) { say('msg', e.message); el('bulkHide').value = ''; }
    };
    wireRowButtons();
  }
  function closeMenus() { document.querySelectorAll('details.menu[open]').forEach(function (d) { d.removeAttribute('open'); }); }
  // Save a new top-level order. Categories inside merged rows keep following their merged row.
  async function saveTopOrder(top) {
    var inner = S.data.catalogs.filter(function (c) { return c.mergedInto; });
    S.data.catalogs = top.concat(inner);
    redraw();
    try { await api('/api/catalog-order', { method: 'POST', body: { ids: S.data.catalogs.map(function (c) { return c.id; }) } }); }
    catch (e) { say('msg', e.message); load(); }
  }
  var SORTS = {
    az: function (a, b) { return a.name.localeCompare(b.name); },
    za: function (a, b) { return b.name.localeCompare(a.name); },
    most: function (a, b) { return b.item_count - a.item_count; },
    fewest: function (a, b) { return a.item_count - b.item_count; },
    movie: function (a, b) { return (a.media_type === 'movie' ? 0 : 1) - (b.media_type === 'movie' ? 0 : 1); },
    series: function (a, b) { return (a.media_type === 'series' ? 0 : 1) - (b.media_type === 'series' ? 0 : 1); },
  };
  // Drag a row by its handle (mouse or touch). Rows hidden by a filter keep their places.
  function wireDrag() {
    document.querySelectorAll('[data-drag]').forEach(function (h) {
      h.onpointerdown = function (e) {
        e.preventDefault();
        var list = el('rowList');
        var group = h.closest('[data-group]');
        group.classList.add('dragging');
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
          group.classList.remove('dragging');
          var shown = Array.prototype.slice.call(list.querySelectorAll(':scope > [data-group]')).map(function (g) { return find(g.dataset.group); });
          var shownSet = {};
          shown.forEach(function (c) { shownSet[c.id] = true; });
          var k = 0;
          saveTopOrder(topRows().map(function (c) { return shownSet[c.id] ? shown[k++] : c; }));
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
      };
    });
  }
  // A side drawer with a row's titles: posters, years and whether TMDB matched them.
  async function openViewer(c, skip, q) {
    var v = el('viewer');
    if (!v) { v = document.createElement('div'); v.id = 'viewer'; document.body.appendChild(v); }
    var first = !el('viewerList');
    if (first) {
      v.innerHTML = '<div class="scrim" id="viewerScrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Titles in ' + esc(c.name) + '"><div class="drawer-head"><h2>' + esc(c.name) + '</h2><button class="icon-btn" id="closeViewer" type="button" aria-label="Close">' + ICONS.close + '</button></div>' +
        '<div class="drawer-body"><div class="search" style="position:relative"><input id="viewerSearch" type="search" placeholder="Find a title in this row" value="' + esc(q || '') + '"></div><div id="viewerList" style="margin-top:8px"><p>Loading…</p></div></div></aside>';
      var close = function () { v.innerHTML = ''; document.removeEventListener('keydown', onKey); };
      var onKey = function (e) { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      el('closeViewer').onclick = close;
      el('viewerScrim').onclick = close;
      var timer = null;
      el('viewerSearch').oninput = function () {
        clearTimeout(timer);
        timer = setTimeout(function () { openViewer(c, 0, el('viewerSearch').value.trim()); }, 350);
      };
      el('closeViewer').focus();
    }
    try {
      var d = await api('/api/catalogs/' + c.id + '/titles?skip=' + skip + (q ? '&q=' + encodeURIComponent(q) : ''));
      var items = d.titles.map(function (t) {
        var img = t.tmdb_poster || t.poster_url;
        var status = t.imdb_id ? '<small class="ok" style="display:inline">Full metadata</small>' : '<small style="display:inline">' + (t.tmdb_match_status === 'pending' ? 'Waiting for TMDB' : t.tmdb_match_status === 'skip' ? 'Episode' : 'Provider info only') + '</small>';
        return '<div class="title">' + (img ? '<img class="poster" src="' + esc(img) + '" alt="" loading="lazy" onerror="this.removeAttribute(\'src\')">' : '<span class="poster"></span>') +
          '<div><b>' + esc(t.title) + '</b>' + (t.year ? '<small style="display:inline;margin-right:10px">' + t.year + '</small>' : '') + status + '</div></div>';
      }).join('');
      if (!el('viewerList')) return;
      el('viewerList').innerHTML = (items || '<div class="empty"><strong>Nothing here</strong>' + (q ? 'No titles match “' + esc(q) + '”.' : 'This row has no titles yet.') + '</div>') +
        '<div class="actions">' + (skip > 0 ? '<button class="btn sm" id="viewerPrev" type="button">Previous 100</button>' : '') + (d.more ? '<button class="btn sm" id="viewerNext" type="button">Next 100</button>' : '') + '</div>';
      if (el('viewerPrev')) el('viewerPrev').onclick = function () { openViewer(c, Math.max(0, skip - 100), q); };
      if (el('viewerNext')) el('viewerNext').onclick = function () { openViewer(c, skip + 100, q); };
    } catch (e) { if (el('viewerList')) el('viewerList').innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }
  function pickedIds() { return Object.keys(S.picked).filter(function (k) { return S.picked[k]; }).map(Number).filter(function (i) { return find(i); }); }
  // Selection bar: appears when rows are ticked. Ticks stay while the filter changes.
  function renderPickBar() {
    var bar = el('pickBar');
    if (!bar) return;
    var ids = pickedIds();
    if (!ids.length) { bar.className = ''; bar.innerHTML = ''; S.naming = false; return; }
    bar.className = 'pickbar';
    var rows = ids.map(find);
    if (S.naming) {
      bar.innerHTML = '<strong>Name the merged row</strong><input id="mergeName" maxlength="150" value="' + esc(rows.map(function (c) { return c.name; }).join(' + ').slice(0, 80)) + '" aria-label="Merged row name"><span class="grow"></span><button class="btn primary" id="mergeSave" type="button">Merge ' + rows.length + ' rows</button><button class="btn ghost" id="mergeCancel" type="button">Cancel</button>';
      var input = el('mergeName');
      input.focus(); if (input.select) input.select();
      var go = function () { S.naming = false; doMerge(ids, input.value.trim()); };
      el('mergeSave').onclick = go;
      el('mergeCancel').onclick = function () { S.naming = false; renderPickBar(); };
      input.onkeydown = function (e) { if (e.key === 'Enter') go(); if (e.key === 'Escape') { S.naming = false; renderPickBar(); } };
      return;
    }
    var merges = S.data.catalogs.filter(function (c) { return c.isMerge; });
    bar.innerHTML = '<strong>' + n(ids.length) + ' selected</strong><button class="btn ghost sm" id="pickClear" type="button">Clear</button><span class="grow"></span>' +
      (merges.length ? '<select id="addTo" class="compact" aria-label="Add selected to a merged row"><option value="">Add to merged row…</option>' + merges.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + ' (' + (m.media_type === 'movie' ? 'Movies' : 'Series') + ')</option>'; }).join('') + '</select>' : '') +
      '<button class="btn primary" id="mergeBtn" type="button">Merge into one row</button>';
    el('pickClear').onclick = function () { S.picked = {}; redraw(); };
    el('mergeBtn').onclick = function () {
      var target = rows.filter(function (c) { return c.isMerge; })[0];
      if (rows.length < 2) return say('msg', 'Select at least two categories to merge.');
      if (target) return doMerge([target.id].concat(ids.filter(function (i) { return i !== target.id; })), target.name);
      S.naming = true; renderPickBar();
    };
    if (el('addTo')) el('addTo').onchange = async function () {
      var target = Number(el('addTo').value);
      if (!target) return;
      try {
        var r = await api('/api/merges', { method: 'POST', body: { ids: pickedIds().filter(function (i) { return i !== target; }), target: target } });
        S.picked = {};
        await load();
        say('msg', 'Added to “' + find(target).name + '”' + (r.combined ? ', with ' + plural(r.combined, 'merged row', 'merged rows') + ' combined into it' : '') + '.', true);
      } catch (e) { say('msg', e.message); el('addTo').value = ''; }
    };
  }
  async function doMerge(ids, name) {
    try { await api('/api/merges', { method: 'POST', body: { ids: ids, name: name } }); S.picked = {}; await load(); say('msg', 'Merged.', true); }
    catch (e) { say('msg', e.message); renderPickBar(); }
  }
  function wireRowButtons() {
    wireDrag();
    renderPickBar();
    document.querySelectorAll('.menu-pop button').forEach(function (b) { b.addEventListener('click', closeMenus); });
    document.querySelectorAll('[data-expand]').forEach(function (b) {
      b.onclick = function () { S.open[b.dataset.expand] = !S.open[b.dataset.expand]; redraw(); };
    });
    document.querySelectorAll('[data-smart-refresh]').forEach(function (b) {
      b.onclick = async function () {
        try { var r = await api('/api/smart/' + b.dataset.smartRefresh + '/refresh', { method: 'POST', body: {} }); await load(); say(el('msgSmart') ? 'msgSmart' : 'msg', 'Smart row updated: ' + plural(r.count, 'title', 'titles') + '.', true); }
        catch (e) { say(el('msgSmart') ? 'msgSmart' : 'msg', e.message); }
      };
    });
    document.querySelectorAll('[data-smart-edit]').forEach(function (b) {
      b.onclick = function () { var c = find(b.dataset.smartEdit); S.tab = 'smart'; render(); openBuilder(c).catch(function (e) { say('msgSmart', e.message); }); };
    });
    document.querySelectorAll('[data-smart-delete]').forEach(function (b) {
      b.onclick = async function () {
        var c = find(b.dataset.smartDelete);
        if (!confirm('Delete the smart row “' + c.name + '”?')) return;
        try { await api('/api/smart/' + c.id, { method: 'DELETE' }); await load(); } catch (e) { say('msg', e.message); }
      };
    });
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = function () { openViewer(find(b.dataset.view), 0, ''); };
    });
    document.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onchange = function () { S.picked[b.dataset.pick] = b.checked; renderPickBar(); };
    });
    document.querySelectorAll('[data-order]').forEach(function (b) {
      b.onchange = async function () {
        var c = find(b.dataset.order);
        try { await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { title_order: b.value } }); c.titleOrder = b.value; }
        catch (e) { say('msg', e.message); b.value = c.titleOrder; }
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
      b.onclick = function () { S.renaming = Number(b.dataset.rename); redraw(); };
    });
    var box = el('renameBox');
    if (box) {
      var c = find(S.renaming);
      var close = function () { S.renaming = null; redraw(); };
      var save = async function () {
        var name = box.value.trim();
        if (!name && (c.smart || c.isMerge)) return say(el('msgSmart') && c.smart ? 'msgSmart' : 'msg', 'This row needs a name.');
        try {
          await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { display_name: name } });
          c.name = name || c.source_category_name; c.renamed = !!name;
          close();
        } catch (e) { say('msg', e.message); }
      };
      box.focus(); if (box.select) box.select();
      box.onkeydown = function (e) { if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); };
      el('renameSave').onclick = save;
      el('renameCancel').onclick = close;
    }
    document.querySelectorAll('[data-hide]').forEach(function (b) {
      b.onchange = async function () {
        var c = find(b.dataset.hide);
        try {
          var was = c.hideMode;
          await api('/api/catalogs/' + c.id, { method: 'PATCH', body: { hide: b.value } });
          c.hideMode = b.value; c.hidden = b.value !== 'none';
          redraw();
          // Smart rows leave out titles hidden everywhere; rebuild them so they refill right away.
          if (was === 'all' || b.value === 'all') refreshSmartRows(function () {});
        } catch (e) { say('msg', e.message); b.value = c.hideMode; }
      };
    });
    document.querySelectorAll('[data-move]').forEach(function (b) {
      b.onclick = function () {
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

  // ---------- Smart rows page ----------
  var STARTER = [['trending_day', 'movie'], ['trending_day', 'series'], ['popular', 'movie'], ['popular', 'series'], ['top_rated', 'movie'], ['top_rated', 'series']];
  function smartPage() {
    var count = S.data.catalogs.filter(function (c) { return c.smart; }).length;
    return '<div class="page-head"><div><h1>Smart rows</h1><p>Rows built from TMDB lists, showing only titles your provider has. They rebuild themselves every few hours.</p></div></div>' +
      (S.data.tmdbConfigured ? '' : '<div class="callout">Smart rows need a TMDB key. Add one in <button class="btn sm" data-tab="settings" type="button">Settings</button></div>') +
      '<div class="split"><div class="section"><h2>Add a ready-made list</h2><p>Trending, popular, top rated and more.</p>' +
      '<div class="fields"><div><label for="smartType">Type</label><select id="smartType"><option value="movie">Movies</option><option value="series">Series</option></select></div><div><label for="smartList">List</label><select id="smartList"></select></div><div class="wide" id="smartGenreWrap" style="display:none"><label for="smartGenre">Genre</label><select id="smartGenre"></select></div>' +
      '<div class="wide"><label for="smartName">Row name</label><input id="smartName" placeholder="Leave empty for an automatic name"></div></div>' +
      '<div class="actions"><button class="btn primary" id="addSmart" type="button">Add smart row</button>' + (count ? '' : '<button class="btn" id="addStarter" type="button">Add the starter set</button>') + '</div></div>' +
      '<div class="section"><h2>Build your own</h2><p>Pick genres, a decade, a sort and how many titles. For example: the 25 most popular action movies from the 1990s.</p><div class="actions"><button class="btn" id="openBuilder" type="button">Start building</button></div></div></div>' +
      '<div id="msgSmart" aria-live="polite"></div><div id="builder"></div>' +
      '<div class="page-head" style="margin-top:30px;margin-bottom:12px"><h2>Your smart rows</h2></div><div class="list" id="smartRowsList">' + smartList() + '</div><div id="viewer"></div>';
  }
  async function wireSmart() {
    document.querySelectorAll('main [data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); }; });
    el('openBuilder').onclick = function () { openBuilder(null).catch(function (e) { say('msgSmart', e.message); }); };
    wireRowButtons();
    var opts;
    try { opts = await api('/api/smart/options'); } catch (e) { return; }
    var type = el('smartType'), list = el('smartList'), genre = el('smartGenre');
    if (!type) return;
    function fill() {
      var t = type.value;
      list.innerHTML = opts.lists.filter(function (l) { return l[t]; }).map(function (l) { return '<option value="' + l.id + '">' + esc(l.label) + '</option>'; }).join('');
      var g = opts.genres[t];
      genre.innerHTML = Object.keys(g).map(function (id) { return '<option value="' + id + '">' + esc(g[id]) + '</option>'; }).join('');
      el('smartGenreWrap').style.display = list.value === 'genre' ? 'block' : 'none';
    }
    type.onchange = fill;
    list.onchange = function () { el('smartGenreWrap').style.display = list.value === 'genre' ? 'block' : 'none'; };
    fill();
    el('addSmart').onclick = async function () {
      el('addSmart').disabled = true;
      say('msgSmart', 'Building the row from TMDB…', true);
      try {
        var r = await api('/api/smart', { method: 'POST', body: { type: type.value, list: list.value, genre: Number(genre.value), name: el('smartName').value.trim() } });
        await load(); say('msgSmart', 'Added. ' + plural(r.count, 'of your titles is', 'of your titles are') + ' on that list.', true);
      } catch (e) { say('msgSmart', e.message); el('addSmart').disabled = false; }
    };
    if (el('addStarter')) el('addStarter').onclick = async function () {
      el('addStarter').disabled = true;
      var added = 0, skipped = 0;
      for (var i = 0; i < STARTER.length; i++) {
        say('msgSmart', 'Adding ' + (i + 1) + ' of ' + STARTER.length + '…', true);
        try { await api('/api/smart', { method: 'POST', body: { list: STARTER[i][0], type: STARTER[i][1] } }); added++; }
        catch (e) { if (/already/.test(e.message)) skipped++; else { say('msgSmart', e.message); el('addStarter').disabled = false; return; } }
      }
      await load(); say('msgSmart', 'Added ' + plural(added, 'smart row', 'smart rows') + (skipped ? ' (' + skipped + ' you already had)' : '') + '. They’re at the top of Rows; drag them where you like.', true);
    };
  }
  var DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  function builderHtml(opts, def, editing) {
    def = def || { type: 'movie', custom: { genres: [], genreMode: 'all', sort: 'popular', limit: 25 } };
    var c = def.custom || {};
    var sel = function (id, list, value) {
      return '<select id="' + id + '">' + list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value == null ? '' : value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    };
    var decade = c.yearFrom && c.yearTo && c.yearFrom % 10 === 0 && c.yearTo === c.yearFrom + 9 ? c.yearFrom : (c.yearFrom || c.yearTo ? 'custom' : '');
    return '<div class="section" style="margin-top:16px;border-color:rgba(232,178,76,.35)"><h2>' + (editing ? 'Edit “' + esc(editing.name) + '”' : 'Build a smart row') + '</h2>' +
      '<div class="fields">' +
      '<div><label for="bType">Type</label>' + sel('bType', [['movie', 'Movies'], ['series', 'Series']], def.type) + '</div>' +
      '<div><label for="bLimit">How many titles</label><input id="bLimit" type="number" min="5" max="100" value="' + esc(c.limit || 25) + '"></div>' +
      '<div class="wide"><label>Genres <span class="help" style="display:inline">(none picked means every genre)</span></label><div id="bGenres" class="chips"></div></div>' +
      '<div><label for="bMode">With more than one genre</label>' + sel('bMode', [['all', 'Titles must have all of them'], ['any', 'Titles can have any of them']], c.genreMode) + '</div>' +
      '<div><label for="bSort">Sort by</label>' + sel('bSort', Object.keys(opts.sorts).map(function (k) { return [k, opts.sorts[k]]; }), c.sort) + '</div>' +
      '<div><label for="bDecade">Released</label>' + sel('bDecade', [['', 'Any time']].concat(DECADES.map(function (d) { return [d, 'In the ' + d + 's']; })).concat([['custom', 'Between years…']]), decade) + '</div>' +
      '<div id="bYears" style="display:' + (decade === 'custom' ? 'grid' : 'none') + ';grid-template-columns:1fr 1fr;gap:10px"><div><label for="bFrom">From</label><input id="bFrom" type="number" placeholder="1990" value="' + esc(c.yearFrom || '') + '"></div><div><label for="bTo">To</label><input id="bTo" type="number" placeholder="1999" value="' + esc(c.yearTo || '') + '"></div></div>' +
      '<div><label for="bRating">Minimum rating</label>' + sel('bRating', [['', 'Any'], [5, '5 or higher'], [6, '6 or higher'], [7, '7 or higher'], [8, '8 or higher']], c.minRating) + '</div>' +
      '<div><label for="bLang">Original language</label>' + sel('bLang', [['', 'Any']].concat(Object.keys(opts.languages).map(function (k) { return [k, opts.languages[k]]; })), c.language) + '</div>' +
      '<div id="bCertWrap"><label for="bCert">Age rating (US)</label>' + sel('bCert', [['', 'Any']].concat(opts.certs.map(function (x) { return [x, x + ' or lower']; })), c.maxCert) + '</div>' +
      '<div class="wide"><label for="bName">Row name</label><input id="bName" placeholder="' + esc(editing ? editing.name : 'Leave empty for an automatic name') + '" value="' + esc(editing && editing.renamed ? editing.name : '') + '"></div>' +
      '</div><div class="actions"><button class="btn" id="bPreview" type="button">Preview</button><button class="btn primary" id="bSave" type="button">' + (editing ? 'Save changes' : 'Save smart row') + '</button><button class="btn ghost" id="bCancel" type="button">Cancel</button></div><div id="bMsg" aria-live="polite"></div><div id="bPreviewList"></div></div>';
  }
  async function openBuilder(editing) {
    var opts = await api('/api/smart/options');
    var box = el('builder');
    box.innerHTML = builderHtml(opts, editing ? editing.smart : null, editing);
    var picked = {};
    ((editing && editing.smart.custom && editing.smart.custom.genres) || []).forEach(function (g) { picked[g] = true; });
    function genres() {
      var g = opts.genres[el('bType').value];
      el('bGenres').innerHTML = Object.keys(g).map(function (id) { return '<label class="chip"><input type="checkbox" data-genre="' + id + '"' + (picked[id] ? ' checked' : '') + '><span>' + esc(g[id]) + '</span></label>'; }).join('');
      document.querySelectorAll('[data-genre]').forEach(function (b) { b.onchange = function () { picked[b.dataset.genre] = b.checked; }; });
      el('bCertWrap').style.display = el('bType').value === 'movie' ? 'block' : 'none';
    }
    el('bType').onchange = function () { picked = {}; genres(); };
    el('bDecade').onchange = function () { el('bYears').style.display = el('bDecade').value === 'custom' ? 'grid' : 'none'; };
    genres();
    function read() {
      var d = el('bDecade').value;
      var custom = {
        genres: Object.keys(picked).filter(function (k) { return picked[k]; }).map(Number),
        genreMode: el('bMode').value, sort: el('bSort').value, limit: Number(el('bLimit').value) || 25,
        minRating: Number(el('bRating').value) || undefined, language: el('bLang').value || undefined,
        maxCert: el('bType').value === 'movie' ? el('bCert').value || undefined : undefined,
      };
      if (d === 'custom') { custom.yearFrom = Number(el('bFrom').value) || undefined; custom.yearTo = Number(el('bTo').value) || undefined; }
      else if (d) { custom.yearFrom = Number(d); custom.yearTo = Number(d) + 9; }
      return { list: 'custom', type: el('bType').value, custom: custom, name: el('bName').value.trim() };
    }
    el('bCancel').onclick = function () { box.innerHTML = ''; };
    el('bPreview').onclick = async function () {
      el('bPreview').disabled = true;
      say('bMsg', 'Looking through TMDB…', true);
      try {
        var r = await api('/api/smart/preview', { method: 'POST', body: read() });
        say('bMsg', 'Found ' + plural(r.count, 'of your titles', 'of your titles') + '. If you leave the name empty it will be called “' + r.name + '”.', true);
        el('bPreviewList').innerHTML = '<div class="posters">' + r.titles.map(function (t) {
          var img = t.tmdb_poster || t.poster_url;
          return '<figure>' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="ph"></span>') + '<figcaption>' + esc(t.title) + '</figcaption></figure>';
        }).join('') + '</div>';
      } catch (e) { say('bMsg', e.message); }
      el('bPreview').disabled = false;
    };
    el('bSave').onclick = async function () {
      el('bSave').disabled = true;
      say('bMsg', 'Saving…', true);
      try {
        var r = editing ? await api('/api/smart/' + editing.id, { method: 'PATCH', body: read() }) : await api('/api/smart', { method: 'POST', body: read() });
        await load(); say('msgSmart', (editing ? 'Saved. ' : 'Added. ') + plural(r.count, 'title', 'titles') + ' in the row.', true);
      } catch (e) { say('bMsg', e.message); el('bSave').disabled = false; }
    };
    if (box.scrollIntoView) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // After an import or matching run, rebuild smart rows so new titles show up in them right away.
  async function refreshSmartRows(show) {
    var rows = S.data.catalogs.filter(function (c) { return c.smart; });
    for (var i = 0; i < rows.length; i++) {
      show('Updating smart rows… ' + (i + 1) + ' of ' + rows.length, true);
      try { await api('/api/smart/' + rows[i].id + '/refresh', { method: 'POST', body: {} }); } catch (e) {}
    }
  }

  // ---------- Filters page ----------
  function filtersPage() {
    var st = S.data.library.settings || { hideNew: false, hideRules: [], onlyMatched: true };
    var check = function (id, on, title, help) {
      return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '>' + title + '</label><div class="help">' + help + '</div>';
    };
    return '<div class="page-head"><div><h1>Filters</h1><p>Decide what reaches Nuvio. Nothing is deleted; turn any of these off and the titles come back.</p></div></div>' +
      '<div class="section"><h2>What family sees</h2>' +
      check('onlyMatched', st.onlyMatched !== false, 'Only titles with full metadata', 'Titles TMDB couldn’t match (odd names, no poster or description) stay out of Nuvio until they’re matched. Recommended.') +
      check('englishOriginal', st.englishOriginal, 'Only titles originally in English', 'Uses TMDB’s original language, so films made in other languages are hidden even when your provider has an English dub.') +
      check('englishCopy', st.englishCopy, 'Hide copies labeled as another language', 'Uses your provider’s labels, like “IT - Title”, “Title [ITA]” or a category called “ITALIAN MOVIES”. Unlabeled titles count as English.') +
      '<div id="msgFilters" aria-live="polite"></div></div>' +
      '<div class="section"><h2>Hide categories automatically</h2><p>Any category whose name contains one of these words is hidden everywhere, including new ones in future refreshes.</p>' +
      '<label for="hideRules">Words, separated by commas</label><input id="hideRules" placeholder="ARABIC, XXX, |FR|, ADULT" value="' + esc(st.hideRules.join(', ')) + '">' +
      check('hideNew', st.hideNew, 'New categories start hidden', 'They get a “New” tag on the Rows tab so you can review them.') +
      '<div class="actions"><button class="btn" id="saveRules" type="button">Save</button><button class="btn primary" id="applyRules" type="button">Save and hide matching categories now</button></div><div id="msgRules" aria-live="polite"></div></div>';
  }
  function wireFilters() {
    var body = function (extra) {
      var words = el('hideRules').value.split(',').map(function (w) { return w.trim(); }).filter(Boolean);
      var b = { hideRules: words, hideNew: el('hideNew').checked, onlyMatched: el('onlyMatched').checked, englishOriginal: el('englishOriginal').checked, englishCopy: el('englishCopy').checked };
      for (var k in extra || {}) b[k] = extra[k];
      return b;
    };
    var saveRules = function (apply) {
      return async function () {
        try {
          var r = await api('/api/library/settings', { method: 'POST', body: body({ apply: apply }) });
          await load();
          say('msgRules', apply ? 'Saved. ' + plural(r.hidden, 'category', 'categories') + ' hidden.' : 'Saved.', true);
        } catch (e) { say('msgRules', e.message); }
      };
    };
    el('saveRules').onclick = saveRules(false);
    el('applyRules').onclick = saveRules(true);
    // Changing what family sees: fill in any missing language info first, save, then rebuild smart rows.
    var filterChanged = async function () {
      var boxes = ['onlyMatched', 'englishOriginal', 'englishCopy'].map(el);
      boxes.forEach(function (b) { b.disabled = true; });
      var show = function (t, ok) { say('msgFilters', t, ok); };
      try {
        if (el('englishOriginal').checked || el('englishCopy').checked) {
          if (el('englishOriginal').checked && !S.data.tmdbConfigured) throw new Error('“Originally in English” needs a TMDB key. Add one in Settings.');
          await VODImport.fillLanguages(function (t) { show(t, true); }, el('englishOriginal').checked);
        }
        show('Saving…', true);
        await api('/api/library/settings', { method: 'POST', body: body() });
        if (S.data.catalogs.some(function (c) { return c.smart; })) await refreshSmartRows(show);
        await load();
        say('msgFilters', 'Saved. Nuvio now gets ' + plural(S.data.catalogs.filter(function (c) { return !c.mergedInto; }).reduce(function (t, c) { return t + (c.isMerge || c.smart ? 0 : c.visibleCount); }, 0), 'title', 'titles') + '.', true);
      } catch (e) {
        show(e.message);
        boxes.forEach(function (b) { b.disabled = false; });
      }
    };
    ['onlyMatched', 'englishOriginal', 'englishCopy'].forEach(function (id) { el(id).onchange = filterChanged; });
  }

  // ---------- importing (owner) ----------
  async function matchAfter(r, show) {
    var note = r.withTmdb ? ' ' + n(r.withTmdb) + ' came with TMDB IDs from the provider.' : '';
    try {
      var m = await VODImport.match(function (t) { show(t, true); });
      if (m.skipped) return note + ' Add a TMDB key in Settings for full metadata.';
      return note + (m.total ? ' TMDB matched ' + n(m.matched) + ' of ' + n(m.total) + ' new titles.' : '');
    } catch (e) { return note + ' TMDB matching stopped: ' + e.message + ' Press “Match titles now” in Settings to continue.'; }
  }
  async function runImport(fileText, show) {
    var r = await VODImport.run(S.data.library.kind, function (t) { show(t, true); }, fileText);
    var extra = await matchAfter(r, show);
    await load();
    if (S.data.catalogs.some(function (c) { return c.smart; })) { await refreshSmartRows(show); await load(); }
    return 'Done: ' + plural(r.total, 'title', 'titles') + ' (' + n(r.added) + ' new, ' + n(r.changed) + ' updated, ' + n(r.removed) + ' removed).' + (r.skippedLive ? ' Skipped ' + n(r.skippedLive) + ' live channels.' : '') + extra;
  }
  function loginFields(kind, login) {
    login = login || {};
    return kind === 'xtream'
      ? field('Server address', 'baseUrl', 'url', 'http://server.example:8080', login.baseUrl, '', true) + field('Username', 'username', 'text', '', login.username) + field('Password', 'password', 'password', login.username ? 'Re-enter to change' : '', '')
      : field('Playlist link', 'playlistUrl', 'url', 'http://server.example:8080/get.php?username=…&password=…&type=m3u_plus', '', login.hasPlaylist ? 'Saved. Re-enter to change it.' : 'Your personal M3U link from the provider.', true);
  }
  var fileHelp = '<label for="m3uFile">Playlist file (optional)</label><input type="file" id="m3uFile" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"><div class="help">Only if your provider blocks VODStack: open your playlist link in a new tab so it downloads, then choose that file.</div>';

  function setupPage() {
    return '<div class="page-head"><div><h1>Set up your provider</h1><p>You’ll own this library. Family on the same provider can join later with an invite link, so it only has to be imported once.</p></div></div>' +
      '<form class="section" id="setupForm"><div class="fields"><div><label for="f-name">Name</label><input id="f-name" name="name" placeholder="My IPTV" required></div><div><label for="kind">Connection type</label><select name="kind" id="kind"><option value="xtream">Xtream Codes</option><option value="m3u">M3U playlist</option></select></div><div class="wide fields" id="loginFields" style="padding:0">' + loginFields('xtream') + '</div><div class="wide" id="fileField" style="display:none">' + fileHelp + '</div>' +
      field('User-Agent (optional)', 'userAgent', 'text', 'Leave empty to use VLC’s', '', 'Only if your provider refuses requests (HTTP 401 or 403). Try IPTVSmartersPro.', true) + '</div><div class="actions"><button class="btn primary" id="setupBtn" type="submit">Save and import</button></div><div id="msg" aria-live="polite"></div></form>';
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

  // ---------- Library page ----------
  function libraryPage() {
    var d = S.data, lib = d.library, st = lib.stats || {};
    return '<div class="page-head"><div><h1>' + esc(lib.name) + '</h1><div class="summary"><span>' + (lib.kind === 'xtream' ? 'Xtream Codes' : 'M3U playlist') + '</span><span>Shared library you own</span>' + (d.relayConfigured ? '<span>Downloads go through your relay</span>' : '') + '</div></div></div>' +
      '<div class="section"><h2>Refresh</h2><p>Downloads the latest lists once and updates the library for everyone. Only new or changed titles are saved.</p>' +
      '<div class="kv"><div><b>' + n(st.total) + '</b>titles</div><div><b>' + n(st.withImdb) + '</b>with full metadata</div><div><b>' + n(st.pending) + '</b>waiting for TMDB</div></div>' +
      '<div class="help" style="margin-top:14px">' + (lib.lastRefreshAt ? 'Last refresh ' + esc(lib.lastRefreshAt) + ' UTC. ' : '') + esc(lib.status || 'Not imported yet.') + '</div>' +
      '<div class="actions"><button class="btn primary" id="refreshBtn" type="button">Refresh now</button>' + (lib.kind === 'm3u' ? '<button class="btn" id="fileRefreshBtn" type="button">Refresh from a file</button><input type="file" id="refreshFile" style="display:none" accept=".m3u,.m3u8,.txt,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain">' : '') + '</div><div id="msg" aria-live="polite"></div></div>' +
      '<div class="split"><div class="section"><h2>Invite family</h2><p>Family on the same provider open this link, enter their own login and get their own Nuvio link. They see your rows exactly as you set them up.</p>' +
      (d.inviteUrl ? secret(d.inviteUrl, 'copyInvite') + '<div class="actions"><button class="btn sm" id="newInvite" type="button">Make a new link</button></div><div class="help">A new link stops the old one working. People who already joined aren’t affected.</div>' : '<div class="actions"><button class="btn primary" id="newInvite" type="button">Create an invite link</button></div>') + '<div id="msg3" aria-live="polite"></div></div>' +
      '<form class="section" id="loginForm"><h2>Your provider login</h2><p>Used for refreshes and your own playback.</p><input type="hidden" name="name" value="' + esc(lib.name) + '"><div class="fields">' + loginFields(lib.kind, d.login) + '</div><div class="actions"><button class="btn" type="submit">Save login</button></div>' +
      '<label for="ua">User-Agent</label><div class="inline"><input id="ua" placeholder="Default (VLC)" value="' + esc(d.login ? d.login.userAgent : '') + '"><button class="btn" id="saveUa" type="button">Save</button></div><div id="msg4" aria-live="polite"></div></form></div>' +
      '<div class="section" style="margin-top:16px"><h2>Delete this library</h2><p>Removes every imported title for you and everyone who joined. This can’t be undone.</p><div class="actions"><button class="btn danger" id="deleteLib" type="button">Delete library</button></div></div>';
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

  // ---------- Settings page ----------
  function tmdbText(d) {
    if (!d.configured) return 'No TMDB key saved yet.';
    return 'Key saved. ' + n(d.matched) + ' titles matched, ' + n(d.withImdb) + ' with full metadata in Nuvio, ' + n(d.pending) + ' waiting and ' + n(d.unmatched) + ' not found.';
  }
  function settingsPage() {
    var d = S.data;
    return '<div class="page-head"><div><h1>Settings</h1></div></div>' +
      '<div class="section"><h2>Your Nuvio link</h2><p>In Nuvio, add this as an addon to get the rows, search and playback. It’s personal; treat it like a password.</p>' + secret(d.addonUrl || '', 'copyAddon') + '<div class="help" style="margin-top:10px">After VODStack gets new features, remove the addon in Nuvio and add it again.</div></div>' +
      (d.role === 'owner' ? '<form class="section" id="tmdbForm"><h2>TMDB matching</h2><p>Links titles to their TMDB and IMDb entries so Nuvio shows its usual posters, cast and descriptions. It runs after every refresh, and matches are shared with everyone.</p>' +
        '<label for="tmdbKey">TMDB API key (v3)</label><input id="tmdbKey" type="password" placeholder="' + (d.tmdbConfigured ? 'Saved. Paste a new key to replace it.' : 'Paste your TMDB v3 API key') + '" autocomplete="new-password"><div class="help">Get a free key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">TMDB’s API settings</a>.</div>' +
        '<div class="help" id="tmdbStatus" style="color:var(--fog);margin-top:12px">Checking…</div>' +
        '<div class="actions"><button class="btn primary" type="submit">Save key</button><button class="btn" type="button" id="runMatch">Match titles now</button><button class="btn ghost" type="button" id="retryMatch">Retry titles that weren’t found</button></div><div id="tmdbMsg" aria-live="polite"></div></form>' : '') +
      '<div class="section"><h2>Recovery code</h2><p>Your way back into this setup from another device. Making a new one stops the old one working.</p><div class="actions"><button class="btn danger" id="rotate" type="button">Make a new recovery code</button></div></div>';
  }
  function wireSettings() {
    copyButton('copyAddon', S.data.addonUrl || '');
    el('rotate').onclick = rotateRecovery;
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
      try { var r = await api('/api/tmdb/retry', { method: 'POST', body: {} }); out(plural(r.reset, 'title', 'titles') + ' queued again. Press “Match titles now”.', true); refresh(); }
      catch (err) { out(err.message); }
    };
  }

  load();
})();
`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='3' width='28' height='10' rx='3' fill='%23e8b24c'/%3E%3Cpath d='M13.6 5.4v5.2l4.6-2.6z' fill='%230d191d'/%3E%3Crect x='4.5' y='15.5' width='23' height='6' rx='2.4' fill='%23e8b24c' fill-opacity='.62'/%3E%3Crect x='7' y='24' width='18' height='5' rx='2' fill='%23e8b24c' fill-opacity='.32'/%3E%3C/svg%3E";

export function dashboard() {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d191d"><title>VODStack</title>' +
    '<link rel="icon" href="' + FAVICON + '">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&display=swap">' +
    '<style>' + CSS + '</style></head><body><div id="app"><div class="solo"><p class="lede">Loading…</p></div></div><script>' +
    CLIENT_IMPORT_JS +
    '</script><script>' +
    PAGE_JS +
    '</script></body></html>'
  );
}
