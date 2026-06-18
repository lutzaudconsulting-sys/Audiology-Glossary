const CSV_PATH = 'data/definitions.csv';
let terms = [];
let fuse;
let activeCategory = null;

const els = {
  search: document.getElementById('searchInput'),
  clear: document.getElementById('clearSearch'),
  stats: document.getElementById('stats'),
  categories: document.getElementById('categoryGrid'),
  results: document.getElementById('results'),
  resultCount: document.getElementById('resultCount'),
  resultsHeading: document.getElementById('resultsHeading'),
  showAll: document.getElementById('showAll'),
  home: document.getElementById('homeView'),
  term: document.getElementById('termView'),
  theme: document.getElementById('themeToggle')
};

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && inQuotes && n === '"') { cell += '"'; i++; }
    else if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  const headers = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}

function normalize(row, index) {
  const keyword = row.Keyword || row.Term || row.keyword || row.term || '';
  return {
    id: slug(keyword || `term-${index}`),
    keyword,
    fullName: row['Full Name'] || row.FullName || '',
    definition: row.Explanation || row.Definition || row.definition || '',
    plainEnglish: row['Plain English'] || row.PlainEnglish || '',
    category: row.Category || 'Uncategorized',
    relatedTerms: splitList(row['Related Keywords'] || row['Related Terms'] || ''),
    equipment: splitList(row['Related Equipment'] || row.Equipment || ''),
    salesTip: row['Sales Tip'] || '',
    featured: /^yes|true|1$/i.test(row.Featured || '')
  };
}

function splitList(value) {
  return String(value || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}

function truncate(text, length = 190) {
  if (!text) return 'Definition coming soon.';
  return text.length > length ? text.slice(0, length).trim() + '…' : text;
}

function highlight(text, query) {
  const safe = escapeHTML(text);
  if (!query || query.length < 2) return safe;
  const words = query.split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return safe;
  return safe.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function initSearch() {
  fuse = new Fuse(terms, {
    keys: [
      { name: 'keyword', weight: 3 },
      { name: 'fullName', weight: 2 },
      { name: 'definition', weight: 1.4 },
      { name: 'plainEnglish', weight: 1.3 },
      { name: 'category', weight: 1 },
      { name: 'relatedTerms', weight: 1.7 },
      { name: 'equipment', weight: 1.4 },
      { name: 'salesTip', weight: 1 }
    ],
    threshold: 0.36,
    ignoreLocation: true,
    includeScore: true
  });
}

function renderStats() {
  const categories = new Set(terms.map(t => t.category || 'Uncategorized'));
  els.stats.textContent = `${terms.length} terms • ${categories.size} categories • Spreadsheet-powered`;
}

function renderCategories() {
  const counts = {};
  terms.forEach(t => counts[t.category] = (counts[t.category] || 0) + 1);
  els.categories.innerHTML = Object.entries(counts).sort((a,b) => a[0].localeCompare(b[0])).map(([category, count]) => `
    <button class="category-card" data-category="${escapeHTML(category)}">
      <div class="category-name">${escapeHTML(category)}</div>
      <div class="category-count">${count} term${count === 1 ? '' : 's'}</div>
    </button>
  `).join('');
  els.categories.querySelectorAll('[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.category;
      els.search.value = '';
      renderList(terms.filter(t => t.category === activeCategory), '', activeCategory);
    });
  });
}

function renderList(items, query = '', heading = null) {
  els.home.classList.remove('hidden');
  els.term.classList.add('hidden');
  els.resultsHeading.textContent = heading || (query ? `Search results for “${query}”` : 'Featured terms');
  els.resultCount.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    els.results.innerHTML = `<div class="empty">No matches yet. Try another term, category, or equipment name.</div>`;
    return;
  }
  els.results.innerHTML = items.map(t => cardHTML(t, query)).join('');
}

