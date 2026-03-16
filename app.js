const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbyClE0Hl_ZNRM7YY4BKXSeXaDs8V7F5LKS7EBTizvPXfTtI7pvF6fjq87_fud6ccxCC/exec';

const state = {
  meta: null,
  leads: []
};

const els = {
  apiUrl: document.getElementById('apiUrl'),
  saveApiBtn: document.getElementById('saveApiBtn'),
  syncBtn: document.getElementById('syncBtn'),
  searchInput: document.getElementById('searchInput'),
  suburbFilter: document.getElementById('suburbFilter'),
  streetFilter: document.getElementById('streetFilter'),
  complexFilter: document.getElementById('complexFilter'),
  agencyFilter: document.getElementById('agencyFilter'),
  statusFilter: document.getElementById('statusFilter'),
  intentFilter: document.getElementById('intentFilter'),
  assignedToFilter: document.getElementById('assignedToFilter'),
  searchBtn: document.getElementById('searchBtn'),
  resetBtn: document.getElementById('resetBtn'),
  leadGrid: document.getElementById('leadGrid'),
  totalLeads: document.getElementById('totalLeads'),
  newLeads: document.getElementById('newLeads'),
  followLeads: document.getElementById('followLeads'),
  removeLeads: document.getElementById('removeLeads'),
  subTitle: document.getElementById('subTitle')
};

function restoreApiUrl() {
  const saved = localStorage.getItem('blueLilyApiUrl') || DEFAULT_API_URL;
  els.apiUrl.value = saved;
}

function saveApiUrl() {
  const value = els.apiUrl.value.trim() || DEFAULT_API_URL;
  localStorage.setItem('blueLilyApiUrl', value);
  els.apiUrl.value = value;
}

