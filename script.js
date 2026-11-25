/* ==========================================================
   RCB Connect — script.js
   Plain JavaScript, no dependencies.

   Sections:
     1. CONFIG            ← the only part admins normally edit
     2. Contact methods   ← where to plug in new ways to "Connect"
     3. Data helpers      (load, validate, expiry)
     4. Filtering & sorting
     5. Rendering
     6. UI wiring         (tabs, search, chips, sort, nav, dialog)
   ========================================================== */

/* ----------------------------------------------------------
   1. CONFIG — edit these values
   ---------------------------------------------------------- */
const CONFIG = {
  // Where listings are loaded from (relative to index.html).
  listingsUrl: 'listings.json',

  // Google Form (or any form) for new listing submissions.
  // Leave '' to show the "submissions are handled by admins" dialog instead.
  // Example: 'https://forms.gle/AbCdEf123'
  addListingFormUrl: '',

  // Optional admin WhatsApp number for listing submissions, with country code,
  // digits only. Example: '919876543210'. Leave '' to hide the button.
  adminWhatsapp: '916366594660',

  // How the "Connect" button works:
  //   'whatsapp' – opens a WhatsApp chat with the listing owner (if they shared a number)
  //   'none'     – hides contact on every card ("Contact details not available")
  // Add new methods in CONTACT_METHODS below (e.g. a form or admin introduction).
  contactMethod: 'whatsapp',

  // Added in front of 10-digit numbers that have no country code.
  defaultCountryCode: '91',

  // Prefilled WhatsApp message. {title} is replaced by the listing title.
  whatsappMessage: 'Hi, I came across your listing on RCB Connect and would like to connect regarding {title}.',

  // Set to false to hide every listing marked "demo": true in listings.json.
  showDemoListings: true,

  // Category filter chips, in display order. Listings should use these exact names.
  categories: [
    'Marketing & Advertising',
    'Design & Creative',
    'Technology & IT',
    'Finance & Accounting',
    'Legal & Compliance',
    'Business Consulting',
    'Manufacturing & Industry',
    'Real Estate & Construction',
    'Education & Training',
    'Healthcare',
    'Photography & Media',
    'Events',
    'Other'
  ]
};

/* Labels used throughout the UI for the two listing types. */
const TYPES = {
  offer:   { label: 'I Can Help',      noun: 'offer',   plural: 'offers',   hash: 'help',
             hint: 'Services, skills, expertise and connections members can offer.' },
  request: { label: "I'm Looking For", noun: 'request', plural: 'requests', hash: 'looking',
             hint: 'Things members currently need — can you help or refer someone?' }
};

/* ----------------------------------------------------------
   2. CONTACT METHODS
   Each method receives a listing and returns either
     { href, label, className }   → rendered as a button/link
     null                         → "Contact details not available"
   To add a new method later (e.g. 'form' or 'admin'), add a function
   here and set CONFIG.contactMethod to its name.
   ---------------------------------------------------------- */
