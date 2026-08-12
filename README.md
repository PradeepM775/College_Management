# CEMS — College Exam Management & Seating System

Pure HTML / CSS / JavaScript. Database can use **Google Sheets** or browser localStorage.

---

## Google Sheets setup (recommended)

### Step 1 — Create a Google Sheet
1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a blank spreadsheet (name it e.g. `CEMS Database`)

### Step 2 — Add Apps Script
1. In the sheet: **Extensions → Apps Script**
2. Delete any default code
3. Open the project file `google-apps-script.js` and **copy all of it**
4. Paste into the Apps Script editor
5. Click **Save** (disk icon)

### Step 3 — Deploy as Web App
1. Click **Deploy → New deployment**
2. Gear icon → choose **Web app**
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Authorize your Google account when asked
6. **Copy the Web App URL**  
   (looks like `https://script.google.com/macros/s/XXXX/exec`)

### Step 4 — Connect the website
1. Open `js/db.js`
2. Find this line:

```js
GOOGLE_SCRIPT_URL: '',
```

3. Paste your URL:

```js
GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/XXXX/exec',
```

4. Save the file

### Step 5 — Open the website
- Open `index.html` in the browser (or host the folder)
- First load will seed demo data into the Google Sheet
- Any add / edit / delete on the website is saved to the Sheet
- Reload / another browser loads the same Sheet data

---

## How sync works

| Action on website | Result |
|-------------------|--------|
| Add student / exam / hall | Saved to Google Sheet |
| Edit / delete | Updated in Google Sheet |
| Generate seating | Saved to Google Sheet |
| Open site on another PC | Loads latest Sheet data |

If the internet is down, the site uses localStorage cache until online again.

---

## Without Google Sheets
Leave `GOOGLE_SCRIPT_URL` as `''`. Data stays in the browser only (localStorage).

---

## Demo login

| Role    | Username | Password    |
|---------|----------|-------------|
| Admin   | admin    | admin123    |
| Faculty | FAC001   | faculty123  |

Student seat search: `24001` – `24038`

---

## Files

```
cems-static/
├── index.html
├── login.html
├── find-seat.html
├── admin.html
├── faculty.html
├── css/style.css
├── js/db.js                 ← put Google Script URL here
├── js/app.js
├── google-apps-script.js    ← paste into Apps Script
└── README.md
```
