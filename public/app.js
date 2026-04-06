(async function () {
  let causeAreas = [];

  // Check auth - redirect to login if not authenticated
  async function apiFetch(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Not authenticated');
    }
    return res;
  }

  // Load cause areas
  const caRes = await fetch('/api/cause-areas');
  causeAreas = await caRes.json();

  // Load current user data
  const meRes = await apiFetch('/api/me');
  const me = await meRes.json();

  // Populate user info
  const sessionEmail = me.email || '';
  document.getElementById('user-email').textContent = sessionEmail ? `Logged in as ${sessionEmail}` : '';

  // Build sliders for a group
  function buildSliders(containerId, totalId, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const sliders = {};

    for (const area of causeAreas) {
      const existing = me.items ? me.items.find(i => i.cause_area === area) : null;
      const val = existing ? existing[type] : 0;

      const row = document.createElement('div');
      row.className = 'cause-row';
      row.innerHTML = `
        <span class="name">${area}</span>
        <input type="range" min="0" max="100" value="${val}" data-area="${area}">
        <span class="value">${Math.round(val)}%</span>
      `;
      container.appendChild(row);

      const slider = row.querySelector('input[type="range"]');
      const display = row.querySelector('.value');
      sliders[area] = slider;

      slider.addEventListener('input', () => {
        display.textContent = `${slider.value}%`;
        updateTotal(containerId, totalId);
      });
    }

    updateTotal(containerId, totalId);
    return sliders;
  }

  function updateTotal(containerId, totalId) {
    const sliders = document.getElementById(containerId).querySelectorAll('input[type="range"]');
    let sum = 0;
    sliders.forEach(s => sum += parseInt(s.value));
    const el = document.getElementById(totalId);
    el.textContent = sum;
    el.style.color = sum === 100 ? '#16a34a' : '#dc2626';
  }

  const plannedSliders = buildSliders('planned-sliders', 'planned-total', 'planned_pct');
  const idealSliders = buildSliders('ideal-sliders', 'ideal-total', 'ideal_pct');

  // Set donation amount and public toggle
  document.getElementById('donation-amount').value = me.donation_amount || 0;
  document.getElementById('is-public').checked = !!me.is_public;

  // Save
  document.getElementById('save-btn').addEventListener('click', async () => {
    const items = causeAreas.map(area => ({
      cause_area: area,
      planned_pct: parseInt(plannedSliders[area].value),
      ideal_pct: parseInt(idealSliders[area].value),
    }));

    const plannedSum = items.reduce((s, i) => s + i.planned_pct, 0);
    const idealSum = items.reduce((s, i) => s + i.ideal_pct, 0);

    if (plannedSum !== 100 || idealSum !== 100) {
      document.getElementById('save-status').textContent = 'Both allocations must sum to 100%';
      document.getElementById('save-status').style.color = '#dc2626';
      return;
    }

    const res = await apiFetch('/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donation_amount: parseFloat(document.getElementById('donation-amount').value) || 0,
        is_public: document.getElementById('is-public').checked,
        items,
      }),
    });

    if (res.ok) {
      document.getElementById('save-status').textContent = 'Saved!';
      document.getElementById('save-status').style.color = '#16a34a';
      loadAggregate();
      loadDonations();
    } else {
      const err = await res.json();
      document.getElementById('save-status').textContent = err.error || 'Save failed';
      document.getElementById('save-status').style.color = '#dc2626';
    }
  });

  // Get current user's ideal percentages from sliders
  function getMyIdealPcts() {
    const pcts = {};
    for (const area of causeAreas) {
      pcts[area] = parseInt(idealSliders[area].value);
    }
    return pcts;
  }

  // Load aggregate
  async function loadAggregate() {
    const res = await apiFetch('/api/aggregate');
    const data = await res.json();
    const tbody = document.querySelector('#aggregate-table tbody');
    tbody.innerHTML = '';

    document.getElementById('total-amount').textContent = data.total.toLocaleString();

    const myIdeal = getMyIdealPcts();

    for (const item of data.items) {
      const myIdealPct = myIdeal[item.cause_area] || 0;
      const tr = document.createElement('tr');
      const maxPct = Math.max(item.planned_pct, myIdealPct, item.ideal_pct, 1);
      const scale = 150 / maxPct;
      tr.innerHTML = `
        <td>${item.cause_area}</td>
        <td>${item.planned_pct.toFixed(1)}%</td>
        <td>${myIdealPct}%</td>
        <td>${item.ideal_pct.toFixed(1)}%</td>
        <td>
          <span class="bar bar-planned" style="width:${item.planned_pct * scale}px"></span><br>
          <span class="bar bar-my-ideal" style="width:${myIdealPct * scale}px"></span><br>
          <span class="bar bar-ideal" style="width:${item.ideal_pct * scale}px"></span>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Load public donations
  async function loadDonations() {
    const res = await apiFetch('/api/donations');
    const data = await res.json();
    const tbody = document.querySelector('#donations-table tbody');
    tbody.innerHTML = '';

    for (const d of data) {
      const tr = document.createElement('tr');
      const alloc = d.items.map(i => `${i.cause_area}: ${i.planned_pct}%`).join(', ');
      tr.innerHTML = `
        <td>${d.email}</td>
        <td>$${d.donation_amount.toLocaleString()}</td>
        <td style="font-size:12px">${alloc}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Initial load
  loadAggregate();
  loadDonations();

  // SSE for real-time updates
  const events = new EventSource('/api/events');
  events.addEventListener('update', () => {
    loadAggregate();
    loadDonations();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
})();
