/**
 * CEMS — Google Apps Script Backend
 * ===================================
 * SETUP:
 * 1. Create a new Google Sheet
 * 2. Extensions → Apps Script
 * 3. Delete any default code, paste THIS ENTIRE FILE
 * 4. Click Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL
 * 6. Paste that URL into js/db.js → GOOGLE_SCRIPT_URL
 * 7. Run seedFromScript() once from the Apps Script editor (optional)
 *    or open the website and use Reset Data
 */

var SHEET_NAME = 'CEMS_DATA';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'load';
    if (action === 'load') {
      return jsonResponse({ success: true, data: loadDatabase() });
    }
    if (action === 'ping') {
      return jsonResponse({ success: true, message: 'CEMS Google Sheet API is online' });
    }
    return jsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, message: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = body.action || 'save';

    if (action === 'save') {
      if (!body.data) {
        return jsonResponse({ success: false, message: 'No data provided' });
      }
      saveDatabase(body.data);
      return jsonResponse({ success: true, message: 'Saved' });
    }

    if (action === 'load') {
      return jsonResponse({ success: true, data: loadDatabase() });
    }

    return jsonResponse({ success: false, message: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, message: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function loadDatabase() {
  var sheet = getDataSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null; // empty — frontend will use defaults / seed
  }
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    var val = values[i][1];
    if (!key) continue;
    if (typeof val === 'string' && (val.charAt(0) === '{' || val.charAt(0) === '[')) {
      try {
        map[key] = JSON.parse(val);
      } catch (err) {
        map[key] = val;
      }
    } else {
      map[key] = val;
    }
  }

  // Prefer full snapshot if present
  if (map._full) {
    return map._full;
  }

  // Reconstruct from keys
  return {
    users: map.users || [],
    departments: map.departments || [],
    classes: map.classes || [],
    students: map.students || [],
    faculty: map.faculty || [],
    subjects: map.subjects || [],
    halls: map.halls || [],
    desks: map.desks || [],
    exams: map.exams || [],
    participants: map.participants || [],
    seatings: map.seatings || [],
    duties: map.duties || [],
    attendance: map.attendance || [],
    settings: map.settings || {},
    session: null,
    seeded: !!map.seeded
  };
}

function saveDatabase(data) {
  var sheet = getDataSheet_();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);

  // Store full snapshot for reliable round-trip
  var clone = JSON.parse(JSON.stringify(data));
  clone.session = null; // never persist browser session in sheet

  var rows = [
    ['_full', JSON.stringify(clone)],
    ['seeded', clone.seeded ? 'true' : 'false'],
    ['updated_at', new Date().toISOString()],
    // Also store readable entity counts for humans opening the sheet
    ['students_count', String((clone.students || []).length)],
    ['faculty_count', String((clone.faculty || []).length)],
    ['exams_count', String((clone.exams || []).length)],
    ['halls_count', String((clone.halls || []).length)],
    ['seatings_count', String((clone.seatings || []).length)]
  ];

  // Optional: store main lists in separate rows for partial readability
  var listKeys = ['users', 'departments', 'classes', 'students', 'faculty', 'subjects',
    'halls', 'desks', 'exams', 'participants', 'seatings', 'duties', 'attendance', 'settings'];
  for (var i = 0; i < listKeys.length; i++) {
    var k = listKeys[i];
    if (clone[k] !== undefined) {
      rows.push([k, JSON.stringify(clone[k])]);
    }
  }

  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 600);
}

/**
 * Optional: run once from Apps Script editor to verify sheet works
 */
function testSaveLoad() {
  var sample = {
    seeded: true,
    users: [{ id: 1, username: 'admin', role: 'admin' }],
    students: [],
    faculty: [],
    departments: [],
    classes: [],
    subjects: [],
    halls: [],
    desks: [],
    exams: [],
    participants: [],
    seatings: [],
    duties: [],
    attendance: [],
    settings: { college_name: 'Test College' },
    session: null
  };
  saveDatabase(sample);
  var loaded = loadDatabase();
  Logger.log(JSON.stringify(loaded).substring(0, 200));
}