function cardHTML(t, query) {
  return `
    <a class="result-card" href="#/term/${t.id}">
      <div class="result-top">
        <div>
          <div class="term">${highlight(t.keyword, query)}</div>
          ${t.fullName ? `<div class="full-name">${highlight(t.fullName, query)}</div>` : ''}
        </div>
        <span class="pill">${escapeHTML(t.category)}</span>
      </div>
      <div class="definition">${highlight(truncate(t.plainEnglish || t.definition), query)}</div>
      <div class="card-footer">
        ${t.relatedTerms.slice(0,3).map(x => `<span class="tag">${escapeHTML(x)}</span>`).join('')}
        ${t.equipment.slice(0,2).map(x => `<span class="tag">${escapeHTML(x)}</span>`).join('')}
      </div>
    </a>
  `;
}

function showTerm(id) {
  const t = terms.find(x => x.id === id);
  if (!t) { location.hash = '#/'; return; }
  els.home.classList.add('hidden');
  els.term.classList.remove('hidden');
  document.title = `${t.keyword} | Audiology Knowledge Base`;
  els.term.innerHTML = `
    <a class="back" href="#/">← Back to search</a>
    <article class="term-panel">
      <header class="term-header">
        <div>
          <h1 class="term-title">${escapeHTML(t.keyword)}</h1>
          ${t.fullName ? `<p class="full-name">${escapeHTML(t.fullName)}</p>` : ''}
        </div>
        <span class="pill">${escapeHTML(t.category)}</span>
      </header>
      ${block('Definition', t.definition || 'Definition coming soon.')}
      ${t.plainEnglish ? block('Plain English', t.plainEnglish) : ''}
      ${t.salesTip ? block('Sales Tip', t.salesTip) : ''}
      ${t.relatedTerms.length ? tagBlock('Related Terms', t.relatedTerms, true) : ''}
      ${t.equipment.length ? tagBlock('Related Equipment', t.equipment, false) : ''}
    </article>
  `;
  window.scrollTo(0, 0);
}

function block(title, text) {
  return `<section class="section-block"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></section>`;
}

function tagBlock(title, items, linkTerms) {
  return `<section class="section-block"><h3>${escapeHTML(title)}</h3>${items.map(item => {
    const match = terms.find(t => t.keyword.toLowerCase() === item.toLowerCase());
    return match && linkTerms ? `<a class="tag" href="#/term/${match.id}">${escapeHTML(item)}</a>` : `<span class="tag">${escapeHTML(item)}</span>`;
  }).join('')}</section>`;
}

function handleSearch() {
  activeCategory = null;
  const query = els.search.value.trim();
  if (!query) {
    const featured = terms.filter(t => t.featured).length ? terms.filter(t => t.featured) : terms.slice(0, 12);
    renderList(featured, '', 'Featured terms');
    return;
  }
  renderList(fuse.search(query).map(r => r.item), query);
}

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/term/')) showTerm(hash.replace('#/term/', ''));
  else {
    document.title = 'Audiology Knowledge Base';
    handleSearch();
  }
}

function initTheme() {
  const saved = localStorage.getItem('akb-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  els.theme.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  els.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('akb-theme', next);
    els.theme.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

async function boot() {
  initTheme();
  const response = await fetch(CSV_PATH);
  const csv = await response.text();
  terms = parseCSV(csv).map(normalize).filter(t => t.keyword);
  terms.sort((a,b) => a.keyword.localeCompare(b.keyword));
  initSearch();
  renderStats();
  renderCategories();
  els.search.addEventListener('input', handleSearch);
  els.clear.addEventListener('click', () => { els.search.value = ''; handleSearch(); els.search.focus(); });
  els.showAll.addEventListener('click', () => { activeCategory = null; els.search.value = ''; renderList(terms, '', 'All terms'); });
  window.addEventListener('hashchange', route);
  route();
}

boot().catch(err => {
  console.error(err);
  els.results.innerHTML = `<div class="empty">Could not load definitions. Make sure <code>data/definitions.csv</code> is uploaded with the site.</div>`;
});
