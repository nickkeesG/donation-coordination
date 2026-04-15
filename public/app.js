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

  // Load cause areas (structured by category)
  const caRes = await fetch(basePath + '/api/cause-areas');
  const caData = await caRes.json();
  const causeAreaCategories = caData.categories;
  const fundLinks = caData.links || {};
  causeAreas = causeAreaCategories.flatMap(c => c.funds);

  // Load current user data
  const meRes = await apiFetch(basePath + '/api/me');
  const me = await meRes.json();

  // Populate user info
  const sessionEmail = me.email || '';
  document.getElementById('user-email').textContent = sessionEmail ? `Logged in as ${sessionEmail}` : '';

  // Build number inputs with +/- buttons for a group, organized by category
  function buildInputs(containerId, totalId, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const inputs = {};

    for (const cat of causeAreaCategories) {
      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = cat.category;
      container.appendChild(header);

      for (const area of cat.funds) {
        const existing = me.items ? me.items.find(i => i.cause_area === area) : null;
        const val = existing ? existing[type] : 0;

        const row = document.createElement('div');
        row.className = 'cause-row';
        row.innerHTML = `
          <span class="name">${fundLinks[area] ? `<a href="${fundLinks[area]}" target="_blank" rel="noopener" class="fund-link">${area}</a>` : area}</span>
          <div class="stepper">
            <button type="button" class="step-btn" data-delta="-10">-10</button>
            <button type="button" class="step-btn" data-delta="-1">-1</button>
            <span class="pct-box"><input type="number" min="0" value="${Math.round(val)}" data-area="${area}">%</span>
            <button type="button" class="step-btn" data-delta="1">+1</button>
            <button type="button" class="step-btn" data-delta="10">+10</button>
          </div>
        `;
        container.appendChild(row);

        const input = row.querySelector('input[type="number"]');
        inputs[area] = input;

        function onUpdate() {
          let v = parseInt(input.value) || 0;
          if (v < 0) { v = 0; input.value = v; }
          updateTotal(containerId, totalId);
        }

        input.addEventListener('input', onUpdate);

        row.querySelectorAll('.step-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            let v = parseInt(input.value) || 0;
            v = Math.max(0, v + parseInt(btn.dataset.delta));
            input.value = v;
            onUpdate();
          });
        });
      }
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

  const idealSliders = buildInputs('ideal-sliders', 'ideal-total', 'ideal_pct');
  const plannedSliders = buildInputs('planned-sliders', 'planned-total', 'planned_pct');

  // Determine if existing user has different planned vs ideal values
  let plannedDiffers = false;
  if (me.items && me.items.length > 0) {
    plannedDiffers = me.items.some(i => Math.round(i.planned_pct) !== Math.round(i.ideal_pct));
  }
  document.getElementById('diff-planned').checked = plannedDiffers;
  document.getElementById('planned-section').hidden = !plannedDiffers;

  // Show/hide planned section based on checkbox
  document.getElementById('diff-planned').addEventListener('change', () => {
    const checked = document.getElementById('diff-planned').checked;
    if (checked) {
      // Copy ideal values into planned fields as starting point
      for (const area of causeAreas) {
        plannedSliders[area].value = idealSliders[area].value;
      }
      updateTotal('planned-sliders', 'planned-total');
    }
    document.getElementById('planned-section').hidden = !checked;
    checkDirty();
  });

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
    const diffPlanned = document.getElementById('diff-planned').checked;
    for (const area of causeAreas) {
      ideal[area] = parseInt(idealSliders[area].value) || 0;
      planned[area] = diffPlanned ? (parseInt(plannedSliders[area].value) || 0) : ideal[area];
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
    const diffPlanned = document.getElementById('diff-planned').checked;
    const items = causeAreas.map(area => ({
      cause_area: area,
      ideal_pct: parseInt(idealSliders[area].value),
      planned_pct: diffPlanned ? parseInt(plannedSliders[area].value) : parseInt(idealSliders[area].value),
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

    const idealSum = items.reduce((s, i) => s + i.ideal_pct, 0);

    if (idealSum !== 100) {
      document.getElementById('save-status').textContent = `Ideal allocation is ${idealSum}% — must sum to 100%`;
      document.getElementById('save-status').style.color = '#dc2626';
      return;
    }

    if (diffPlanned) {
      const plannedSum = items.reduce((s, i) => s + i.planned_pct, 0);
      if (plannedSum !== 100) {
        document.getElementById('save-status').textContent = `Planned allocation is ${plannedSum}% — must sum to 100%`;
        document.getElementById('save-status').style.color = '#dc2626';
        return;
      }
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
      pcts[area] = parseInt(idealSliders[area].value) || 0;
    }
    return pcts;
  }

  // Helper to render 3 bars (Actual, Avg. Ideal, My Ideal) and return HTML
  function renderBars(planned, ideal, myIdealPct, globalMax) {
    const plannedW = globalMax > 0 ? (planned / globalMax) * 100 : 0;
    const idealW = globalMax > 0 ? (ideal / globalMax) * 100 : 0;
    const myIdealW = globalMax > 0 ? (myIdealPct / globalMax) * 100 : 0;
    return `
      <div class="agg-bar-row">
        <span class="agg-bar-label">Actual</span>
        <div class="agg-bar-track"><span class="bar bar-planned" style="width:${plannedW}%"></span><span class="agg-bar-pct">${planned.toFixed(1)}%</span></div>
      </div>
      <div class="agg-bar-row">
        <span class="agg-bar-label">Avg. Ideal</span>
        <div class="agg-bar-track"><span class="bar bar-ideal" style="width:${idealW}%"></span><span class="agg-bar-pct">${ideal.toFixed(1)}%</span></div>
      </div>
      <div class="agg-bar-row">
        <span class="agg-bar-label">My Ideal</span>
        <div class="agg-bar-track"><span class="bar bar-my-ideal" style="width:${myIdealW}%"></span><span class="agg-bar-pct">${myIdealPct.toFixed(1)}%</span></div>
      </div>
    `;
  }

  // Load aggregate
  async function loadAggregate() {
    const res = await apiFetch(basePath + '/api/aggregate');
    const data = await res.json();

    document.getElementById('total-amount').textContent = data.total.toLocaleString();
    document.getElementById('num-donors').textContent = data.num_donors;

    const myIdeal = getMyIdealPcts();
    const itemMap = Object.fromEntries(data.items.map(i => [i.cause_area, i]));

    // Compute category-level sums for globalMax calculation
    const catSums = causeAreaCategories.map(cat => {
      let planned = 0, ideal = 0, myI = 0;
      for (const f of cat.funds) {
        const item = itemMap[f] || { planned_pct: 0, ideal_pct: 0 };
        planned += item.planned_pct;
        ideal += item.ideal_pct;
        myI += (myIdeal[f] || 0);
      }
      return { planned, ideal, myI };
    });

    // globalMax from category sums (always >= individual fund values)
    let globalMax = 1;
    for (const s of catSums) {
      globalMax = Math.max(globalMax, s.planned, s.ideal, s.myI);
    }

    // Desktop chart
    const chart = document.getElementById('aggregate-chart');
    chart.innerHTML = '';

    // Mobile cards
    const cards = document.getElementById('aggregate-cards');
    cards.innerHTML = '';

    causeAreaCategories.forEach((cat, ci) => {
      const cs = catSums[ci];

      // --- Desktop: category row ---
      const catRow = document.createElement('div');
      catRow.className = 'agg-category';
      catRow.innerHTML = `<div class="agg-row-label">${cat.category}</div>` + renderBars(cs.planned, cs.ideal, cs.myI, globalMax);
      chart.appendChild(catRow);

      const fundsContainer = document.createElement('div');
      fundsContainer.className = 'agg-category-funds';
      fundsContainer.hidden = true;

      for (const fund of cat.funds) {
        const item = itemMap[fund] || { planned_pct: 0, ideal_pct: 0 };
        const myIdealPct = myIdeal[fund] || 0;
        const fundRow = document.createElement('div');
        fundRow.className = 'agg-fund-row';
        fundRow.innerHTML = `<div class="agg-row-label">${fund}</div>` + renderBars(item.planned_pct, item.ideal_pct, myIdealPct, globalMax);
        fundsContainer.appendChild(fundRow);
      }
      chart.appendChild(fundsContainer);

      catRow.addEventListener('click', () => {
        fundsContainer.hidden = !fundsContainer.hidden;
        catRow.classList.toggle('expanded');
      });

      // --- Mobile: category card ---
      const catCard = document.createElement('div');
      catCard.className = 'agg-card agg-category-card';
      catCard.innerHTML = `<div class="agg-card-header">${cat.category}</div>` + renderBars(cs.planned, cs.ideal, cs.myI, globalMax).replace(/agg-bar-row/g, 'agg-card-bar-row');
      cards.appendChild(catCard);

      const fundsCards = document.createElement('div');
      fundsCards.className = 'agg-category-funds';
      fundsCards.hidden = true;

      for (const fund of cat.funds) {
        const item = itemMap[fund] || { planned_pct: 0, ideal_pct: 0 };
        const myIdealPct = myIdeal[fund] || 0;
        const fundCard = document.createElement('div');
        fundCard.className = 'agg-card agg-fund-card';
        fundCard.innerHTML = `<div class="agg-card-header">${fund}</div>` + renderBars(item.planned_pct, item.ideal_pct, myIdealPct, globalMax).replace(/agg-bar-row/g, 'agg-card-bar-row');
        fundsCards.appendChild(fundCard);
      }
      cards.appendChild(fundsCards);

      catCard.addEventListener('click', () => {
        fundsCards.hidden = !fundsCards.hidden;
        catCard.classList.toggle('expanded');
      });
    });
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
    window.location.replace(basePath + '/');
  });
})();
