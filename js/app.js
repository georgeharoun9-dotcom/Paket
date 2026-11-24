import { CARRIERS, carrier, detect, normalize, trackingUrl } from './carriers.js';
import { PROVIDERS, fetchLive, liveEnabled, statusText } from './live.js';
import { startScan } from './scanner.js';

export const VERSION = '1.0.0';
const KEY_PKGS = 'paket.packages.v1';
const KEY_SETTINGS = 'paket.settings.v1';

// ---------- lagring ----------
const load = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
};
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Kunde inte spara – lagringen är full eller blockerad.'); }
};

let packages = load(KEY_PKGS, []);
let settings = { liveProvider: 'none', liveKey: '', liveProxy: '', liveAuto: false, ...load(KEY_SETTINGS, {}) };
let view = 'active';
let query = '';
let currentId = null;

const persist = () => save(KEY_PKGS, packages);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const byId = id => packages.find(p => p.id === id);

// ---------- hjälp ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtNumber = n => {
  const id = normalize(n);
  const s10 = id.match(/^([A-Z]{2})(\d{3})(\d{3})(\d{3})([A-Z]{2})$/);
  return s10 ? s10.slice(1).join(' ') : id.replace(/(.{4})(?=.)/g, '$1 ');
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  // Som popover hamnar toasten ovanför öppna dialoger (top layer).
  if (t.showPopover) { try { t.hidePopover(); } catch {} try { t.showPopover(); } catch {} }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function badge(el, carrierId) {
  const c = carrier(carrierId);
  el.textContent = c.short;
  el.style.background = c.color;
  el.style.color = c.text || '#fff';
  el.title = c.name;
}

function statusLine(p) {
  if (p.live?.error) return { text: 'Kunde inte hämta status', cls: 'exception' };
  if (p.live?.status) {
    const last = p.live.events?.[0];
    return { text: last?.text || statusText(p.live.status), cls: p.live.status };
  }
  return { text: p.notes ? p.notes.split('\n')[0] : 'Tryck för att spåra', cls: 'none' };
}

// ---------- lista ----------
function render() {
  const active = packages.filter(p => !p.archived);
  const archived = packages.filter(p => p.archived);
  $('#count-active').textContent = active.length || '';
  $('#count-archive').textContent = archived.length || '';
  $('#title').textContent = view === 'active' ? 'Paket' : 'Arkiv';
  document.querySelectorAll('.segmented button').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('#btn-refresh').hidden = !liveEnabled(settings) || view !== 'active' || !active.length;

  const q = query.trim().toLowerCase();
  const items = (view === 'active' ? active : archived)
    .filter(p => !q || [p.name, p.number, p.notes, carrier(p.carrier).name].join(' ').toLowerCase().includes(q))
    .sort((a, b) => view === 'active'
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : (b.archivedAt || 0) - (a.archivedAt || 0));

  const list = $('#list');
  list.innerHTML = items.map(p => {
    const s = statusLine(p);
    const c = carrier(p.carrier);
    return `<li>
      <div class="card" role="button" tabindex="0" data-id="${esc(p.id)}">
        <span class="badge" style="background:${c.color};color:${c.text || '#fff'}">${esc(c.short)}</span>
        <span class="card-main">
          <span class="card-name">${esc(p.name || c.name)}</span>
          <span class="card-status ${esc(s.cls)}">${esc(s.text)}</span>
          <span class="card-number">${esc(c.name)} · ${esc(fmtNumber(p.number))}</span>
        </span>
        <a class="open" href="${esc(trackingUrl(p.carrier, p.number))}" target="_blank" rel="noopener" aria-label="Öppna spårning hos ${esc(c.name)}" data-open>
          <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        </a>
      </div>
    </li>`;
  }).join('');

  const empty = $('#empty');
  empty.hidden = items.length > 0;
  if (!items.length) {
    empty.innerHTML = q
      ? '<p>Inga träffar.</p>'
      : view === 'active'
        ? '<div class="empty-icon">📦</div><p><strong>Inga paket ännu</strong></p><p>Tryck på + för att lägga till eller skanna ett spårningsnummer.</p>'
        : '<div class="empty-icon">🗄️</div><p><strong>Arkivet är tomt</strong></p><p>Levererade paket du arkiverar hamnar här.</p>';
  }
}

