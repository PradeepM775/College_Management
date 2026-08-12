/**
 * CEMS — Google Apps Script (FULL REPLACE)
 * ========================================
 * 1. Extensions → Apps Script
 * 2. Delete ALL old code
 * 3. Paste THIS entire file
 * 4. Save
 * 5. Deploy → Manage deployments → pencil → Version: New version → Deploy
 *
 * Supported actions:
 *   load, save, ping, importStudents, listSheets
 */

var DATA_SHEET = 'CEMS_DATA';

function doGet(e) {
  return handleRequest_(e, null);
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    return json_({ success: false, message: 'Invalid JSON body: ' + err });
  }
  return handleRequest_(e, body);
}

function handleRequest_(e, body) {
  try {
    body = body || {};
    var params = (e && e.parameter) ? e.parameter : {};
    var action = body.action || params.action || 'load';
    action = String(action).toLowerCase().replace(/[^a-z]/g, '');

    // aliases
    if (action === 'import' || action === 'importsheet' || action === 'readsheet') {
      action = 'importstudents';
    }

    if (action === 'ping' || action === 'health') {
      return json_({ success: true, message: 'CEMS API online', version: 3 });
    }

    if (action === 'load' || action === 'get') {
      return json_({ success: true, data: loadDatabase_() });
    }

    if (action === 'save' || action === 'put') {
      if (!body.data) return json_({ success: false, message: 'No data provided' });
      saveDatabase_(body.data);
      return json_({ success: true, message: 'Saved' });
    }

    if (action === 'importstudents') {
      var tab = body.sheet || params.sheet || 'Students';
      var rows = readSheetAsObjects_(tab);
      return json_({ success: true, rows: rows, sheet: tab, count: rows.length });
    }

    if (action === 'listsheets') {
      return json_({ success: true, sheets: listSheetNames_() });
    }

    return json_({
      success: false,
      message: 'Unknown action: ' + action + '. Deploy latest google-apps-script.js (version 3).'
    });
  } catch (err) {
    return json_({ success: false, message: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function listSheetNames_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
    return s.getName();
  });
}

function readSheetAsObjects_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tab not found: "' + sheetName + '". Create that tab with a header row.');
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

function loadDatabase_() {
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
    admin_lock: map.admin_lock || null,
    settings: map.settings || {},
    session: null,
    seeded: !!map.seeded
  };
}

function saveDatabase_(data) {
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
    'halls', 'desks', 'exams', 'participants', 'seatings', 'duties', 'attendance',
    'history', 'admin_lock', 'settings'];
  for (var i = 0; i < listKeys.length; i++) {
    var k = listKeys[i];
    if (clone[k] !== undefined) rows.push([k, JSON.stringify(clone[k])]);
  }
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 600);
}
