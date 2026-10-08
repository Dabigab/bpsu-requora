/* ReQuora — browse page: search, filters, pagination.
   The filters live in the address bar (?q=…&type=…) so a search can be
   bookmarked, shared, and survives a refresh. */

const PAGE_SIZE = 12;
const FILTER_KEYS = ['q', 'type', 'category', 'status', 'location', 'dateFrom', 'dateTo', 'sort'];

let state = { page: 1 };
let requestCounter = 0; // lets a slow older response be ignored

function readStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = { page: Math.max(1, parseInt(params.get('page'), 10) || 1) };
  FILTER_KEYS.forEach((k) => {
    next[k] = params.get(k) || '';
  });
  return next;
}

function writeStateToUrl() {
  const params = new URLSearchParams();
  FILTER_KEYS.forEach((k) => {
    if (state[k]) params.set(k, state[k]);
  });
  if (state.page > 1) params.set('page', state.page);
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

function applyStateToForm() {
  document.getElementById('f-q').value = state.q;
  document.getElementById('f-category').value = state.category;
  document.getElementById('f-status').value = state.status;
  document.getElementById('f-location').value = state.location;
  document.getElementById('f-from').value = state.dateFrom;
  document.getElementById('f-to').value = state.dateTo;
  document.getElementById('f-sort').value = state.sort;
  const radio = document.querySelector(`#f-type input[value="${state.type}"]`);
  if (radio) radio.checked = true;
  updateFilterCount();
}

// How many of the "More filters" are active (shown on the mobile toggle).
function updateFilterCount() {
  const n = ['category', 'status', 'location', 'dateFrom', 'dateTo', 'sort'].filter((k) => state[k]).length;
  const pill = document.getElementById('filters-count');
  pill.textContent = n;
  pill.hidden = n === 0;
}

function anyFilterActive() {
  return FILTER_KEYS.some((k) => state[k]);
}

async function loadResults() {
  const grid = document.getElementById('results');
  const countEl = document.getElementById('results-count');
  const myRequest = ++requestCounter;

  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = skeletonCards(PAGE_SIZE / 2);
  countEl.textContent = 'Loading reports…';

  try {
    const query = { limit: PAGE_SIZE, page: state.page };
    FILTER_KEYS.forEach((k) => {
      if (state[k]) query[k] = state[k];
    });
    const data = await apiRequest('/items', { query, auth: !!getToken() });
    if (myRequest !== requestCounter) return; // a newer search replaced this one

    state.page = data.pagination.page;
    writeStateToUrl();

    if (!data.items.length) {
      countEl.textContent = '0 reports';
      grid.innerHTML = `<div class="grid-span">${stateBlock({
        iconName: 'search',
        title: 'No items found',
        text: 'Try changing your search or filters.',
        actionHtml: anyFilterActive() ? '<button type="button" class="btn btn-outline btn-sm" id="empty-clear">Clear filters</button>' : '<a class="btn btn-primary btn-sm" href="report.html">Report an item</a>',
      })}</div>`;
      const clearBtn = document.getElementById('empty-clear');
      if (clearBtn) clearBtn.addEventListener('click', clearFilters);
      renderPagination(document.getElementById('pagination'), null);
    } else {
      const { total, page, limit } = data.pagination;
      const from = (page - 1) * limit + 1;
      countEl.textContent = `Showing ${from}–${from + data.items.length - 1} of ${total} report${total === 1 ? '' : 's'}`;
      grid.innerHTML = data.items.map(itemCardHtml).join('');
      renderPagination(document.getElementById('pagination'), data.pagination, (n) => {
        state.page = n;
        loadResults();
        document.getElementById('filters').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  } catch (err) {
    if (myRequest !== requestCounter) return;
    countEl.textContent = '';
    grid.innerHTML = `<div class="grid-span">${errorState(err, { retryId: 'retry-results' })}</div>`;
    hydrateIcons(grid);
    const retry = document.getElementById('retry-results');
    if (retry) retry.addEventListener('click', loadResults);
    renderPagination(document.getElementById('pagination'), null);
  } finally {
    if (myRequest === requestCounter) grid.setAttribute('aria-busy', 'false');
  }
}

function applyFiltersFromForm() {
  state.q = document.getElementById('f-q').value.trim();
  state.type = (document.querySelector('#f-type input:checked') || {}).value || '';
  state.category = document.getElementById('f-category').value;
  state.status = document.getElementById('f-status').value;
  state.location = document.getElementById('f-location').value.trim();
  state.dateFrom = document.getElementById('f-from').value;
  state.dateTo = document.getElementById('f-to').value;
  state.sort = document.getElementById('f-sort').value;
  state.page = 1;
  updateFilterCount();
  loadResults();
}

function clearFilters() {
  state = { page: 1 };
  FILTER_KEYS.forEach((k) => {
    state[k] = '';
  });
  applyStateToForm();
  loadResults();
}

document.addEventListener('DOMContentLoaded', async () => {
  initLayout('browse');
  state = readStateFromUrl();

  const meta = await loadMeta();
  fillCategorySelect(document.getElementById('f-category'), meta.categories || FALLBACK_CATEGORIES, { placeholder: 'All categories' });
  applyStateToForm();

  const form = document.getElementById('filters');
  form.addEventListener('submit', (e) => e.preventDefault());

  const typed = debounce(applyFiltersFromForm, 350);
  document.getElementById('f-q').addEventListener('input', typed);
  document.getElementById('f-location').addEventListener('input', typed);
  ['f-category', 'f-status', 'f-from', 'f-to', 'f-sort'].forEach((id) => document.getElementById(id).addEventListener('change', applyFiltersFromForm));
  document.querySelectorAll('#f-type input').forEach((r) => r.addEventListener('change', applyFiltersFromForm));
  document.getElementById('clear-filters').addEventListener('click', clearFilters);

  // The extra filters fold away on small screens.
  const toggle = document.getElementById('filters-toggle');
  const more = document.getElementById('filters-more');
  toggle.addEventListener('click', () => {
    const open = more.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  if (['category', 'status', 'location', 'dateFrom', 'dateTo', 'sort'].some((k) => state[k])) {
    more.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  loadResults();
});