// ---------- detalj ----------
function openDetail(id) {
  const p = byId(id);
  if (!p) return;
  currentId = id;
  const c = carrier(p.carrier);
  badge($('#d-badge'), p.carrier);
  $('#d-name').textContent = p.name || c.name;
  $('#d-number').textContent = fmtNumber(p.number);
  $('#d-carrier').textContent = c.name;
  $('#d-open').href = trackingUrl(p.carrier, p.number);
  $('#d-notes').value = p.notes || '';
  $('#d-archive').textContent = p.archived ? 'Återställ från arkiv' : 'Arkivera';
  $('#d-meta').textContent = `Tillagt ${fmtDate(new Date(p.createdAt).toISOString())}`
    + (p.live?.checkedAt ? ` · Status hämtad ${fmtDate(p.live.checkedAt)}` : '');
  renderLive(p);
  const dlg = $('#dlg-detail');
  if (!dlg.open) dlg.showModal();
}

function renderLive(p) {
  const on = liveEnabled(settings);
  $('#d-live').hidden = !on;
  const st = $('#d-status');
  if (p.live?.error) { st.textContent = p.live.error; st.className = 'status exception'; }
  else if (p.live?.status) {
    st.textContent = statusText(p.live.status) + (p.live.eta ? ` · Beräknad ${fmtDate(p.live.eta)}` : '');
    st.className = `status ${p.live.status}`;
  } else { st.textContent = ''; st.className = 'status'; }
  if (!on) return;
  const ev = p.live?.events || [];
  $('#d-events').innerHTML = ev.length
    ? ev.map(e => `<li><span class="ev-text">${esc(e.text)}</span><span class="ev-meta">${esc(fmtDate(e.time))}${e.location ? ' · ' + esc(e.location) : ''}</span></li>`).join('')
    : '<li class="muted">Inga händelser hämtade ännu.</li>';
}

async function refreshOne(p, { quiet } = {}) {
  try {
    const r = await fetchLive(p, settings);
    p.live = { ...r, checkedAt: new Date().toISOString() };
  } catch (e) {
    p.live = { ...(p.live || {}), error: e.message || 'Okänt fel', checkedAt: new Date().toISOString() };
    if (!quiet) toast(e.message || 'Kunde inte hämta status');
  }
  if (p.live && !p.live.error) delete p.live.error;
  persist();
}

async function refreshAll() {
  const active = packages.filter(p => !p.archived);
  if (!active.length) return;
  const btn = $('#btn-refresh');
  btn.classList.add('spin');
  for (const p of active) await refreshOne(p, { quiet: true });
  btn.classList.remove('spin');
  const errors = active.filter(p => p.live?.error).length;
  toast(errors ? `${errors} av ${active.length} kunde inte uppdateras` : 'Status uppdaterad');
  render();
}

