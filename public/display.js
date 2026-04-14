(async function () {
  const pathParts = window.location.pathname.split('/');
  pathParts.pop();
  const basePath = pathParts.join('/') || '';

  // Load cause area categories for grouping
  const caRes = await fetch(basePath + '/api/cause-areas');
  const causeAreaCategories = await caRes.json();

  // Helper to render 2 bars (Actual, Avg. Ideal) and return HTML
  function renderBars(planned, ideal, globalMax) {
    const actualWidth = globalMax > 0 ? (planned / globalMax) * 100 : 0;
    const idealWidth = globalMax > 0 ? (ideal / globalMax) * 100 : 0;
    return `
      <div class="row-bars">
        <div class="bar-row">
          <div class="bar bar-actual" style="width:${actualWidth}%"></div>
          <span class="bar-pct">${planned.toFixed(1)}%</span>
        </div>
        <div class="bar-row">
          <div class="bar bar-ideal" style="width:${idealWidth}%"></div>
          <span class="bar-pct">${ideal.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }

  async function loadAggregate() {
    const res = await fetch(basePath + '/api/aggregate');
    if (res.status === 401) {
      window.location.href = basePath + '/';
      return;
    }
    const data = await res.json();

    document.getElementById('total-amount').textContent = data.total.toLocaleString();
    document.getElementById('num-donors').textContent = data.num_donors;

    const itemMap = Object.fromEntries(data.items.map(i => [i.cause_area, i]));

    // Compute category-level sums
    const catSums = causeAreaCategories.map(cat => {
      let planned = 0, ideal = 0;
      for (const f of cat.funds) {
        const item = itemMap[f] || { planned_pct: 0, ideal_pct: 0 };
        planned += item.planned_pct;
        ideal += item.ideal_pct;
      }
      return { planned, ideal };
    });

    // globalMax across both panes so bars are comparable
    let globalMax = 1;
    for (const s of catSums) {
      globalMax = Math.max(globalMax, s.planned, s.ideal);
    }

    // Left pane: categories
    const catChart = document.getElementById('chart-categories');
    catChart.innerHTML = '';

    causeAreaCategories.forEach((cat, ci) => {
      const cs = catSums[ci];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="row-label">${cat.category}</div>` + renderBars(cs.planned, cs.ideal, globalMax);
      catChart.appendChild(row);
    });

    // Right pane: individual funds
    const fundChart = document.getElementById('chart-funds');
    fundChart.innerHTML = '';

    for (const cat of causeAreaCategories) {
      for (const fund of cat.funds) {
        const item = itemMap[fund] || { planned_pct: 0, ideal_pct: 0 };
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div class="row-label">${fund}</div>` + renderBars(item.planned_pct, item.ideal_pct, globalMax);
        fundChart.appendChild(row);
      }
    }
  }

  // Initial load
  await loadAggregate();

  // SSE for real-time updates
  const events = new EventSource(basePath + '/api/events');
  events.addEventListener('update', loadAggregate);

  // Reload data when tab becomes visible (SSE may have dropped while idle)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadAggregate();
  });
})();
