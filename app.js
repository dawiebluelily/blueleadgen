const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxn6P8SyHgjsota2995OALezJ2GP4dogisHDZuTk_QudbGNg0xAJx9U1EJcFp0qna5I/exec';

const state = {
  meta: null,
  leads: []
};

const el = {
  apiUrl: document.getElementById('apiUrl'),
  saveApiBtn: document.getElementById('saveApiBtn'),
  syncBtn: document.getElementById('syncBtn'),
  connectionStatus: document.getElementById('connectionStatus'),
  searchInput: document.getElementById('searchInput'),
  suburbFilter: document.getElementById('suburbFilter'),
  streetFilter: document.getElementById('streetFilter'),
  complexFilter: document.getElementById('complexFilter'),
  agencyFilter: document.getElementById('agencyFilter'),
  statusFilter: document.getElementById('statusFilter'),
  intentFilter: document.getElementById('intentFilter'),
  assignedFilter: document.getElementById('assignedFilter'),
  loadBtn: document.getElementById('loadBtn'),
  clearBtn: document.getElementById('clearBtn'),
  heroText: document.getElementById('heroText'),
  statTotal: document.getElementById('statTotal'),
  statNew: document.getElementById('statNew'),
  statFollow: document.getElementById('statFollow'),
  statRemove: document.getElementById('statRemove'),
  cards: document.getElementById('cards'),
  cardTemplate: document.getElementById('cardTemplate')
};

function setStatus(message, isError = false) {
  el.connectionStatus.textContent = message;
  el.connectionStatus.style.color = isError ? '#b42318' : '#6a879d';
}

function restoreApiUrl() {
  const saved = localStorage.getItem('blueLilyFunctionalApiUrl') || DEFAULT_API_URL;
  el.apiUrl.value = saved;
}

function saveApiUrl() {
  const value = el.apiUrl.value.trim() || DEFAULT_API_URL;
  localStorage.setItem('blueLilyFunctionalApiUrl', value);
  el.apiUrl.value = value;
}

