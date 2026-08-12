# CEMS — College Exam Management & Seating System

**Pure HTML + CSS + JavaScript.** No Python. No server install.

Open `index.html` in Chrome / Edge, or host the folder on GitHub Pages / any static host.

Data is stored in **Google Sheets** (shared database). Browser keeps a fast local cache.

---

## How it works

| Who | What they do |
|-----|----------------|
| **Admin** | Login → add students, halls, exams → generate seating → logout |
| **Students** | Open site → Find My Seat → enter register number → see hall & desk |
| **Faculty** | Login → view duty / mark attendance |

All admin changes save to **Google Sheet**.  
Students always read the **latest** seating from the Sheet.

Refresh does **not** delete Sheet data.

---

## One-time Google Sheet setup

1. Create a Google Spreadsheet.
2. **Extensions → Apps Script**
3. Delete any code → paste full contents of `google-apps-script.js`
4. **Save**
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web App URL
7. Paste it in `js/db.js`:

```js
GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_ID/exec',
```

Or set it later in Admin → Settings → Google Sheet URL.

After any script change: **Deploy → Manage deployments → Edit → New version → Deploy**

---

## Run (no install)

```
cems-static/
  index.html      ← double-click this
  login.html
  admin.html
  find-seat.html
  faculty.html
  css/
  js/
  google-apps-script.js
```

Or upload the whole folder to **GitHub Pages**.

---

## Login

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Faculty | faculty ID (e.g. FAC001) | set by admin |

Change admin password after first login if needed (edit user in data / Settings).

---

## Admin checklist

1. Departments → Classes → Subjects  
2. Students (CSV import OK for 60–300+)  
3. Faculty  
4. Exam Halls (rows × columns)  
5. Examinations  
6. Seating Arrangement → Generate  
7. Done — students can search seats  

---

## Student flow

1. Open site (phone OK)  
2. **Find My Seat**  
3. Enter register number  
4. See hall, desk, map  

---

## Important rules

- **One admin device** at a time (avoids Sheet overwrite conflicts).
- Do **not** use Settings → Reset unless you want to wipe everything.
- Internet needed for Sheet sync; without internet, local cache still shows last data.
- 100+ students reading seats is fine (read-only from Sheet).

---

## Files you need

| File | Purpose |
|------|---------|
| `index.html` | Home |
| `login.html` | Login |
| `admin.html` | Admin panel |
| `find-seat.html` | Student seat search |
| `faculty.html` | Faculty portal |
| `js/db.js` | Database + Sheet sync |
| `js/app.js` | UI logic |
| `css/style.css` | Design |
| `google-apps-script.js` | Sheet backend (paste in Apps Script) |

Python / `server.py` is **not required**.
