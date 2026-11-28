/**
 * RCB Connect — Google Sheets backend (Google Apps Script)
 * ---------------------------------------------------------------
 *   setup()  run ONCE: creates the "RCB Connect – Listings" sheet.
 *   doPost() the website's "Add Listing" form sends new listings here.
 *            They land in the sheet with Approved left empty.
 *   doGet()  the website reads APPROVED listings from here.
 *
 * Admins only ever touch the sheet: pick "Yes" in the Approved
 * column to publish a listing, "No" to hide it.
 *
 * Privacy: only approved rows are sent to the website, and a
 * WhatsApp number is only saved if the member ticked consent.
 *
 * Install steps: README.md → "Easy admin with Google Sheets".
 */

const HEADERS = [
  'Timestamp', 'Full name', 'Business / profession', 'Listing type',
  'Listing title', 'Description', 'Category', 'Keywords / tags',
  'WhatsApp', 'Consent', 'Website', 'Keep my listing for', 'Approved'
];
const CATEGORIES = [
  'Marketing & Advertising', 'Design & Creative', 'Technology & IT',
  'Finance & Accounting', 'Legal & Compliance', 'Business Consulting',
  'Manufacturing & Industry', 'Real Estate & Construction',
  'Education & Training', 'Healthcare', 'Photography & Media', 'Events',
  'Food & Beverages', 'Other'
];
const TIMEZONE = 'Asia/Kolkata';
const CACHE_SECONDS = 60; // approvals show on the website within about a minute

/* =================================================================
   1. ONE-TIME SETUP
   ================================================================= */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('Already set up: https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'));
    return;
  }
  const ss = SpreadsheetApp.create('RCB Connect – Listings');
  const sheet = ss.getSheets()[0];
  sheet.setName('Listings');
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
       .setFontWeight('bold').setBackground('#e8eaf4');
  sheet.setFrozenRows(1);

  const approvedCol = HEADERS.indexOf('Approved') + 1;
  sheet.getRange(1, approvedCol).setBackground('#fff2cc')
       .setNote('Pick "Yes" to show this listing on the website. "No" or empty = hidden.');
  const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build();
  sheet.getRange(2, approvedCol, sheet.getMaxRows() - 1, 1).setDataValidation(rule);

  // WhatsApp column as plain text so numbers keep their digits
  sheet.getRange(2, HEADERS.indexOf('WhatsApp') + 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  sheet.setColumnWidth(HEADERS.indexOf('Description') + 1, 320);

  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('✅ Sheet created: ' + ss.getUrl());
  Logger.log('Next: Deploy → New deployment → Web app (see README).');
}

/* =================================================================
   2. RECEIVE A NEW LISTING FROM THE WEBSITE FORM
   ================================================================= */
function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (d.website) return json_({ ok: true });            // spam trap: bots fill hidden fields

    const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
    const row = {
      name: clean(d.name, 80),
      profession: clean(d.profession, 80),
      type: d.type === 'request' ? "I'm Looking For" : 'I Can Help',
      title: clean(d.title, 90),
      description: String(d.description || '').trim().slice(0, 600),
      category: CATEGORIES.indexOf(d.category) >= 0 ? d.category : 'Other',
      keywords: clean(d.keywords, 150),
      consent: d.consent === true,
      whatsapp: String(d.whatsapp || '').replace(/[^\d+]/g, '').slice(0, 16),
      link: cleanUrl_(d.link),
      keep: ['1 month', '3 months', '6 months'].indexOf(d.keep) >= 0 ? d.keep : '3 months'
    };
    if (!row.name || !row.title || !row.description) {
      return json_({ ok: false, error: 'Please fill in your name, a title and a description.' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = sheet_();
      ensureColumn_(sheet, 'Website', 'Keep my listing for');
      const values = {
        'timestamp': new Date(), 'full name': row.name, 'business': row.profession,
        'listing type': row.type, 'listing title': row.title, 'description': row.description,
        'category': row.category, 'keywords': row.keywords,
        'whatsapp': row.consent ? row.whatsapp : '',          // number is only stored with consent
        'consent': row.consent && row.whatsapp ? 'Yes' : '',
        'website': row.link,
        'keep my listing': row.keep,
        'approved': ''                                        // empty until an admin picks Yes
      };
      const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                        .map(h => String(h).trim().toLowerCase());
      sheet.appendRow(head.map(h => {
        const key = Object.keys(values).find(k => h.indexOf(k) === 0);
        return key ? values[key] : '';
      }));
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'Could not save your listing. Please try again.' });
  }
}

