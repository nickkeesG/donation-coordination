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
          <span class="pct-box"><input type="number" min="0" max="100" value="${Math.round(val)}" data-area="${area}">%</span>
          <button type="button" class="step-btn" data-delta="1">+1</button>
          <button type="button" class="step-btn" data-delta="10">+10</button>
        </div>
      `;
      container.appendChild(row);

      const input = row.querySelector('input[type="number"]');
      inputs[area] = input;

      function clampAndUpdate() {
        // Sum all other inputs in this group
        let othersTotal = 0;
        for (const a of causeAreas) {
          if (a !== area) othersTotal += parseInt(inputs[a].value) || 0;
        }
        const maxAllowed = 100 - othersTotal;
        let v = parseInt(input.value) || 0;
        v = Math.max(0, Math.min(maxAllowed, v));
        input.value = v;
        updateTotal(containerId, totalId);
      }

      input.addEventListener('input', clampAndUpdate);

      row.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          let othersTotal = 0;
          for (const a of causeAreas) {
            if (a !== area) othersTotal += parseInt(inputs[a].value) || 0;
          }
          const maxAllowed = 100 - othersTotal;
          let v = parseInt(input.value) || 0;
          v = Math.max(0, Math.min(maxAllowed, v + parseInt(btn.dataset.delta)));
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

  // Set donation amount, anon toggle, and display name
  document.getElementById('donation-amount').value = me.donation_amount || 0;
  document.getElementById('is-anon').checked = !me.is_public;
  document.getElementById('display-name').value = me.display_name || '';

  // Show/hide name field based on anon toggle
  function updateNameFieldVisibility() {
    document.getElementById('name-field').hidden = document.getElementById('is-anon').checked;
  }
  document.getElementById('is-anon').addEventListener('change', updateNameFieldVisibility);
  updateNameFieldVisibility();

  // Unsaved changes tracking - compare current form state to saved values
  let savedState = getFormState();

  function getFormState() {
    const planned = {};
    const ideal = {};
    for (const area of causeAreas) {
      planned[area] = parseInt(plannedSliders[area].value) || 0;
      ideal[area] = parseInt(idealSliders[area].value) || 0;
    }
    return {
      donation_amount: parseFloat(document.getElementById('donation-amount').value) || 0,
      is_anon: document.getElementById('is-anon').checked,
      display_name: document.getElementById('display-name').value.trim(),
      planned,
      ideal,
    };
  }

  function checkDirty() {
    const current = getFormState();
    const dirty = JSON.stringify(current) !== JSON.stringify(savedState);
    document.getElementById('unsaved-banner').hidden = !dirty;
    document.getElementById('save-btn').classList.toggle('dirty', dirty);
    if (dirty) {
      document.getElementById('save-status').textContent = '';
    }
  }

  function markClean() {
    savedState = getFormState();
    checkDirty();
  }

  document.getElementById('donation-amount').addEventListener('input', checkDirty);
  document.getElementById('is-anon').addEventListener('change', checkDirty);
  document.getElementById('display-name').addEventListener('input', checkDirty);
  document.querySelectorAll('.step-btn').forEach(btn => btn.addEventListener('click', () => setTimeout(checkDirty, 0)));
  document.querySelectorAll('.stepper input[type="number"]').forEach(inp => inp.addEventListener('input', checkDirty));

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

    if (!document.getElementById('is-anon').checked && !document.getElementById('display-name').value.trim()) {
      document.getElementById('save-status').textContent = 'Please enter a display name, or choose to be anonymous';
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
        is_public: !document.getElementById('is-anon').checked,
        display_name: document.getElementById('display-name').value.trim(),
        items,
      }),
    });

    if (res.ok) {
      document.getElementById('save-status').textContent = 'Saved!';
      document.getElementById('save-status').style.color = '#16a34a';
      markClean();
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

    document.getElementById('total-amount').textContent = data.total.toLocaleString();
    document.getElementById('num-donors').textContent = data.num_donors;

    const myIdeal = getMyIdealPcts();

    // Use a single scale across all rows so bars are comparable
    let globalMax = 1;
    for (const item of data.items) {
      const myIdealPct = myIdeal[item.cause_area] || 0;
      globalMax = Math.max(globalMax, item.planned_pct, myIdealPct, item.ideal_pct);
    }

    // Desktop chart
    const chart = document.getElementById('aggregate-chart');
    chart.innerHTML = '';

    const cards = document.getElementById('aggregate-cards');
    cards.innerHTML = '';

    for (const item of data.items) {
      const myIdealPct = myIdeal[item.cause_area] || 0;

      // Desktop bar chart
      const row = document.createElement('div');
      row.className = 'agg-row';
      const plannedW = globalMax > 0 ? (item.planned_pct / globalMax) * 85 : 0;
      const myIdealW = globalMax > 0 ? (myIdealPct / globalMax) * 85 : 0;
      const idealW = globalMax > 0 ? (item.ideal_pct / globalMax) * 85 : 0;
      row.innerHTML = `
        <div class="agg-row-label">${item.cause_area}</div>
        <div class="agg-bar-row">
          <span class="bar bar-planned" style="width:${plannedW}%"></span>
          <span class="agg-bar-pct">${item.planned_pct.toFixed(1)}%</span>
        </div>
        <div class="agg-bar-row">
          <span class="bar bar-my-ideal" style="width:${myIdealW}%"></span>
          <span class="agg-bar-pct">${myIdealPct}%</span>
        </div>
        <div class="agg-bar-row">
          <span class="bar bar-ideal" style="width:${idealW}%"></span>
          <span class="agg-bar-pct">${item.ideal_pct.toFixed(1)}%</span>
        </div>
      `;
      chart.appendChild(row);

      // Mobile card
      const card = document.createElement('div');
      card.className = 'agg-card';
      card.innerHTML = `
        <div class="agg-card-header">${item.cause_area}</div>
        <div class="agg-card-numbers">
          <span>Actual: ${item.planned_pct.toFixed(1)}%</span>
          <span>My Ideal: ${myIdealPct}%</span>
          <span>Avg: ${item.ideal_pct.toFixed(1)}%</span>
        </div>
        <div class="agg-card-bars">
          <span class="bar bar-planned" style="width:${(item.planned_pct / globalMax) * 100}%"></span><br>
          <span class="bar bar-my-ideal" style="width:${(myIdealPct / globalMax) * 100}%"></span><br>
          <span class="bar bar-ideal" style="width:${(item.ideal_pct / globalMax) * 100}%"></span>
        </div>
      `;
      cards.appendChild(card);
    }
  }

  // Load public donations
  async function loadDonations() {
    const res = await apiFetch(basePath + '/api/donations');
    const data = await res.json();
    const tbody = document.querySelector('#donations-table tbody');
    tbody.innerHTML = '';
    const cards = document.getElementById('donations-cards');
    cards.innerHTML = '';

    if (data.privacy_active) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#888;font-style:italic">Individual donations are hidden until at least 3 donors choose to be anonymous (to prevent identification by process of elimination).</td>';
      tbody.appendChild(tr);
      cards.innerHTML = '<div class="donation-card-message">Individual donations are hidden until at least 3 donors choose to be anonymous (to prevent identification by process of elimination).</div>';
      return;
    }

    if (data.donations.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:#888;font-style:italic">No public donations yet.</td>';
      tbody.appendChild(tr);
      cards.innerHTML = '<div class="donation-card-message">No public donations yet.</div>';
      return;
    }

    for (const d of data.donations) {
      const alloc = d.items.map(i => `${i.cause_area}: ${i.planned_pct}%`).join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.name}</td>
        <td>$${d.donation_amount.toLocaleString()}</td>
        <td style="font-size:12px">${alloc}</td>
      `;
      tbody.appendChild(tr);

      // Mobile card
      const card = document.createElement('div');
      card.className = 'donation-card';
      card.innerHTML = `
        <div class="donation-card-header">
          <span>${d.name}</span>
          <span>$${d.donation_amount.toLocaleString()}</span>
        </div>
        <div class="donation-card-alloc">${d.items.map(i => `${i.cause_area}: ${i.planned_pct}%`).join(' · ')}</div>
      `;
      cards.appendChild(card);
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

  // Reload data when tab becomes visible (SSE may have dropped while idle)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadAggregate();
      loadDonations();
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(basePath + '/auth/logout', { method: 'POST' });
    window.location.href = basePath + '/';
  });
})();
