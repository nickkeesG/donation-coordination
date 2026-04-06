(async function () {
  let causeAreas = [];

  // Detect base path from current URL (e.g. /dev/app.html -> /dev)
  const pathParts = window.location.pathname.split('/');
  pathParts.pop(); // remove filename
  const basePath = pathParts.join('/') || '';

  // Check auth - redirect to login if not authenticated
  async function apiFetch(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = basePath + '/';
      throw new Error('Not authenticated');
    }
    return res;
  }

  // Load cause areas
  const caRes = await fetch(basePath + '/api/cause-areas');
  causeAreas = await caRes.json();

  // Load current user data
  const meRes = await apiFetch(basePath + '/api/me');
  const me = await meRes.json();

  // Populate user info
  const sessionEmail = me.email || '';
  document.getElementById('user-email').textContent = sessionEmail ? `Logged in as ${sessionEmail}` : '';

  // Build number inputs with +/- buttons for a group
  function buildInputs(containerId, totalId, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const inputs = {};

    for (const area of causeAreas) {
      const existing = me.items ? me.items.find(i => i.cause_area === area) : null;
      const val = existing ? existing[type] : 0;

      const row = document.createElement('div');
      row.className = 'cause-row';
      row.innerHTML = `
        <span class="name">${area}</span>
        <div class="stepper">
          <button type="button" class="step-btn" data-delta="-10">-10</button>
          <button type="button" class="step-btn" data-delta="-1">-1</button>
          <input type="number" min="0" max="100" value="${Math.round(val)}" data-area="${area}">
          <button type="button" class="step-btn" data-delta="1">+1</button>
          <button type="button" class="step-btn" data-delta="10">+10</button>
        </div>
        <span class="value">${Math.round(val)}%</span>
      `;
      container.appendChild(row);

      const input = row.querySelector('input[type="number"]');
      const display = row.querySelector('.value');
      inputs[area] = input;

      function clampAndUpdate() {
        let v = parseInt(input.value) || 0;
        v = Math.max(0, Math.min(100, v));
        input.value = v;
        display.textContent = `${v}%`;
        updateTotal(containerId, totalId);
      }

      input.addEventListener('input', clampAndUpdate);

      row.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          let v = parseInt(input.value) || 0;
          v = Math.max(0, Math.min(100, v + parseInt(btn.dataset.delta)));
          input.value = v;
          clampAndUpdate();
        });
      });
    }

    updateTotal(containerId, totalId);
    return inputs;
  }

  function updateTotal(containerId, totalId) {
    const inputs = document.getElementById(containerId).querySelectorAll('input[type="number"]');
    let sum = 0;
    inputs.forEach(s => sum += parseInt(s.value) || 0);
    const el = document.getElementById(totalId);
    el.textContent = sum;
    el.style.color = sum === 100 ? '#16a34a' : '#dc2626';
  }

  const plannedSliders = buildInputs('planned-sliders', 'planned-total', 'planned_pct');
  const idealSliders = buildInputs('ideal-sliders', 'ideal-total', 'ideal_pct');

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

    const donationAmount = parseFloat(document.getElementById('donation-amount').value) || 0;
    if (donationAmount <= 0) {
      document.getElementById('save-status').textContent = 'Please enter a donation amount greater than 0';
      document.getElementById('save-status').style.color = '#dc2626';
      return;
    }

    const plannedSum = items.reduce((s, i) => s + i.planned_pct, 0);
    const idealSum = items.reduce((s, i) => s + i.ideal_pct, 0);

    if (plannedSum !== 100 || idealSum !== 100) {
      document.getElementById('save-status').textContent = 'Both allocations must sum to 100%';
      document.getElementById('save-status').style.color = '#dc2626';
      return;
    }

    const res = await apiFetch(basePath + '/api/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donation_amount: donationAmount,
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
    const res = await apiFetch(basePath + '/api/aggregate');
    const data = await res.json();
    const tbody = document.querySelector('#aggregate-table tbody');
    tbody.innerHTML = '';

    document.getElementById('total-amount').textContent = data.total.toLocaleString();

    const myIdeal = getMyIdealPcts();

    // Use a single scale across all rows so bars are comparable
    let globalMax = 1;
    for (const item of data.items) {
      const myIdealPct = myIdeal[item.cause_area] || 0;
      globalMax = Math.max(globalMax, item.planned_pct, myIdealPct, item.ideal_pct);
    }
    const scale = 150 / globalMax;

    for (const item of data.items) {
      const myIdealPct = myIdeal[item.cause_area] || 0;
      const tr = document.createElement('tr');
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
    const res = await apiFetch(basePath + '/api/donations');
    const data = await res.json();
    const tbody = document.querySelector('#donations-table tbody');
    tbody.innerHTML = '';

    if (data.privacy_active) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#888;font-style:italic">Individual donations are hidden until at least 3 donors choose to be anonymous (to prevent identification by process of elimination).</td>';
      tbody.appendChild(tr);
      return;
    }

    if (data.donations.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#888;font-style:italic">No public donations yet.</td>';
      tbody.appendChild(tr);
      return;
    }

    for (const d of data.donations) {
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
  const events = new EventSource(basePath + '/api/events');
  events.addEventListener('update', () => {
    loadAggregate();
    loadDonations();
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(basePath + '/auth/logout', { method: 'POST' });
    window.location.href = basePath + '/';
  });
})();
