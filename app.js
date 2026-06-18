let allTerms = [];
let shownTerms = [];
let fuse;
let activeCategory = 'all';

const els = {
  search: document.getElementById('searchInput'),
  results: document.getElementById('results'),
  count: document.getElementById('resultCount'),
  title: document.getElementById('resultsTitle'),
  categories: document.getElementById('categoryFilters'),
  totalTerms: document.getElementById('totalTerms'),
  totalCategories: document.getElementById('totalCategories'),
  empty: document.getElementById('emptyState'),
  suggestions: document.getElementById('suggestions'),
  azBar: document.getElementById('azBar'),
  theme: document.getElementById('themeToggle')
};

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quote && next === '"') { cell += '"'; i++; }
    else if (char === '"') quote = !quote;
    else if (char === ',' && !quote) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quote) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function clean(value) { return (value || '').toString().trim(); }
function splitList(value) { return clean(value).split(/[,;|]/).map(v => v.trim()).filter(Boolean); }
function slug(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function escapeHTML(str) { return clean(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function loadData() {
  const res = await fetch('definitions.csv?cache=' + Date.now());
  const text = await res.text();
  const rows = parseCSV(text);
  const headers = rows.shift().map(h => clean(h));
  allTerms = rows.map(row => {
    const item = {};
    headers.forEach((h, i) => item[h] = clean(row[i]));
    return {
      keyword: item.Keyword || item.Term || item.keyword || '',
      fullName: item['Full Name'] || '',
      explanation: item.Explanation || item.Definition || '',
      plainEnglish: item['Plain English'] || '',
      category: item.Category || 'Uncategorized',
      related: splitList(item['Related Keywords'] || item['Related Terms']),
      equipment: splitList(item['Related Equipment']),
      salesTip: item['Sales Tip'] || '',
      featured: /^yes|true|1|x$/i.test(item.Featured || '')
    };
  }).filter(t => t.keyword || t.explanation).sort((a,b) => a.keyword.localeCompare(b.keyword));

  fuse = new Fuse(allTerms, {
    keys: ['keyword', 'fullName', 'explanation', 'plainEnglish', 'category', 'related', 'equipment', 'salesTip'],
    threshold: 0.38,
    ignoreLocation: true,
    includeScore: true
  });
  buildCategories();
  buildAZ();
  updateStats();
  applyFilter('all');
  loadHashTerm();
}

function updateStats() {
  els.totalTerms.textContent = allTerms.length;
  els.totalCategories.textContent = new Set(allTerms.map(t => t.category)).size;
}

function buildCategories() {
  const counts = allTerms.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {});
  els.categories.innerHTML = Object.entries(counts).sort().map(([cat, count]) =>
    `<button class="tag-button" data-category="${escapeHTML(cat)}"><span>${escapeHTML(cat)}</span><strong>${count}</strong></button>`
  ).join('');
  els.categories.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    activeCategory = btn.dataset.category;
    els.search.value = '';
    render(allTerms.filter(t => t.category === activeCategory), activeCategory);
    markActiveCategory();
  }));
}

function buildAZ() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  els.azBar.innerHTML = letters.map(l => `<button data-letter="${l}">${l}</button>`).join('');
  els.azBar.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    const letter = btn.dataset.letter;
    render(allTerms.filter(t => t.keyword.toUpperCase().startsWith(letter)), `A–Z: ${letter}`);
  }));
}

function markActiveCategory() {
  document.querySelectorAll('.tag-button').forEach(b => b.classList.toggle('active', b.dataset.category === activeCategory));
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.filter === activeCategory));
}

function applyFilter(filter) {
  activeCategory = filter;
  els.azBar.classList.toggle('hidden', filter !== 'az');
  if (filter === 'featured') render(allTerms.filter(t => t.featured), 'Featured Terms');
  else if (filter === 'az') render(allTerms, 'A–Z Browse');
  else render(allTerms, 'All Terms');
  markActiveCategory();
}