async function getRequest(params = {}) {
  const base = el.apiUrl.value.trim();
  if (!base) throw new Error('Missing Apps Script URL');
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function postRequest(payload = {}) {
  const url = el.apiUrl.value.trim();
  if (!url) throw new Error('Missing Apps Script URL');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function fillSelect(select, items, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  (items || []).forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
  if ([...select.options].some(o => o.value === current)) {
    select.value = current;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAddress(lead) {
  return lead.address || [lead.complex, lead.street, lead.suburb].filter(Boolean).join(', ') || 'No address loaded';
}

function metaBox(label, value) {
  return `<div class="meta-box"><small>${label}</small><strong>${escapeHtml(value || '-')}</strong></div>`;
}

async function loadMeta() {
  const data = await getRequest({ action: 'getMeta' });
  state.meta = data;
  fillSelect(el.suburbFilter, data.suburbs, 'All suburbs');
  fillSelect(el.streetFilter, data.streets, 'All streets');
  fillSelect(el.complexFilter, data.complexes, 'All complexes');
  fillSelect(el.agencyFilter, data.agencies, 'All agencies');
  fillSelect(el.statusFilter, data.statuses, 'All statuses');
  fillSelect(el.intentFilter, data.intents, 'All intents');
  fillSelect(el.assignedFilter, data.assignedTo, 'All agents');
  el.heroText.textContent = data.brand?.companyName
    ? `Connected to ${data.brand.companyName}.`
    : 'Connected to your Blue Lily lead database.';
}

async function loadLeads() {
  const data = await getRequest({
    action: 'getLeads',
    q: el.searchInput.value.trim(),
    suburb: el.suburbFilter.value,
    street: el.streetFilter.value,
    complex: el.complexFilter.value,
    agency: el.agencyFilter.value,
    status: el.statusFilter.value,
    intent: el.intentFilter.value,
    assignedTo: el.assignedFilter.value,
    activeOnly: 'Yes'
  });
  state.leads = data.leads || [];
  renderStats();
  renderCards();
}

function renderStats() {
  const leads = state.leads;
  el.statTotal.textContent = leads.length;
  el.statNew.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'new').length;
  el.statFollow.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'follow up').length;
  el.statRemove.textContent = leads.filter(l => ((l.status || '').toLowerCase() === 'remove from database') || ((l.intent || '').toLowerCase() === 'remove from database')).length;
}

async function updatePreview(lead, senderSelect, previewTextarea, waBtn) {
  try {
    const data = await getRequest({
      action: 'getMessagePreview',
      name: lead.name,
      surname: lead.surname,
      phone: lead.phone,
      suburb: lead.suburb,
      street: lead.street,
      complex: lead.complex,
      address: lead.address,
      senderIdentity: senderSelect.value || 'Dawie'
    });
    previewTextarea.value = data.message || '';
    waBtn.dataset.url = data.whatsappUrl || '';
  } catch (err) {
    previewTextarea.value = 'Could not load WhatsApp script.';
    waBtn.dataset.url = '';
  }
}

function renderCards() {
  if (!state.leads.length) {
    el.cards.innerHTML = '<div class="empty">No contacts found. Try syncing or changing filters.</div>';
    return;
  }

  el.cards.innerHTML = '';

  state.leads.forEach(lead => {
    const node = el.cardTemplate.content.cloneNode(true);
    const card = node.querySelector('.card');
    const name = node.querySelector('.name');
    const address = node.querySelector('.address');
    const statusPill = node.querySelector('.status-pill');
    const metaGrid = node.querySelector('.meta-grid');
    const assignedSelect = node.querySelector('.assigned-select');
    const senderSelect = node.querySelector('.sender-select');
    const intentSelect = node.querySelector('.intent-select');
    const statusSelect = node.querySelector('.status-select');
    const notesInput = node.querySelector('.notes-input');
    const preview = node.querySelector('.message-preview');
    const waBtn = node.querySelector('.whatsapp-btn');
    const copyBtn = node.querySelector('.copy-btn');
    const saveBtn = node.querySelector('.save-btn');
    const contactedBtn = node.querySelector('.contacted-btn');

    name.textContent = lead.fullName || 'Unnamed Contact';
    address.textContent = getAddress(lead);
    statusPill.textContent = lead.status || 'New';

    metaGrid.innerHTML = [
      metaBox('Phone', lead.phone),
      metaBox('Email', lead.email),
      metaBox('Suburb', lead.suburb),
      metaBox('Street', lead.street),
      metaBox('Complex', lead.complex),
      metaBox('Agency', lead.agency),
      metaBox('Assigned To', lead.assignedTo),
      metaBox('Last Contacted', lead.lastContacted)
    ].join('');

    fillSelect(assignedSelect, state.meta?.assignedTo || [], 'Select agent');
    fillSelect(senderSelect, state.meta?.senderIdentity || [], 'Select sender');
    fillSelect(intentSelect, state.meta?.intents || [], 'Select intent');
    fillSelect(statusSelect, state.meta?.statuses || [], 'Select status');

    assignedSelect.value = lead.assignedTo || '';
    senderSelect.value = lead.senderIdentity || lead.assignedTo || 'Dawie';
    intentSelect.value = lead.intent || '';
    statusSelect.value = lead.status || 'New';
    notesInput.value = lead.notes || '';

    updatePreview(lead, senderSelect, preview, waBtn);
    senderSelect.addEventListener('change', () => updatePreview(lead, senderSelect, preview, waBtn));

    waBtn.addEventListener('click', () => {
      const url = waBtn.dataset.url;
      if (!url) {
        alert('No WhatsApp link available for this contact.');
        return;
      }
      window.open(url, '_blank');
    });

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(preview.value || '');
        alert('WhatsApp script copied.');
      } catch {
        alert('Could not copy the script.');
      }
    });

    const saveLead = async (touchLead = false) => {
      await postRequest({
        action: 'updateLead',
        rowNumber: lead.rowNumber,
        assignedTo: assignedSelect.value,
        senderIdentity: senderSelect.value,
        intent: intentSelect.value,
        status: statusSelect.value,
        notes: notesInput.value,
        touchLead
      });
      setStatus('Lead updated successfully.');
      await syncAll(false);
    };

    saveBtn.addEventListener('click', () => saveLead(false));
    contactedBtn.addEventListener('click', async () => {
      statusSelect.value = 'Contacted';
      await saveLead(true);
    });

    el.cards.appendChild(node);
  });
}

function clearFilters() {
  el.searchInput.value = '';
  el.suburbFilter.value = '';
  el.streetFilter.value = '';
  el.complexFilter.value = '';
  el.agencyFilter.value = '';
  el.statusFilter.value = '';
  el.intentFilter.value = '';
  el.assignedFilter.value = '';
}

async function syncAll(showMessage = true) {
  try {
    saveApiUrl();
    setStatus('Syncing...');
    await loadMeta();
    await loadLeads();
    if (showMessage) setStatus('Connected and synced.');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Connection failed.', true);
    el.cards.innerHTML = '<div class="empty">Connection failed. Check the Apps Script deployment, sharing settings, and sheet tab names.</div>';
  }
}

el.saveApiBtn.addEventListener('click', () => {
  saveApiUrl();
  setStatus('Backend URL saved.');
});
el.syncBtn.addEventListener('click', () => syncAll(true));
el.loadBtn.addEventListener('click', () => loadLeads().catch(err => setStatus(err.message, true)));
el.clearBtn.addEventListener('click', async () => {
  clearFilters();
  await loadLeads().catch(err => setStatus(err.message, true));
});
el.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadLeads().catch(err => setStatus(err.message, true));
});

restoreApiUrl();
syncAll(true);
