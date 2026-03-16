
const state = {
  meta: null,
  leads: []
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindEls();
  bindEvents();
  restoreBackendUrl();
  syncAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

function bindEls() {
  [
    'backendUrl','connectionStatus','searchInput','suburbFilter','streetFilter','complexFilter','agencyFilter','statusFilter','intentFilter','assignedFilter',
    'saveUrlBtn','syncBtn','loadBtn','clearBtn','contactsContainer','messageBar','statTotal','statNew','statFollow','statRemove'
  ].forEach(id => els[id] = document.getElementById(id));
}

function bindEvents() {
  els.saveUrlBtn.addEventListener('click', saveBackendUrl);
  els.syncBtn.addEventListener('click', syncAll);
  els.loadBtn.addEventListener('click', loadLeads);
  els.clearBtn.addEventListener('click', clearFilters);
  els.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadLeads(); });
}

function getBackendUrl() {
  return (els.backendUrl.value || '').trim();
}

function restoreBackendUrl() {
  const saved = localStorage.getItem('blueLilyBackendUrl') || window.DEFAULT_BACKEND_URL || '';
  els.backendUrl.value = saved;
}

function saveBackendUrl() {
  localStorage.setItem('blueLilyBackendUrl', getBackendUrl());
  setStatus('Backend URL saved.');
}

function setStatus(text, isError = false) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.style.color = isError ? '#d9534f' : '#5f7c98';
}

function showMessage(text, hide = false) {
  if (hide) {
    els.messageBar.classList.add('hidden');
    els.messageBar.textContent = '';
    return;
  }
  els.messageBar.classList.remove('hidden');
  els.messageBar.textContent = text;
}

async function apiGet(action, params = {}) {
  const url = new URL(getBackendUrl());
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { method: 'GET' });
  return await res.json();
}

async function apiPost(action, payload = {}) {
  const res = await fetch(getBackendUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  return await res.json();
}

async function syncAll() {
  const url = getBackendUrl();
  if (!url) {
    setStatus('Paste the Apps Script URL first.', true);
    return;
  }
  saveBackendUrl();
  try {
    const [health, meta] = await Promise.all([
      apiGet('health'),
      apiGet('getMeta')
    ]);
    if (!health.ok) throw new Error(health.error || 'Health check failed');
    if (!meta.ok) throw new Error(meta.error || 'Meta load failed');
    state.meta = meta;
    fillFilters(meta);
    setStatus('Connected and synced.');
    await loadLeads();
  } catch (err) {
    setStatus(err.message || 'Sync failed.', true);
    renderEmpty('Could not load contacts. Check deployment settings or sheet setup.');
  }
}

function fillSelect(el, values, label) {
  const current = el.value;
  el.innerHTML = `<option value="">${label}</option>`;
  (values || []).forEach(value => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  });
  if ([...el.options].some(o => o.value === current)) el.value = current;
}

function fillFilters(meta) {
  fillSelect(els.suburbFilter, meta.suburbs, 'All suburbs');
  fillSelect(els.streetFilter, meta.streets, 'All streets');
  fillSelect(els.complexFilter, meta.complexes, 'All complexes');
  fillSelect(els.agencyFilter, meta.agencies, 'All agencies');
  fillSelect(els.statusFilter, meta.statuses, 'All statuses');
  fillSelect(els.intentFilter, meta.intents, 'All intents');
  fillSelect(els.assignedFilter, meta.assignedTo, 'All agents');
}

function getFilters() {
  return {
    q: els.searchInput.value.trim(),
    suburb: els.suburbFilter.value,
    street: els.streetFilter.value,
    complex: els.complexFilter.value,
    agency: els.agencyFilter.value,
    status: els.statusFilter.value,
    intent: els.intentFilter.value,
    assignedTo: els.assignedFilter.value
  };
}

async function loadLeads() {
  try {
    const data = await apiGet('getLeads', getFilters());
    if (!data.ok) throw new Error(data.error || 'Could not load contacts');
    state.leads = data.leads || [];
    renderStats(state.leads);
    renderLeads(state.leads);
    showMessage('', true);
  } catch (err) {
    renderEmpty(err.message || 'No contacts found.');
    setStatus(err.message || 'Load failed.', true);
  }
}

function renderStats(leads) {
  els.statTotal.textContent = leads.length;
  els.statNew.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'new').length;
  els.statFollow.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'follow up').length;
  els.statRemove.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'remove from database').length;
}

