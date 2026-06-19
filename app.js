let allTerms = [];
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
  totalEquipment: document.getElementById('totalEquipment'),
  empty: document.getElementById('emptyState'),
  suggestions: document.getElementById('suggestions'),
  azBar: document.getElementById('azBar'),
  theme: document.getElementById('themeToggle')
};

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
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
function splitList(value) { return clean(value).split(/[,;]+/).map(v => v.trim()).filter(Boolean); }
function splitQuestions(value) {
  const text = clean(value);
  if (!text) return [];
  const pieces = text.split(/\?\s+/).map(v => v.trim()).filter(Boolean);
  if (pieces.length > 1) return pieces.map(v => v.endsWith('?') ? v : v + '?');
  return text.split(/\n+/).map(v => v.trim()).filter(Boolean);
}
function slug(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function escapeHTML(str) { return clean(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function isFeatured(item) {
  const text = [item.Keyword, item['Full Name'], item.Category].join(' ').toLowerCase();
  return /^yes|true|1|x$/i.test(item.Featured || '') || ['srt','wrs','emi','rem','vra','cpa','abr','vng'].includes(clean(item.Keyword).toLowerCase());
}

function parseResources(value) {
  const text = clean(value);
  if (!text) return [];
  return text.split(/\n|,(?=\s*(?:https?:\/\/|www\.|[^|]+\|))/).map(part => part.trim()).filter(Boolean).map(part => {
    if (part.includes('|')) {
      const [label, ...urlParts] = part.split('|');
      return { label: clean(label), url: clean(urlParts.join('|')) };
    }
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      const url = /^www\./i.test(part) ? 'https://' + part : part;
      let label = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return { label, url };
    }
    return { label: part, url: '' };
  });
}

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
      definition: item.Definition || item.Explanation || '',
      plainEnglish: item['Plain English'] || '',
      potentialCustomers: splitList(item['Potential Customers']),
      category: item.Category || 'Uncategorized',
      related: splitList(item['Related Keywords'] || item['Related Terms']),
      equipment: splitList(item['Related Equipment']),
      manufacturers: splitList(item.Manufacturers || item.Manufacturer),
      commonQuestions: splitQuestions(item['Common Customer Questions']),
      socraticSelling: item['Socratic Selling'] || '',
      resources: parseResources(item.Resources),
      featured: isFeatured(item)
    };
  }).filter(t => t.keyword || t.definition).sort((a,b) => tSort(a,b));

  fuse = new Fuse(allTerms, {
    keys: [
      'keyword', 'fullName', 'definition', 'plainEnglish', 'potentialCustomers',
      'category', 'related', 'equipment', 'manufacturers', 'commonQuestions', 'socraticSelling'
    ],
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

function tSort(a, b) { return clean(a.keyword).localeCompare(clean(b.keyword)); }

function updateStats() {
  els.totalTerms.textContent = allTerms.length;
  els.totalCategories.textContent = new Set(allTerms.map(t => t.category)).size;
  const equipment = new Set(allTerms.flatMap(t => t.equipment));
  els.totalEquipment.textContent = equipment.size;
}

function buildCategories() {
  const counts = allTerms.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {});
  els.categories.innerHTML = Object.entries(counts).sort().map(([cat, count]) =>
    `<button class="tag-button" data-category="${escapeHTML(cat)}"><span>${escapeHTML(cat)}</span><strong>${count}</strong></button>`
  ).join('');
  els.categories.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    activeCategory = btn.dataset.category;
    els.search.value = '';
    els.azBar.classList.add('hidden');
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
  els.search.value = '';
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

function chipHTML(values) {
  return values.map(v => `<button class="chip" data-search="${escapeHTML(v)}">${escapeHTML(v)}</button>`).join('');
}

function listHTML(values) {
  return `<ul class="question-list">${values.map(v => `<li>${escapeHTML(v)}</li>`).join('')}</ul>`;
}

function resourceHTML(resources) {
  return `<ul class="resource-list">${resources.map(r => r.url
    ? `<li><a href="${escapeHTML(r.url)}" target="_blank" rel="noopener">${escapeHTML(r.label || r.url)}</a></li>`
    : `<li>${escapeHTML(r.label)}</li>`).join('')}</ul>`;
}

function render(items, title = 'Results', query = '') {
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
  const related = chipHTML(t.related);
  const equipment = chipHTML(t.equipment);
  const customers = chipHTML(t.potentialCustomers);
  const manufacturers = chipHTML(t.manufacturers);
  const questions = t.commonQuestions.length ? listHTML(t.commonQuestions) : '';
  const resources = t.resources.length ? resourceHTML(t.resources) : '';

  return `<article class="card" id="${slug(t.keyword)}">
    <div class="card-header">
      <div>
        <h3 class="term">${highlight(t.keyword, query)}</h3>
        ${t.fullName ? `<p class="full-name">${highlight(t.fullName, query)}</p>` : ''}
      </div>
      <span class="badge">${escapeHTML(t.category)}</span>
    </div>

    ${t.definition ? `<div class="section-label">Definition</div><p class="definition">${highlight(t.definition, query)}</p>` : ''}
    ${t.plainEnglish ? `<div class="callout"><strong>Plain English</strong>${highlight(t.plainEnglish, query)}</div>` : ''}

    ${(customers || manufacturers) ? `<div class="grid-two">
      ${customers ? `<div class="info-box"><div class="section-label">Potential Customers</div><div class="chips">${customers}</div></div>` : ''}
      ${manufacturers ? `<div class="info-box"><div class="section-label">Manufacturers</div><div class="chips">${manufacturers}</div></div>` : ''}
    </div>` : ''}

    ${questions ? `<div class="section-label">Common Customer Questions</div>${questions}` : ''}
    ${t.socraticSelling ? `<div class="callout"><strong>Socratic Selling</strong>${highlight(t.socraticSelling, query)}</div>` : ''}
    ${related ? `<div class="section-label">Related Terms</div><div class="chips">${related}</div>` : ''}
    ${equipment ? `<div class="section-label">Related Equipment</div><div class="chips">${equipment}</div>` : ''}
    ${resources ? `<div class="section-label">Resources</div>${resources}` : ''}
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
  const suggestions = fuse.search(query).slice(0, 6).map(r => r.item.keyword);
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


// Footer modal behavior
const modalTriggers = document.querySelectorAll('[data-modal]');
const closeModalButtons = document.querySelectorAll('[data-close-modal]');

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close')?.focus();
}

function closeModal() {
  document.querySelectorAll('.modal.open').forEach(modal => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('modal-open');
}

modalTriggers.forEach(button => {
  button.addEventListener('click', () => openModal(button.dataset.modal));
});

closeModalButtons.forEach(button => {
  button.addEventListener('click', closeModal);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
});