async function apiRequest(payload) {
  const url = els.apiUrl.value.trim();
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

function fillSelect(selectEl, items, defaultText) {
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${defaultText}</option>`;
  (items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
  if ([...selectEl.options].some(o => o.value === current)) {
    selectEl.value = current;
  }
}

async function loadMeta() {
  const data = await apiRequest({ action: 'getMeta' });
  state.meta = data;

  fillSelect(els.suburbFilter, data.suburbs, 'All suburbs');
  fillSelect(els.streetFilter, data.streets, 'All streets');
  fillSelect(els.complexFilter, data.complexes, 'All complexes');
  fillSelect(els.agencyFilter, data.agencies, 'All agencies');
  fillSelect(els.statusFilter, data.statuses, 'All statuses');
  fillSelect(els.intentFilter, data.intents, 'All intents');
  fillSelect(els.assignedToFilter, data.assignedTo, 'All agents');

  if (data.brand?.companyName) {
    els.subTitle.textContent = `Connected to ${data.brand.companyName}.`;
  }
}

async function loadLeads() {
  const data = await apiRequest({
    action: 'getLeads',
    q: els.searchInput.value.trim(),
    suburb: els.suburbFilter.value,
    street: els.streetFilter.value,
    complex: els.complexFilter.value,
    agency: els.agencyFilter.value,
    status: els.statusFilter.value,
    assignedTo: els.assignedToFilter.value,
    intent: els.intentFilter.value
  });

  state.leads = data.leads || [];
  renderStats();
  renderLeads();
}

function renderStats() {
  const leads = state.leads;
  els.totalLeads.textContent = leads.length;
  els.newLeads.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'new').length;
  els.followLeads.textContent = leads.filter(l => (l.status || '').toLowerCase() === 'follow up').length;
  els.removeLeads.textContent = leads.filter(l => ((l.status || '').toLowerCase() === 'remove from database') || ((l.intent || '').toLowerCase() === 'remove from database')).length;
}

function leadAddress(lead) {
  return lead.address || [lead.complex, lead.street, lead.suburb].filter(Boolean).join(', ') || 'No address loaded';
}

function metaBlock(label, value) {
  return `<div class="meta-block"><small>${label}</small><div>${escapeHtml(value || '-')}</div></div>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function buildMessagePreview(lead, senderIdentity) {
  const data = await apiRequest({
    action: 'getMessagePreview',
    name: lead.name,
    surname: lead.surname,
    phone: lead.phone,
    suburb: lead.suburb,
    street: lead.street,
    complex: lead.complex,
    address: lead.address,
    senderIdentity
  });
  return data;
}

function renderLeads() {
  if (!state.leads.length) {
    els.leadGrid.innerHTML = '<div class="empty-state">No leads found for the current filters.</div>';
    return;
  }

  els.leadGrid.innerHTML = '';
  const tpl = document.getElementById('leadCardTemplate');

  state.leads.forEach(lead => {
    const node = tpl.content.cloneNode(true);

    node.querySelector('.lead-name').textContent = lead.fullName || 'Unnamed Lead';
    node.querySelector('.lead-address').textContent = leadAddress(lead);
    node.querySelector('.status-pill').textContent = lead.status || 'New';

    node.querySelector('.lead-meta').innerHTML = [
      metaBlock('Phone', lead.phone),
      metaBlock('Email', lead.email),
      metaBlock('Suburb', lead.suburb),
      metaBlock('Street', lead.street),
      metaBlock('Complex', lead.complex),
      metaBlock('Agency', lead.agency),
      metaBlock('Assigned To', lead.assignedTo),
      metaBlock('Last Contacted', lead.lastContacted)
    ].join('');

    const assignedSelect = node.querySelector('.assigned-select');
    const senderSelect = node.querySelector('.sender-select');
    const intentSelect = node.querySelector('.intent-select');
    const statusSelect = node.querySelector('.status-select');
    const notesInput = node.querySelector('.notes-input');
    const messagePreview = node.querySelector('.message-preview');
    const openWaBtn = node.querySelector('.open-wa-btn');
    const copyBtn = node.querySelector('.copy-btn');
    const saveBtn = node.querySelector('.save-btn');
    const touchBtn = node.querySelector('.touch-btn');

    fillSelect(assignedSelect, state.meta?.assignedTo || [], 'Select agent');
    fillSelect(senderSelect, state.meta?.senderIdentity || [], 'Select sender');
    fillSelect(intentSelect, state.meta?.intents || [], 'Select intent');
    fillSelect(statusSelect, state.meta?.statuses || [], 'Select status');

    assignedSelect.value = lead.assignedTo || '';
    senderSelect.value = lead.senderIdentity || lead.assignedTo || 'Dawie';
    intentSelect.value = lead.intent || '';
    statusSelect.value = lead.status || 'New';
    notesInput.value = lead.notes || '';

    const refreshPreview = async () => {
      try {
        const preview = await buildMessagePreview(lead, senderSelect.value || 'Dawie');
        messagePreview.value = preview.message || '';
        openWaBtn.dataset.url = preview.whatsappUrl || '';
      } catch (err) {
        messagePreview.value = 'Could not load message preview.';
      }
    };

    senderSelect.addEventListener('change', refreshPreview);
    refreshPreview();

    openWaBtn.addEventListener('click', () => {
      const url = openWaBtn.dataset.url;
      if (!url) return alert('No WhatsApp link available for this lead.');
      window.open(url, '_blank');
    });

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(messagePreview.value || '');
        alert('Message copied.');
      } catch {
        alert('Could not copy the message.');
      }
    });

    const saveLead = async (touchLead = false) => {
      await apiRequest({
        action: 'updateLead',
        rowNumber: lead.rowNumber,
        status: statusSelect.value,
        notes: notesInput.value,
        assignedTo: assignedSelect.value,
        senderIdentity: senderSelect.value,
        intent: intentSelect.value,
        touchLead
      });
      await loadMeta();
      await loadLeads();
      alert('Lead updated.');
    };

    saveBtn.addEventListener('click', () => saveLead(false));
    touchBtn.addEventListener('click', () => saveLead(true));

    els.leadGrid.appendChild(node);
  });
}

function resetFilters() {
  els.searchInput.value = '';
  els.suburbFilter.value = '';
  els.streetFilter.value = '';
  els.complexFilter.value = '';
  els.agencyFilter.value = '';
  els.statusFilter.value = '';
  els.intentFilter.value = '';
  els.assignedToFilter.value = '';
}

async function syncAll() {
  saveApiUrl();
  await loadMeta();
  await loadLeads();
}

els.saveApiBtn.addEventListener('click', () => {
  saveApiUrl();
  alert('Backend URL saved.');
});
els.syncBtn.addEventListener('click', syncAll);
els.searchBtn.addEventListener('click', loadLeads);
els.resetBtn.addEventListener('click', async () => {
  resetFilters();
  await loadLeads();
});
els.searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadLeads();
});

restoreApiUrl();
syncAll().catch(err => {
  console.error(err);
  els.leadGrid.innerHTML = `<div class="empty-state">Connection failed. Check the Apps Script URL and deployment settings.</div>`;
});