const CONTACT_METHODS = {
  whatsapp(listing) {
    // Only show contact when the owner gave a number AND agreed to share it.
    if (!listing.contactConsent) return null;
    const number = normalizePhone(listing.whatsapp);
    if (!number) return null;
    const text = CONFIG.whatsappMessage.replace('{title}', listing.title);
    return {
      href: `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
      label: 'Connect',
      className: 'btn btn-connect'
    };
  },
  none() {
    return null;
  }
};

function getContactAction(listing) {
  const method = CONTACT_METHODS[CONFIG.contactMethod] || CONTACT_METHODS.none;
  return method(listing);
}

/** Strip everything but digits; add the default country code to bare 10-digit numbers. */
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);             // 0091… → 91…
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // 09876… → 9876…
  if (digits.length === 10) digits = CONFIG.defaultCountryCode + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}

/* ----------------------------------------------------------
   3. DATA HELPERS
   ---------------------------------------------------------- */

/** Parse 'YYYY-MM-DD' as a local date (avoids timezone off-by-one). */
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}

/** A listing stays visible through the whole of its expiry date. */
function isExpired(listing, today = new Date()) {
  const expiry = parseDate(listing.expiryDate);
  if (!expiry) return false; // no expiry date = no automatic expiry
  const endOfExpiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate() + 1);
  return today >= endOfExpiryDay;
}

/** Only active, unexpired, well-formed listings are shown. */
function isPublishable(listing, today = new Date()) {
  if (!listing || typeof listing !== 'object') return false;
  if (!TYPES[listing.type]) return false;
  if (!listing.title) return false;
  if (String(listing.status || '').toLowerCase() !== 'active') return false;
  if (listing.demo && !CONFIG.showDemoListings) return false;
  return !isExpired(listing, today);
}

/** Fill in safe defaults so rendering never breaks on a missing field. */
function normalizeListing(raw) {
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords
    : String(raw.keywords || '').split(',');
  return {
    id: String(raw.id || ''),
    type: String(raw.type || '').toLowerCase(),
    title: String(raw.title || '').trim(),
    description: String(raw.description || '').trim(),
    memberName: String(raw.memberName || '').trim(),
    profession: String(raw.profession || '').trim(),
    category: String(raw.category || 'Other').trim(),
    keywords: keywords.map(k => String(k).trim()).filter(Boolean),
    whatsapp: raw.whatsapp || '',
    contactConsent: raw.contactConsent === true,
    dateCreated: raw.dateCreated || '',
    expiryDate: raw.expiryDate || '',
    status: raw.status || 'inactive',
    demo: raw.demo === true
  };
}

async function loadListings() {
  const res = await fetch(CONFIG.listingsUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.listings || []);
  return list.map(normalizeListing).filter(l => isPublishable(l));
}

/* ----------------------------------------------------------
   4. FILTERING & SORTING
   ---------------------------------------------------------- */
const state = {
  all: [],
  tab: 'offer',
  category: 'all',
  query: '',
  sort: 'recent'
};

/** Text that the search looks through for one listing. */
function searchText(l) {
  return [l.title, l.description, l.memberName, l.profession, l.category, l.keywords.join(' ')]
    .join(' ')
    .toLowerCase();
}

/** Every word typed must appear somewhere in the listing (order doesn't matter). */
function matchesQuery(l, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = searchText(l);
  return terms.every(t => hay.includes(t));
}

function matchesCategory(l, category) {
  return category === 'all' || l.category === category;
}

function sortListings(list, sort) {
  const copy = list.slice();
  if (sort === 'alpha') {
    copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  } else {
    copy.sort((a, b) => {
      const da = parseDate(a.dateCreated)?.getTime() || 0;
      const db = parseDate(b.dateCreated)?.getTime() || 0;
      return db - da || a.title.localeCompare(b.title);
    });
  }
  return copy;
}

function filtered(type) {
  return state.all.filter(l =>
    l.type === type && matchesCategory(l, state.category) && matchesQuery(l, state.query));
}

/* ----------------------------------------------------------
   5. RENDERING
   ---------------------------------------------------------- */
const $ = sel => document.querySelector(sel);
const els = {};

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function renderChips() {
  const wrap = els.chips;
  wrap.innerHTML = '';
  const all = [{ value: 'all', label: 'All Categories' }]
    .concat(CONFIG.categories.map(c => ({ value: c, label: c })));
  all.forEach(({ value, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.dataset.category = value;
    b.setAttribute('aria-pressed', String(value === state.category));
    wrap.appendChild(b);
  });
}

/** "Priya R Shetty" → "PS". Used for the round monogram on each card. */
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(p => /[A-Za-z]/.test(p));
  if (!parts.length) return 'R';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Quick searches under the search box: the most common tags in live listings. */
function renderSuggestions() {
  const counts = new Map();
  state.all.forEach(l => l.keywords.forEach(k => {
    const key = k.trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }));
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([k]) => k);
  const box = els.suggestions;
  box.innerHTML = '';
  if (!top.length) { box.hidden = true; return; }
  const label = document.createElement('span');
  label.textContent = 'Try:';
  box.appendChild(label);
  top.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = k;
    b.addEventListener('click', () => {
      els.search.value = k;
      state.query = k;
      els.searchClear.hidden = false;
      render();
      scrollToDirectory();
    });
    box.appendChild(b);
  });
  box.hidden = false;
}

function buildCard(l) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const type = TYPES[l.type];

  if (l.demo) {
    node.classList.add('is-demo');
    node.querySelector('.pill-demo').hidden = false;
  }
  const typePill = node.querySelector('.pill-type');
  typePill.textContent = type.label;
  typePill.classList.add(l.type);

  node.querySelector('.card-title').textContent = l.title;
  node.querySelector('.card-desc').textContent = l.description;
  node.querySelector('.card-category').textContent = l.category;
  node.querySelector('.card-member').textContent = l.memberName || 'RCB member';
  node.querySelector('.card-profession').textContent = l.profession;
  node.querySelector('.avatar').textContent = initials(l.memberName);

  const tags = node.querySelector('.tags');
  l.keywords.forEach(k => {
    const li = document.createElement('li');
    li.textContent = k;
    tags.appendChild(li);
  });

  const created = parseDate(l.dateCreated);
  node.querySelector('.card-date').textContent = created ? dateFmt.format(created) : '';

  const slot = node.querySelector('.card-contact');
  const action = getContactAction(l);
  if (action) {
    const a = document.createElement('a');
    a.href = action.href;
    a.className = action.className;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', `${action.label} about ${l.title}`);
    a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';
    a.appendChild(document.createTextNode(action.label));
    slot.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.className = 'contact-unavailable';
    span.textContent = l.demo ? 'Sample, no contact' : 'Contact details not available';
    slot.appendChild(span);
  }
  return node;
}

function emptyState(title, text, withReset) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.innerHTML = '<h3></h3><p></p>';
  div.querySelector('h3').textContent = title;
  div.querySelector('p').textContent = text;
  if (withReset) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary';
    b.textContent = 'Clear search & filters';
    b.addEventListener('click', resetFilters);
    div.appendChild(b);
  }
  return div;
}

function render() {
  const type = TYPES[state.tab];

  // Tab counts reflect the current search + category.
  const countText = t => {
    const c = filtered(t).length;
    return `${c} ${c === 1 ? TYPES[t].noun : TYPES[t].plural}`;
  };
  els.countOffer.textContent = countText('offer');
  els.countRequest.textContent = countText('request');

  const results = sortListings(filtered(state.tab), state.sort);
  const totalInTab = state.all.filter(l => l.type === state.tab).length;
  const box = els.results;
  box.innerHTML = '';

  // Results summary line
  const n = results.length;
  let meta = `${n} ${n === 1 ? type.noun : type.plural}`;
  if (state.query) meta += ` for “${state.query.trim()}”`;
  if (state.category !== 'all') meta += ` in ${state.category}`;
  els.resultsMeta.textContent = totalInTab ? meta : '';

  // Empty states
  if (totalInTab === 0) {
    box.appendChild(state.tab === 'request'
      ? emptyState('No requests yet', 'No requests yet. Check back soon—new opportunities and requirements will appear here.')
      : emptyState('No offers yet', 'No offers yet. Check back soon—members will share what they can help with here.'));
    return;
  }
  if (n === 0) {
    if (state.query) {
      box.appendChild(emptyState('No matches found', 'No matches found. Try another keyword or category.', true));
    } else {
      box.appendChild(emptyState('Nothing here yet', 'No listings in this category yet.', true));
    }
    return;
  }

  // Real member listings first, demo listings in their own clearly labelled section.
  const real = results.filter(l => !l.demo);
  const demo = results.filter(l => l.demo);

  if (real.length) {
    if (demo.length) box.appendChild(sectionLabel('Member listings'));
    box.appendChild(grid(real));
  }
  if (demo.length) {
    box.appendChild(sectionLabel('Sample listings'));
    const banner = document.createElement('p');
    banner.className = 'demo-banner';
    banner.innerHTML = '<strong>These are demo listings, not real members.</strong> They show how a listing looks and will be removed once real listings are added.';
    box.appendChild(banner);
    box.appendChild(grid(demo));
  }
}

function sectionLabel(text) {
  const h = document.createElement('h2');
  h.className = 'section-label';
  h.textContent = text;
  return h;
}

function grid(list) {
  const g = document.createElement('div');
  g.className = 'grid';
  const frag = document.createDocumentFragment();
  list.forEach(l => frag.appendChild(buildCard(l)));
  g.appendChild(frag);
  return g;
}

/* ----------------------------------------------------------
   6. UI WIRING
   ---------------------------------------------------------- */
function setTab(tab, { focus = false } = {}) {
  if (!TYPES[tab]) return;
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  });
  els.results.setAttribute('aria-labelledby', `tab-${tab}`);
  document.querySelectorAll('.main-nav a[data-nav]').forEach(a =>
    a.classList.toggle('active', a.dataset.nav === tab));
  render();
}

function setCategory(category) {
  state.category = category;
  els.chips.querySelectorAll('.chip').forEach(c =>
    c.setAttribute('aria-pressed', String(c.dataset.category === category)));
  render();
}

function resetFilters() {
  els.search.value = '';
  state.query = '';
  els.searchClear.hidden = true;
  setCategory('all');
}

function scrollToDirectory() {
  els.directory.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** #help → I Can Help, #looking → I'm Looking For. Lets links be shared on WhatsApp. */
function applyHash({ scroll = true } = {}) {
  const hash = location.hash.replace('#', '');
  const tab = Object.keys(TYPES).find(k => TYPES[k].hash === hash);
  if (tab) {
    setTab(tab);
    if (scroll) scrollToDirectory();
  }
}

function closeMenu() {
  els.nav.classList.remove('open');
  els.menuToggle.setAttribute('aria-expanded', 'false');
  els.menuToggle.setAttribute('aria-label', 'Open menu');
}

/* ---- Add Listing ---- */
const LISTING_TEMPLATE = [
  'RCB Connect — New listing',
  'Full name: ',
  'Business / profession: ',
  "Listing type (I Can Help / I'm Looking For): ",
  'Listing title: ',
  'Description: ',
  `Category (${CONFIG.categories.join(', ')}): `,
  'Keywords / tags: ',
  'WhatsApp number (optional): ',
  'I agree to my WhatsApp number being used for the Connect button (Yes / No): ',
  'Keep listing for (1 month / 3 months / 6 months): '
].join('\n');

function openAddListing() {
  closeMenu();
  if (CONFIG.addListingFormUrl) {
    window.open(CONFIG.addListingFormUrl, '_blank', 'noopener');
    return;
  }
  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  else els.dialog.setAttribute('open', '');
}

function closeDialog() {
  if (typeof els.dialog.close === 'function') els.dialog.close();
  else els.dialog.removeAttribute('open');
}

async function copyTemplate() {
  let ok = false;
  try {
    await navigator.clipboard.writeText(LISTING_TEMPLATE);
    ok = true;
  } catch (_) {
    // Fallback for older browsers / non-HTTPS pages
    const ta = document.createElement('textarea');
    ta.value = LISTING_TEMPLATE;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    els.dialog.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
  }
  els.copyStatus.textContent = ok
    ? 'Template copied. Paste it into WhatsApp and fill in your details.'
    : 'Could not copy automatically — please type the details listed above.';
}

function setupAdminContact() {
  const number = normalizePhone(CONFIG.adminWhatsapp);
  if (number) {
    const text = "Hi, I'd like to add a listing on RCB Connect.";
    els.adminLink.href = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
    els.adminLink.hidden = false;
    els.adminFallback.textContent = 'Or paste the template in the RCB WhatsApp group.';
  }
}

/* ---- Init ---- */
function cacheElements() {
  Object.assign(els, {
    search: $('#search'),
    searchClear: $('#search-clear'),
    chips: $('#category-chips'),
    sort: $('#sort'),
    results: $('#results'),
    resultsMeta: $('#results-meta'),
    countOffer: $('#count-offer'),
    countRequest: $('#count-request'),
    suggestions: $('#suggestions'),
    directory: $('#directory'),
    nav: $('#main-nav'),
    menuToggle: $('#menu-toggle'),
    dialog: $('#add-dialog'),
    adminLink: $('#admin-contact-link'),
    adminFallback: $('#admin-contact-fallback'),
    copyStatus: $('#copy-status'),
    cardTemplate: $('#card-template')
  });
}

function bindEvents() {
  // Search — instant as you type
  els.search.addEventListener('input', () => {
    state.query = els.search.value;
    els.searchClear.hidden = !els.search.value;
    render();
  });
  els.search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {          // closes the mobile keyboard and jumps to results
      els.search.blur();
      scrollToDirectory();
    }
  });
  els.searchClear.addEventListener('click', () => {
    els.search.value = '';
    state.query = '';
    els.searchClear.hidden = true;
    els.search.focus();
    render();
  });

  // Tabs (click + arrow keys)
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setTab(btn.dataset.tab);
      history.replaceState(null, '', `#${TYPES[btn.dataset.tab].hash}`);
    });
    btn.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = state.tab === 'offer' ? 'request' : 'offer';
      setTab(next, { focus: true });
      history.replaceState(null, '', `#${TYPES[next].hash}`);
    });
  });

  // Category chips
  els.chips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) setCategory(chip.dataset.category);
  });

  // Sort
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    render();
  });

  // Hash links (#help / #looking) from nav + hero buttons
  window.addEventListener('hashchange', () => applyHash());
  document.querySelectorAll('a[href="#help"], a[href="#looking"]').forEach(a => {
    a.addEventListener('click', e => {
      // Same hash clicked again → hashchange won't fire, so handle it here.
      if (location.hash === a.getAttribute('href')) {
        e.preventDefault();
        applyHash();
      }
      closeMenu();
    });
  });
  document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', closeMenu));

  // Mobile menu
  els.menuToggle.addEventListener('click', () => {
    const open = !els.nav.classList.contains('open');
    els.nav.classList.toggle('open', open);
    els.menuToggle.setAttribute('aria-expanded', String(open));
    els.menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // Add Listing
  document.querySelectorAll('[data-action="add-listing"]').forEach(b =>
    b.addEventListener('click', openAddListing));
  els.dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeDialog));
  els.dialog.addEventListener('click', e => { if (e.target === els.dialog) closeDialog(); }); // backdrop
  $('#copy-template').addEventListener('click', copyTemplate);
}

async function init() {
  cacheElements();
  document.getElementById('year').textContent = new Date().getFullYear();
  renderChips();
  setupAdminContact();
  bindEvents();

  try {
    state.all = await loadListings();
    renderSuggestions();
    applyHash({ scroll: !!location.hash });
    render();
  } catch (err) {
    console.error('Could not load listings:', err);
    const local = location.protocol === 'file:';
    els.results.innerHTML = '';
    els.results.appendChild(emptyState(
      'Listings could not be loaded',
      local
        ? 'Browsers block loading listings.json when the page is opened directly from a file. Run a local server (see README) or view the deployed site.'
        : 'Please refresh the page in a moment. If this keeps happening, let an RCB admin know.'
    ));
  }
}

document.addEventListener('DOMContentLoaded', init);