/* =================================================================
   3. SEND APPROVED LISTINGS TO THE WEBSITE
   ================================================================= */
function doGet() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('listings');
  if (hit) return text_(hit);

  const rows = sheet_().getDataRange().getValues();
  const body = JSON.stringify({ listings: rowsToListings(rows, new Date()), updated: new Date().toISOString() });
  cache.put('listings', body, CACHE_SECONDS);
  return text_(body);
}

/** Sheet rows (row 1 = headers) → website listings. Columns are matched by header name. */
function rowsToListings(rows, now) {
  if (!rows || rows.length < 2) return [];
  const head = rows[0].map(h => String(h).trim().toLowerCase());
  const col = p => head.findIndex(h => h.indexOf(p) === 0);
  const c = {
    time: col('timestamp'), name: col('full name'), profession: col('business'),
    type: col('listing type'), title: col('listing title'), description: col('description'),
    category: col('category'), keywords: col('keywords'), whatsapp: col('whatsapp'),
    consent: col('consent'), website: col('website'), keep: col('keep my listing'), approved: col('approved')
  };
  const t = (r, k) => (c[k] >= 0 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : '');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (t(r, 'approved').toLowerCase() !== 'yes' || !t(r, 'title')) continue;

    const raw = c.time >= 0 ? r[c.time] : '';
    const created = raw instanceof Date ? raw : (isNaN(new Date(raw)) ? now : new Date(raw));
    const months = parseInt(t(r, 'keep'), 10) || 3;
    const expiry = new Date(created.getFullYear(), created.getMonth() + months, created.getDate());
    const consent = ['yes', 'true'].indexOf(t(r, 'consent').toLowerCase()) >= 0
                    || t(r, 'consent').toLowerCase().indexOf('i agree') === 0;

    out.push({
      id: 'rcb-' + (i + 1),
      type: t(r, 'type').toLowerCase().indexOf('looking') >= 0 ? 'request' : 'offer',
      title: t(r, 'title'),
      description: t(r, 'description'),
      memberName: t(r, 'name'),
      profession: t(r, 'profession'),
      category: t(r, 'category') || 'Other',
      keywords: t(r, 'keywords').split(',').map(s => s.trim()).filter(Boolean),
      whatsapp: consent ? t(r, 'whatsapp') : '',
      contactConsent: consent,
      website: cleanUrl_(t(r, 'website')),
      dateCreated: ymd_(created),
      expiryDate: ymd_(expiry),
      status: 'active'
    });
  }
  return out;
}

/* ---------- helpers ---------- */
/** Accept "mybiz.com", "www.x.in/page" or a full http(s) link; anything else becomes ''. */
function cleanUrl_(v) {
  let s = String(v || '').trim().slice(0, 200);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';          // javascript:, mailto:, etc.
    s = 'https://' + s.replace(/^\/+/, '');
  }
  return /^https?:\/\/[^\s<>"'\/]+\.[a-z]{2,}([\/?#][^\s<>"']*)?$/i.test(s) ? s : '';
}

/** Older sheets were created without a column; insert it (before `beforeName`) the first time it's needed. */
function ensureColumn_(sheet, name, beforeName) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  if (head.indexOf(name) >= 0) return;
  const at = head.indexOf(beforeName);
  if (at >= 0) {
    sheet.insertColumnBefore(at + 1);
    sheet.getRange(1, at + 1).setValue(name).setFontWeight('bold').setBackground('#e8eaf4');
  } else {
    sheet.getRange(1, head.length + 1).setValue(name).setFontWeight('bold');
  }
}

function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first');
  const ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName('Listings') || ss.getSheets()[0];
}
function ymd_(d) {
  return typeof Utilities !== 'undefined'
    ? Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd')
    : d.toISOString().slice(0, 10);
}
function json_(obj) { return text_(JSON.stringify(obj)); }
function text_(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