function esc(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderEmpty(message) {
  els.contactsContainer.innerHTML = `<div class="empty-state">${esc(message)}</div>`;
}

function renderLeads(leads) {
  if (!leads.length) {
    renderEmpty('No contacts found. Try syncing or changing filters.');
    return;
  }
  const statuses = state.meta?.statuses || [];
  const intents = state.meta?.intents || [];
  const agents = state.meta?.assignedTo || [];
  const senders = state.meta?.senderIdentity || agents;

  els.contactsContainer.innerHTML = leads.map(lead => `
    <article class="card contact-card">
      <div class="contact-top">
        <div>
          <h3 class="contact-name">${esc(lead.fullName || [lead.name, lead.surname].filter(Boolean).join(' ') || 'Unnamed')}</h3>
          <div>${esc(lead.address || [lead.complex, lead.street, lead.suburb].filter(Boolean).join(', ') || 'No address')}</div>
        </div>
        <span class="badge">${esc(lead.status || 'New')}</span>
      </div>

      <div class="meta-grid">
        <div class="meta-item"><small>Phone</small><div>${esc(lead.phone || '-')}</div></div>
        <div class="meta-item"><small>Email</small><div>${esc(lead.email || '-')}</div></div>
        <div class="meta-item"><small>Suburb</small><div>${esc(lead.suburb || '-')}</div></div>
        <div class="meta-item"><small>Agency</small><div>${esc(lead.agency || '-')}</div></div>
        <div class="meta-item"><small>Assigned To</small><div>${esc(lead.assignedTo || '-')}</div></div>
        <div class="meta-item"><small>Last Contacted</small><div>${esc(lead.lastContacted || '-')}</div></div>
      </div>

      <div class="form-grid">
        <div>
          <label class="label">Status</label>
          <select class="input select" id="status-${lead.rowNumber}">${optionHtml(statuses, lead.status)}</select>
        </div>
        <div>
          <label class="label">Intent</label>
          <select class="input select" id="intent-${lead.rowNumber}">${optionHtml(intents, lead.intent)}</select>
        </div>
        <div>
          <label class="label">Assigned To</label>
          <select class="input select" id="assigned-${lead.rowNumber}">${optionHtml(agents, lead.assignedTo)}</select>
        </div>
        <div>
          <label class="label">Sender Identity</label>
          <select class="input select" id="sender-${lead.rowNumber}">${optionHtml(senders, lead.senderIdentity)}</select>
        </div>
        <div class="full-span">
          <label class="label">Notes</label>
          <textarea class="input" id="notes-${lead.rowNumber}">${escText(lead.notes || '')}</textarea>
        </div>
      </div>

      <div class="action-row">
        <button class="btn btn-success" onclick="openWhatsApp(${lead.rowNumber})">WhatsApp</button>
        <button class="btn btn-secondary" onclick="copyMessage(${lead.rowNumber})">Copy Message</button>
        <button class="btn btn-primary" onclick="saveLead(${lead.rowNumber}, false)">Save</button>
        <button class="btn btn-warning" onclick="saveLead(${lead.rowNumber}, true)">Save + Contacted</button>
      </div>
    </article>
  `).join('');
}

function optionHtml(values, selected) {
  return (values || []).map(v => `<option value="${esc(v)}" ${String(v) === String(selected || '') ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function escText(v) {
  return String(v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getLead(rowNumber) {
  return state.leads.find(l => Number(l.rowNumber) === Number(rowNumber));
}

async function buildMessage(rowNumber) {
  const lead = getLead(rowNumber);
  const senderIdentity = document.getElementById(`sender-${rowNumber}`).value;
  const payload = {
    name: lead.name,
    surname: lead.surname,
    suburb: lead.suburb,
    street: lead.street,
    complex: lead.complex,
    address: lead.address,
    phone: lead.phone,
    senderIdentity
  };
  const data = await apiGet('getMessagePreview', payload);
  if (!data.ok) throw new Error(data.error || 'Could not build message');
  return data;
}

window.openWhatsApp = async function(rowNumber) {
  try {
    const data = await buildMessage(rowNumber);
    window.open(data.whatsappUrl, '_blank');
  } catch (err) {
    showMessage(err.message);
  }
}

window.copyMessage = async function(rowNumber) {
  try {
    const data = await buildMessage(rowNumber);
    await navigator.clipboard.writeText(data.message);
    showMessage('Message copied.');
  } catch (err) {
    showMessage(err.message || 'Could not copy message.');
  }
}

window.saveLead = async function(rowNumber, touchLead) {
  try {
    const payload = {
      rowNumber,
      status: document.getElementById(`status-${rowNumber}`).value,
      intent: document.getElementById(`intent-${rowNumber}`).value,
      assignedTo: document.getElementById(`assigned-${rowNumber}`).value,
      senderIdentity: document.getElementById(`sender-${rowNumber}`).value,
      notes: document.getElementById(`notes-${rowNumber}`).value,
      touchLead
    };
    const data = await apiPost('updateLead', payload);
    if (!data.ok) throw new Error(data.error || 'Save failed');
    showMessage('Contact updated successfully.');
    await syncAll();
  } catch (err) {
    showMessage(err.message || 'Could not save contact.');
  }
}

function clearFilters() {
  els.searchInput.value = '';
  els.suburbFilter.value = '';
  els.streetFilter.value = '';
  els.complexFilter.value = '';
  els.agencyFilter.value = '';
  els.statusFilter.value = '';
  els.intentFilter.value = '';
  els.assignedFilter.value = '';
  loadLeads();
}