function highlight(text, query) {
  text = escapeHTML(text);
  if (!query) return text;
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 4).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return text;
  return text.replace(new RegExp(`(${terms.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function render(items, title = 'Results', query = '') {
  shownTerms = items;
  els.title.textContent = title;
  els.count.textContent = `${items.length} result${items.length === 1 ? '' : 's'}`;
  els.empty.classList.toggle('hidden', items.length !== 0);
  els.results.innerHTML = items.map(t => cardHTML(t, query)).join('');
  els.results.querySelectorAll('[data-search]').forEach(btn => btn.addEventListener('click', () => {
    els.search.value = btn.dataset.search;
    performSearch(btn.dataset.search);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }));
}

function cardHTML(t, query) {
  const related = t.related.map(v => `<button class="chip" data-search="${escapeHTML(v)}">${escapeHTML(v)}</button>`).join('');
  const equipment = t.equipment.map(v => `<button class="chip" data-search="${escapeHTML(v)}">${escapeHTML(v)}</button>`).join('');
  return `<article class="card" id="${slug(t.keyword)}">
    <div class="card-header">
      <div>
        <h3 class="term">${highlight(t.keyword, query)}</h3>
        ${t.fullName ? `<p class="full-name">${highlight(t.fullName, query)}</p>` : ''}
      </div>
      <span class="badge">${escapeHTML(t.category)}</span>
    </div>
    ${t.explanation ? `<p>${highlight(t.explanation, query)}</p>` : ''}
    ${t.plainEnglish ? `<div class="section-label">Plain English</div><p>${highlight(t.plainEnglish, query)}</p>` : ''}
    ${t.salesTip ? `<div class="sales-tip"><strong>Sales Tip:</strong> ${highlight(t.salesTip, query)}</div>` : ''}
    ${related ? `<div class="section-label">Related Terms</div><div class="chips">${related}</div>` : ''}
    ${equipment ? `<div class="section-label">Related Equipment</div><div class="chips">${equipment}</div>` : ''}
  </article>`;
}

function performSearch(query) {
  query = query.trim();
  els.azBar.classList.add('hidden');
  if (!query) { applyFilter('all'); els.suggestions.innerHTML = ''; return; }
  const results = fuse.search(query).map(r => r.item);
  render(results, `Search: “${query}”`, query);
  showSuggestions(query);
}

function showSuggestions(query) {
  if (!query || query.length < 2) { els.suggestions.innerHTML = ''; return; }
  const suggestions = fuse.search(query).slice(0, 5).map(r => r.item.keyword);
  els.suggestions.innerHTML = suggestions.map(s => `<button class="suggestion" data-value="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join('');
  els.suggestions.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    els.search.value = btn.dataset.value;
    els.suggestions.innerHTML = '';
    performSearch(btn.dataset.value);
  }));
}

function loadHashTerm() {
  const target = decodeURIComponent(location.hash.replace('#', ''));
  if (!target) return;
  const match = allTerms.find(t => slug(t.keyword) === target || t.keyword.toLowerCase() === target.toLowerCase());
  if (match) {
    render([match], match.keyword);
    setTimeout(() => document.getElementById(slug(match.keyword))?.scrollIntoView(), 100);
  }
}

document.querySelectorAll('.pill').forEach(btn => btn.addEventListener('click', () => applyFilter(btn.dataset.filter)));
els.search.addEventListener('input', e => performSearch(e.target.value));
document.addEventListener('click', e => { if (!e.target.closest('.search-panel')) els.suggestions.innerHTML = ''; });
els.theme.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  els.theme.textContent = document.body.classList.contains('dark') ? 'Light mode' : 'Dark mode';
});

loadData().catch(err => {
  els.results.innerHTML = `<div class="card"><h3>Could not load definitions.csv</h3><p>Make sure definitions.csv is uploaded in the same GitHub folder as index.html, styles.css, and app.js.</p><p>${escapeHTML(err.message)}</p></div>`;
});
