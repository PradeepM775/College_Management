/**
 * CEMS — Google Apps Script Backend
 * ===================================
 * SETUP:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script → paste this full file → Save
 * 3. Deploy → New deployment → Web app
 *    Execute as: Me | Who has access: Anyone
 * 4. Copy Web App URL into js/db.js → GOOGLE_SCRIPT_URL
 *
 * OPTIONAL — Students import tab:
 * Create a sheet tab named "Students" with header row:
 * register_number | name | gender | department_code | class_name | year | email | phone
 */

var DATA_SHEET = 'CEMS_DATA';
var STUDENTS_TAB = 'Students';

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'load';
    var p = e && e.parameter ? e.parameter : {};

    if (action === 'load') {
      return jsonResponse({ success: true, data: loadDatabase() });
    }
    if (action === 'ping') {
      return jsonResponse({ success: true, message: 'CEMS Google Sheet API is online' });
    }
    if (action === 'importStudents') {
      var tab = p.sheet || STUDENTS_TAB;
      return jsonResponse({ success: true, rows: readSheetAsObjects_(tab), sheet: tab });
    }
    if (action === 'listSheets') {
      return jsonResponse({ success: true, sheets: listSheetNames_() });
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
      if (!body.data) return jsonResponse({ success: false, message: 'No data provided' });
      saveDatabase(body.data);
      return jsonResponse({ success: true, message: 'Saved' });
    }
    if (action === 'load') {
      return jsonResponse({ success: true, data: loadDatabase() });
    }
    if (action === 'importStudents') {
      var tab = body.sheet || STUDENTS_TAB;
      return jsonResponse({ success: true, rows: readSheetAsObjects_(tab), sheet: tab });
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

function listSheetNames_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().map(function (s) { return s.getName(); });
}

/**
 * Reads first row as headers, remaining rows as objects.
 */
function readSheetAsObjects_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tab not found: ' + sheetName + '. Create a tab named "' + sheetName + '" with student columns.');
  }
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  var headers = values[0].map(function (h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, '_');
  });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var val = row[c];
      if (val !== null && val !== undefined && String(val).trim() !== '') empty = false;
      // Dates → ISO date string
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[headers[c]] = val !== null && val !== undefined ? String(val).trim() : '';
    }
    if (!empty) rows.push(obj);
  }
  return rows;
}

function getDataSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DATA_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DATA_SHEET);
    sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function loadDatabase() {
  var sheet = getDataSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    var val = values[i][1];
    if (!key) continue;
    if (typeof val === 'string' && (val.charAt(0) === '{' || val.charAt(0) === '[')) {
      try { map[key] = JSON.parse(val); } catch (err) { map[key] = val; }
    } else {
      map[key] = val;
    }
  }
  if (map._full) return map._full;
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
    history: map.history || [],
    settings: map.settings || {},
    session: null,
    seeded: !!map.seeded
  };
}

function saveDatabase(data) {
  var sheet = getDataSheet_();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  var clone = JSON.parse(JSON.stringify(data));
  clone.session = null;
  var rows = [
    ['_full', JSON.stringify(clone)],
    ['seeded', clone.seeded ? 'true' : 'false'],
    ['updated_at', new Date().toISOString()],
    ['students_count', String((clone.students || []).length)],
    ['faculty_count', String((clone.faculty || []).length)],
    ['exams_count', String((clone.exams || []).length)],
    ['halls_count', String((clone.halls || []).length)],
    ['seatings_count', String((clone.seatings || []).length)]
  ];
  var listKeys = ['users', 'departments', 'classes', 'students', 'faculty', 'subjects',
    'halls', 'desks', 'exams', 'participants', 'seatings', 'duties', 'attendance', 'history', 'settings'];
  for (var i = 0; i < listKeys.length; i++) {
    var k = listKeys[i];
    if (clone[k] !== undefined) rows.push([k, JSON.stringify(clone[k])]);
  }
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 600);
}

function testSaveLoad() {
  var sample = {
    seeded: true,
    users: [{ id: 1, username: 'admin', role: 'admin' }],
    students: [], faculty: [], departments: [], classes: [], subjects: [],
    halls: [], desks: [], exams: [], participants: [], seatings: [],
    duties: [], attendance: [], settings: { college_name: 'Test College' }, session: null
  };
  saveDatabase(sample);
  Logger.log(JSON.stringify(loadDatabase()).substring(0, 200));
}
