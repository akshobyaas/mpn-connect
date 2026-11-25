# RCB Connect

**Royal City Biz Connect** member directory. A networking initiative by Mysuru Professional Network (MPN).

This is a static website (HTML, CSS and plain JavaScript) that is free to host on Netlify or GitHub Pages. Listings are managed in a **Google Sheet**, so admins never touch code.

```
index.html          page structure
style.css           styling (brand colours at the top)
script.js           behaviour; settings are in the CONFIG block at the top
listings.json       backup listings, only used when the Sheet has none (empty by default)
assets/             MPN logo
apps-script/Code.gs the Google Sheets backend (pasted into Google Apps Script)
README.md           this file
```

---

## How it works

```
Member taps "Add Listing" on the site → fills the form → it lands in the Google Sheet
Admin opens the Sheet → picks "Yes" in the Approved column
The website shows it (within about a minute)
```

- **Members** add listings themselves from the website.
- **Admins** only use the Google Sheet. They don't need a GitHub login or any JSON.
- Only rows marked **Yes** ever reach the website.
- A WhatsApp number is only saved if the member ticks the consent box, and it's never shown as text on the site.
- Members can also add a website or social page (optional). Cards then show a **Website** button next to **Connect**. Only normal `http(s)` links are accepted.

---

## One-time setup (about 10 minutes)

### 1. Create the Sheet and backend
1. Go to **script.google.com** → **New project**. Sign in with the Google account that should own the listings, ideally a shared RCB/MPN account.
2. Delete what's in the editor. Paste in everything from `apps-script/Code.gs`. Press **Ctrl+S**.
3. In the function dropdown at the top, choose **`setup`** and click **Run**.
4. Google asks for permission: **Review permissions** → pick your account → **Advanced** → **Go to project (unsafe)** → **Allow**. It says "unsafe" only because you wrote the script yourself and Google hasn't reviewed it.
5. The log at the bottom shows a link to the new **"RCB Connect – Listings"** Sheet. It's also in your Google Drive.

### 2. Turn it into a link the website can use
1. Click **Deploy** → **New deployment**.
2. Click the gear ⚙ next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

### 3. Connect the website
Open `script.js`. At the top, paste the URL into `sheetApiUrl`:
```js
sheetApiUrl: 'https://script.google.com/macros/s/AKfy..../exec',
```
Save it and push to GitHub (see "Publishing changes" below). That's it.

> **When `Code.gs` changes** (for example after the Website field was added): open the Apps Script project, replace all the code with the new `apps-script/Code.gs`, press Ctrl+S, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same. The script adds any new Sheet column (like *Website*) by itself on the next submission.

---

## Day-to-day admin (all in the Google Sheet)

| To… | Do this |
|---|---|
| **Approve** a new listing | Pick **Yes** in its *Approved* cell |
| **Hide** a listing | Change *Approved* to **No** |
| **Fix a typo** | Edit the cell directly |
| **Extend** a listing | Change *Keep my listing for* (1 / 3 / 6 months, counted from the Timestamp) |
| **Delete** for good | Right-click the row → *Delete row* |
| **Add someone yourself** | Fill in the form on the website for them, or type a new row in the Sheet |

Tips:
- Add other admins with the Sheet's **Share** button. They don't need anything else.
- Changes show on the website within about **1 minute**.
- Expired listings hide themselves automatically.
- On your phone, the **Google Sheets app** works fine for approving.

---

## Publishing changes to the website code

You only need this when you change the site's code or design, not for listings.

```powershell
cd $HOME\Desktop\django
git add .
git commit -m "Update site"
git push
```
Netlify redeploys automatically.

### First-time Netlify setup
**app.netlify.com** → **Add new site** → **Import an existing project** → **GitHub** → `mpn-connect`. Leave the build command empty and set the publish directory to `.`. Rename the site under **Site configuration**.

---

## Other settings (top of `script.js`)

| Setting | What it does |
|---|---|
| `sheetApiUrl` | Your Apps Script Web app URL (see setup above) |
| `adminWhatsapp` | Admin number used when the form isn't set up yet |
| `whatsappMessage` | Prefilled Connect message. `{title}` becomes the listing title |
| `showDemoListings` | `false` hides the sample listings completely |
| `categories` | Category list. Keep it in sync with `CATEGORIES` in `Code.gs` |

Share-friendly links: `…/#help` opens **I Can Help** and `…/#looking` opens **I'm Looking For**.

## Running locally
```bash
python -m http.server 8000   # then open http://localhost:8000
```
Opening `index.html` by double-clicking won't load the listings, because browsers block that.

## Ideas for later
Member profiles, member logins, referral tracking and an admin dashboard. These would need a proper backend (for example Django or Supabase). Only worth it once members are actually using the directory.
