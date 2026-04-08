(async function () {
  const pathParts = window.location.pathname.split('/');
  pathParts.pop();
  const basePath = pathParts.join('/') || '';

  async function loadAggregate() {
    const res = await fetch(basePath + '/api/aggregate');
    if (res.status === 401) {
      window.location.href = basePath + '/';
      return;
    }
    const data = await res.json();

    document.getElementById('total-amount').textContent = data.total.toLocaleString();

    const chart = document.getElementById('chart');
    chart.innerHTML = '';

    // Find global max for consistent bar scaling
    let globalMax = 1;
    for (const item of data.items) {
      globalMax = Math.max(globalMax, item.planned_pct, item.ideal_pct);
    }

    for (const item of data.items) {
      const row = document.createElement('div');
      row.className = 'row';

      const actualWidth = (item.planned_pct / globalMax) * 100;
      const idealWidth = (item.ideal_pct / globalMax) * 100;

      row.innerHTML = `
        <div class="row-label">${item.cause_area}</div>
        <div class="row-bars">
          <div class="bar-row">
            <div class="bar bar-actual" style="width:${actualWidth}%"></div>
            <span class="bar-pct">${item.planned_pct.toFixed(1)}%</span>
          </div>
          <div class="bar-row">
            <div class="bar bar-ideal" style="width:${idealWidth}%"></div>
            <span class="bar-pct">${item.ideal_pct.toFixed(1)}%</span>
          </div>
        </div>
      `;
      chart.appendChild(row);
    }
  }

  // Initial load
  await loadAggregate();

  // SSE for real-time updates
  const events = new EventSource(basePath + '/api/events');
  events.addEventListener('update', loadAggregate);
})();
