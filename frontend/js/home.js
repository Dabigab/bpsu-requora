/* ReQuora — home page: live statistics and the latest reports */

function countUp(el, target) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || target < 2) {
    el.textContent = target.toLocaleString();
    return;
  }
  const start = performance.now();
  const duration = 700;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function loadHomeStats() {
  try {
    const { stats } = await apiRequest('/stats');
    ['lost', 'found', 'returned', 'active'].forEach((key) => {
      const el = document.getElementById(`stat-${key}`);
      if (el) countUp(el, stats[key] || 0);
    });
  } catch (err) {
    // Show dashes instead of fake numbers when the server cannot be reached.
    const strip = document.getElementById('home-stats');
    if (strip) strip.classList.add('stats-offline');
  }
}

async function loadRecent() {
  const grid = document.getElementById('recent-grid');
  grid.innerHTML = skeletonCards(3);
  try {
    const data = await apiRequest('/items', { query: { limit: 6 }, auth: !!getToken() });
    if (!data.items.length) {
      grid.innerHTML = `<div class="grid-span">${stateBlock({
        iconName: 'box',
        title: 'No reports yet',
        text: 'Be the first to report a lost or found item.',
        actionHtml: '<a class="btn btn-primary btn-sm" href="report.html">Report an item</a>',
      })}</div>`;
      hydrateIcons(grid);
      return;
    }
    grid.innerHTML = data.items.map(itemCardHtml).join('');
  } catch (err) {
    grid.innerHTML = `<div class="grid-span">${errorState(err, { retryId: 'retry-recent' })}</div>`;
    const retry = document.getElementById('retry-recent');
    if (retry) retry.addEventListener('click', loadRecent);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout('home');

  loadHomeStats();
  loadRecent();
});
