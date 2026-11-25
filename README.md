# RCB Connect

**Royal City Biz Connect** member directory. A networking initiative by Mysuru Professional Network (MPN).

This is a static website (HTML, CSS and plain JavaScript) with no backend and no dependencies. Listings live in `listings.json`, so admins can update the directory without touching the site code.

```
index.html     page structure
style.css      all styling (brand colours at the top in :root)
script.js      behaviour; the CONFIG block at the top holds every setting
listings.json  the directory data, which admins edit
README.md      this file
assets/        MPN logo (mpn-mark.png in the header, mpn-logo.png in the footer)
```

When you deploy, upload the `assets` folder along with the five files.

---

## 1. Run it locally

The page loads `listings.json` with `fetch`, and browsers block that when you double-click `index.html` (a `file://` page). Serve the folder instead, using either of these:

```bash
# Python (already installed with Anaconda)
cd path/to/this/folder
python -m http.server 8000
# then open http://localhost:8000
```

```bash
# Node
npx serve .
```

In VS Code, the **Live Server** extension also works.

---

## 2. Settings (top of `script.js`)

| Setting | What it does |
|---|---|
| `addListingFormUrl` | Your Google Form link. When it's set, **Add Listing** opens the form in a new tab. When it's `''`, a dialog explains that RCB admins handle submissions. |
| `adminWhatsapp` | Optional admin number, digits only with country code (e.g. `919876543210`). It adds a "Message an admin on WhatsApp" button to that dialog. |
| `contactMethod` | `'whatsapp'` (default) or `'none'`. New methods (form, admin introduction) can be added in `CONTACT_METHODS`. |
| `whatsappMessage` | The prefilled message. `{title}` is replaced with the listing title. |
| `defaultCountryCode` | Added to 10-digit numbers (default `91`). |
| `showDemoListings` | Set to `false` to hide every `"demo": true` listing at once. |
| `categories` | The filter chips. Listings must use these exact names. |

### Suggested Google Form fields
Full name · Business/profession · Listing type (I Can Help / I'm Looking For) · Listing title · Detailed description · Category (dropdown using the list above) · Keywords/tags · WhatsApp number (optional) · **Consent checkbox:** "I agree to my WhatsApp number being used for the Connect button" · How long to keep the listing (1 / 3 / 6 months).

Responses land in a Google Sheet. An admin reviews each one and copies it into `listings.json`.

---

## 3. Managing listings (admins)

Every listing is one `{ ... }` block inside the `"listings": [ ... ]` array in `listings.json`.

```json
{
  "id": "rcb-0001",
  "type": "offer",
  "title": "Website Development & Digital Solutions",
  "description": "I help businesses build websites and custom web solutions.",
  "memberName": "Full Name",
  "profession": "Web Developer",
  "category": "Technology & IT",
  "keywords": ["Web Development", "Websites"],
  "whatsapp": "919876543210",
  "contactConsent": true,
  "dateCreated": "2026-11-25",
  "expiryDate": "2027-02-25",
  "status": "active"
}
```

| Field | Notes |
|---|---|
| `id` | Must be unique. Use a running number, e.g. `rcb-0001`, `rcb-0002`. |
| `type` | `offer` = **I Can Help**, `request` = **I'm Looking For** |
| `title`, `description` | Shown on the card. Keep descriptions to 1–3 sentences. |
| `memberName` | Required. |
| `profession` | Optional. Use `""` to hide that line. |
| `category` | One of the category names in `script.js`, spelled exactly. |
| `keywords` | List of tags. They are searchable. |
| `whatsapp` | Optional. Digits with country code. **Only fill this if the member agreed.** |
| `contactConsent` | `true` only when the member agreed to share their number. If it's `false` or the number is empty, the card shows "Contact details not available". |
| `dateCreated` | `YYYY-MM-DD`. Used for "Recently Added" sorting. |
| `expiryDate` | `YYYY-MM-DD`. The listing shows through this date and disappears automatically after it. Use `""` for no expiry. |
| `status` | `active` shows the listing. `inactive` hides it without deleting it. |
| `demo` | Only for sample data. Leave it out for real listings. |

Phone numbers never appear as text on the site. They are only used inside the Connect button's WhatsApp link.

### Common tasks
- **Add:** copy an existing block, paste it inside the array, give it a new `id`, and edit the fields. Put a comma between blocks.
- **Edit:** change the values in the listing's block.
- **Delete:** remove the whole `{ ... }` block, including the comma that separates it from its neighbour.
- **Extend or shorten:** change `expiryDate`.
- **Hide temporarily:** set `"status": "inactive"`.
- **Remove the demo data:** delete every block with `"demo": true` (ids `demo-001` to `demo-010`). If you want to keep them for reference, set `showDemoListings: false` in `script.js` instead.

### Avoid breaking the file
JSON is strict:
- Use double quotes `"` only.
- Put commas *between* items, with no comma after the last item.
- Don't add comments.

After editing, paste the file into **https://jsonlint.com** to check it. If the site shows "Listings could not be loaded", the JSON almost always has a typo.

You can edit `listings.json` directly on GitHub (pencil icon → *Commit changes*). The live site updates within a minute or two.

---

## 4. Deploy

### GitHub Pages
1. Create a repository (e.g. `rcb-connect`) and upload all five files to its root.
2. Go to **Settings → Pages → Build and deployment**, choose *Deploy from a branch*, then pick `main` and `/ (root)`.
3. The site goes live at `https://<username>.github.io/rcb-connect/`.

### Netlify
Drag the folder onto **app.netlify.com/drop**. Or connect the GitHub repo with no build command and publish directory `/`.

Share the link in the WhatsApp group. Linking straight to a tab also works:
- `…/#help` opens **I Can Help**
- `…/#looking` opens **I'm Looking For**

---

## 5. What's real and what isn't

- **Search, filters, tabs, sorting and expiry** all run in the browser on `listings.json`.
- **Connect** opens a real WhatsApp chat (`wa.me` link with a prefilled message), but only for listings that have a number and `contactConsent: true`. Demo listings have no numbers, so their Connect button says "Demo listing — no contact".
- **Add Listing** never pretends to submit anything. It either opens your external form or explains how to send details to the admins.

## 6. Ideas for later (not built yet)

The code is split so these can be added without a rewrite:
- **Google Sheets integration:** point `CONFIG.listingsUrl` at a published Sheet/Apps Script JSON endpoint and map its fields in `normalizeListing()`.
- **Admin-mediated introductions or a contact form:** add a method to `CONTACT_METHODS` and set `contactMethod`.
- Member profiles, admin approval, referral tracking and a dashboard would need a small backend (e.g. Firebase, Supabase or Django).