// ---------- lägg till / redigera ----------
function fillCarrierSelect(sel, selected) {
  sel.innerHTML = Object.entries(CARRIERS)
    .map(([id, c]) => `<option value="${id}"${id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

let carrierTouched = false;
function updateDetected() {
  const num = $('#f-number').value;
  const hits = detect(num);
  const hint = $('#f-detected');
  if (!normalize(num)) { hint.textContent = ''; return; }
  if (!carrierTouched) $('#f-carrier').value = hits[0] || 'other';
  hint.textContent = hits.length
    ? `Igenkänt: ${hits.map(h => carrier(h).name).join(' eller ')}`
    : 'Kunde inte känna igen fraktbolaget – välj själv eller använd 17TRACK.';
}

function openEdit(id) {
  const p = id ? byId(id) : null;
  currentId = id || null;
  carrierTouched = !!p;
  $('#edit-title').textContent = p ? 'Redigera paket' : 'Nytt paket';
  fillCarrierSelect($('#f-carrier'), p?.carrier || 'other');
  $('#f-number').value = p?.number || '';
  $('#f-name').value = p?.name || '';
  $('#f-notes').value = p?.notes || '';
  $('#f-detected').textContent = '';
  if (p) updateDetected();
  $('#dlg-edit').showModal();
  if (!p) setTimeout(() => $('#f-number').focus(), 50);
}

function saveEdit(e) {
  e.preventDefault();
  const number = normalize($('#f-number').value);
  if (!number) { toast('Ange ett spårningsnummer'); return; }
  const data = {
    number,
    name: $('#f-name').value.trim(),
    carrier: $('#f-carrier').value,
    notes: $('#f-notes').value,
    updatedAt: Date.now(),
  };
  let p = currentId ? byId(currentId) : null;
  if (p) {
    if (p.number !== number || p.carrier !== data.carrier) delete p.live;
    Object.assign(p, data);
  } else {
    const dup = packages.find(x => x.number === number);
    if (dup) { $('#dlg-edit').close(); toast('Paketet finns redan'); openDetail(dup.id); return; }
    p = { id: uid(), createdAt: Date.now(), archived: false, ...data };
    packages.push(p);
    view = 'active';
  }
  persist();
  $('#dlg-edit').close();
  render();
  if ($('#dlg-detail').open) openDetail(p.id);
  if (liveEnabled(settings)) refreshOne(p, { quiet: true }).then(() => { render(); if (currentId === p.id && $('#dlg-detail').open) openDetail(p.id); });
}

// ---------- skanner ----------
let stopScan = null;
async function openScanner() {
  const dlg = $('#dlg-scan');
  $('#scan-msg').textContent = 'Rikta kameran mot streckkoden';
  dlg.showModal();
  try {
    stopScan = await startScan($('#scan-video'), text => {
      dlg.close();
      $('#f-number').value = normalize(text);
      updateDetected();
      navigator.vibrate?.(40);
      toast('Streckkod läst');
    });
  } catch (err) {
    $('#scan-msg').textContent = err?.name === 'NotAllowedError'
      ? 'Kameran är blockerad. Tillåt kamera för sidan i webbläsarens inställningar.'
      : `Kunde inte starta kameran: ${err?.message || err}`;
  }
}
function closeScanner() { stopScan?.(); stopScan = null; }

// ---------- inställningar ----------
function openSettings() {
  const sel = $('#s-provider');
  sel.innerHTML = Object.entries(PROVIDERS).map(([id, p]) =>
    `<option value="${id}"${id === settings.liveProvider ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#s-key').value = settings.liveKey || '';
  $('#s-proxy').value = settings.liveProxy || '';
  $('#s-auto').checked = !!settings.liveAuto;
  updateKeyHelp();
  $('#s-version').textContent = `Paket ${VERSION} · ${packages.length} paket sparade lokalt`;
  $('#dlg-settings').showModal();
}
function updateKeyHelp() {
  const p = PROVIDERS[$('#s-provider').value];
  const none = !p?.track;
  $('#s-key').disabled = none;
  $('#s-proxy').disabled = none;
  $('#s-auto').disabled = none;
  $('#s-key-help').textContent = none ? 'Utan tjänst öppnas fraktbolagets egen spårningssida.' : (p.keyHelp || '');
}
function saveSettings(e) {
  e.preventDefault();
  settings = {
    liveProvider: $('#s-provider').value,
    liveKey: $('#s-key').value.trim(),
    liveProxy: $('#s-proxy').value.trim(),
    liveAuto: $('#s-auto').checked,
  };
  save(KEY_SETTINGS, settings);
  $('#dlg-settings').close();
  toast('Inställningar sparade');
  render();
}

function exportData() {
  // Exporten innehåller bara paket – aldrig API-nyckeln.
  const blob = new Blob([JSON.stringify({ app: 'paket', version: 1, exportedAt: new Date().toISOString(), packages }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `paket-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.packages;
    if (!Array.isArray(list)) throw new Error();
    let added = 0;
    for (const raw of list) {
      const number = normalize(raw?.number);
      if (!number || packages.some(p => p.number === number)) continue;
      packages.push({
        id: uid(), createdAt: Date.now(), archived: false, name: '', notes: '', ...raw,
        number, carrier: CARRIERS[raw.carrier] ? raw.carrier : (detect(number)[0] || 'other'),
      });
      added++;
    }
    persist(); render();
    toast(`${added} paket importerade`);
  } catch { toast('Filen kunde inte läsas'); }
}

// ---------- händelser ----------
function bind() {
  document.querySelectorAll('.segmented button').forEach(b =>
    b.addEventListener('click', () => { view = b.dataset.view; render(); }));
  $('#search').addEventListener('input', e => { query = e.target.value; render(); });
  $('#btn-add').addEventListener('click', () => openEdit());
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-refresh').addEventListener('click', refreshAll);

  $('#list').addEventListener('click', e => {
    if (e.target.closest('[data-open]')) { e.stopPropagation(); return; }
    const card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });
  $('#list').addEventListener('keydown', e => {
    const card = e.target.closest('.card');
    if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(card.dataset.id); }
  });

  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));
  // Stäng ark genom att trycka utanför.
  document.querySelectorAll('dialog.sheet').forEach(d =>
    d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Detalj
  $('#detail-edit').addEventListener('click', () => openEdit(currentId));
  $('#d-number').addEventListener('click', async () => {
    const p = byId(currentId);
    try { await navigator.clipboard.writeText(p.number); toast('Nummer kopierat'); } catch { toast(p.number); }
  });
  let notesTimer;
  $('#d-notes').addEventListener('input', e => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      const p = byId(currentId);
      if (p) { p.notes = e.target.value; p.updatedAt = Date.now(); persist(); render(); }
    }, 300);
  });
  $('#dlg-detail').addEventListener('close', () => {
    const p = byId(currentId);
    if (p && p.notes !== $('#d-notes').value) { p.notes = $('#d-notes').value; persist(); render(); }
  });
  $('#d-archive').addEventListener('click', () => {
    const p = byId(currentId);
    p.archived = !p.archived;
    p.archivedAt = p.archived ? Date.now() : null;
    persist(); render();
    $('#dlg-detail').close();
    toast(p.archived ? 'Flyttat till arkivet' : 'Återställt');
  });
  $('#d-delete').addEventListener('click', () => {
    const p = byId(currentId);
    if (!confirm(`Ta bort ”${p.name || p.number}”? Det går inte att ångra.`)) return;
    packages = packages.filter(x => x.id !== p.id);
    persist(); render();
    $('#dlg-detail').close();
    toast('Paketet togs bort');
  });
  $('#d-live-refresh').addEventListener('click', async e => {
    const p = byId(currentId);
    e.target.disabled = true;
    await refreshOne(p);
    e.target.disabled = false;
    render(); openDetail(p.id);
  });

  // Redigera
  $('#form-edit').addEventListener('submit', saveEdit);
  $('#f-number').addEventListener('input', updateDetected);
  $('#f-carrier').addEventListener('change', () => { carrierTouched = true; });
  $('#btn-scan').addEventListener('click', openScanner);
  $('#scan-cancel').addEventListener('click', () => $('#dlg-scan').close());
  $('#dlg-scan').addEventListener('close', closeScanner);

  // Inställningar
  $('#form-settings').addEventListener('submit', saveSettings);
  $('#s-provider').addEventListener('change', updateKeyHelp);
  $('#s-export').addEventListener('click', exportData);
  $('#s-import').addEventListener('click', () => $('#s-import-file').click());
  $('#s-import-file').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#s-clear').addEventListener('click', () => {
    if (!confirm('Radera alla paket och inställningar på den här enheten?')) return;
    packages = []; settings = { liveProvider: 'none', liveKey: '', liveProxy: '', liveAuto: false };
    localStorage.removeItem(KEY_PKGS); localStorage.removeItem(KEY_SETTINGS);
    $('#dlg-settings').close(); render(); toast('All data raderad');
  });

  // Dela-mål / genväg: ?add=NUMMER öppnar formuläret ifyllt.
  const params = new URLSearchParams(location.search);
  if (['add', 'text', 'url', 'title'].some(k => params.has(k))) {
    const shared = [params.get('add'), params.get('text'), params.get('url'), params.get('title')].filter(Boolean).join(' ');
    history.replaceState(null, '', location.pathname);
    openEdit();
    const found = shared.match(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,35}\b/i)?.[0];
    if (found) { $('#f-number').value = normalize(found); updateDetected(); }
  }
}

bind();
render();
if (settings.liveAuto && liveEnabled(settings)) refreshAll();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
