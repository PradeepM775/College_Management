/* CEMS Database Layer
   - Primary: Google Sheets (via Apps Script Web App)
   - Cache / offline fallback: localStorage
*/

const DB = {
  KEY: 'cems_data_v1',

  /**
   * PASTE your Google Apps Script Web App URL here after deployment.
   * Example: 'https://script.google.com/macros/s/XXXX/exec'
   * Leave empty '' to use localStorage only.
   */
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby3qJWPOhWQVzdCrKlarYzNY2RmoaUrm1yNTUVM1gMPzvx1WKHqfUk7RVaNldB33ygW/exec',

  syncState: 'idle',
  lastError: null,
  _cache: null,

  defaultData() {
    return {
      users: [],
      departments: [],
      classes: [],
      students: [],
      faculty: [],
      subjects: [],
      halls: [],
      desks: [],
      exams: [],
      participants: [],
      seatings: [],
      duties: [],
      attendance: [],
      settings: {
        college_name: 'Greenwood College of Arts & Science',
        academic_year: '2025-26',
        default_seating_strategy: 'alternate'
      },
      session: null,
      seeded: false
    };
  },

  loadLocal() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this.defaultData();
  },

  saveLocal(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage save failed', e);
    }
  },

  useGoogle() {
    return !!(this.GOOGLE_SCRIPT_URL && this.GOOGLE_SCRIPT_URL.indexOf('https://') === 0);
  },

  async fetchFromGoogle() {
    if (!this.useGoogle()) return null;
    this.syncState = 'loading';
    try {
      const url = this.GOOGLE_SCRIPT_URL + (this.GOOGLE_SCRIPT_URL.indexOf('?') >= 0 ? '&' : '?') + 'action=load';
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const json = await res.json();
      if (json && json.success && json.data) {
        this.syncState = 'online';
        this.lastError = null;
        const local = this.loadLocal();
        json.data.session = local.session || null;
        return json.data;
      }
      this.syncState = 'error';
      this.lastError = (json && json.message) || 'Load failed';
      return null;
    } catch (err) {
      this.syncState = 'offline';
      this.lastError = String(err);
      console.warn('Google Sheets load failed, using local cache', err);
      return null;
    }
  },

  async pushToGoogle(data) {
    if (!this.useGoogle()) return false;
    this.syncState = 'saving';
    try {
      const payload = JSON.parse(JSON.stringify(data));
      payload.session = null;
      const res = await fetch(this.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', data: payload })
      });
      const json = await res.json();
      if (json && json.success) {
        this.syncState = 'online';
        this.lastError = null;
        return true;
      }
      this.syncState = 'error';
      this.lastError = (json && json.message) || 'Save failed';
      return false;
    } catch (err) {
      this.syncState = 'offline';
      this.lastError = String(err);
      console.warn('Google Sheets save failed', err);
      return false;
    }
  },

  get() {
    if (this._cache) return this._cache;
    this._cache = this.loadLocal();
    return this._cache;
  },

  update(fn) {
    const data = this.get();
    fn(data);
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) {
      this.pushToGoogle(data);
    }
    return data;
  },

  hash(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) - h) + pw.charCodeAt(i) | 0;
    return 'h' + Math.abs(h).toString(36);
  },

  nextId(arr) {
    if (!arr || !arr.length) return 1;
    return Math.max.apply(null, arr.map(function (x) { return x.id; })) + 1;
  },

  buildSeed() {
    const data = this.defaultData();
    const self = this;

    data.departments = [
      { id: 1, name: 'B.Sc Computer Science', code: 'BSC-CS', status: 'Active' },
      { id: 2, name: 'B.Sc Mathematics', code: 'BSC-MATH', status: 'Active' },
      { id: 3, name: 'B.A English', code: 'BA-ENG', status: 'Active' },
      { id: 4, name: 'B.Com', code: 'BCOM', status: 'Active' }
    ];

    data.classes = [
      { id: 1, name: 'II B.Sc CS', department_id: 1, course: 'B.Sc Computer Science', year: 2, section: 'A', academic_year: '2025-26' },
      { id: 2, name: 'III B.Sc CS', department_id: 1, course: 'B.Sc Computer Science', year: 3, section: 'A', academic_year: '2025-26' },
      { id: 3, name: 'II B.Sc Math', department_id: 2, course: 'B.Sc Mathematics', year: 2, section: 'A', academic_year: '2025-26' },
      { id: 4, name: 'II B.A English', department_id: 3, course: 'B.A English', year: 2, section: 'A', academic_year: '2025-26' },
      { id: 5, name: 'II B.Com', department_id: 4, course: 'B.Com', year: 2, section: 'A', academic_year: '2025-26' }
    ];

    data.subjects = [
      { id: 1, subject_code: 'CS201', name: 'Data Structures', department_id: 1, semester: 3, credits: 4 },
      { id: 2, subject_code: 'CS202', name: 'Database Management Systems', department_id: 1, semester: 3, credits: 4 },
      { id: 3, subject_code: 'MA201', name: 'Linear Algebra', department_id: 2, semester: 3, credits: 4 },
      { id: 4, subject_code: 'EN201', name: 'British Literature', department_id: 3, semester: 3, credits: 3 },
      { id: 5, subject_code: 'CM201', name: 'Financial Accounting', department_id: 4, semester: 3, credits: 4 }
    ];

    const firstNames = ['Aarav','Aditi','Arjun','Ananya','Rohan','Priya','Vikram','Sneha','Karan','Meera',
      'Rahul','Divya','Amit','Pooja','Suresh','Kavya','Nikhil','Riya','Varun','Isha',
      'Siddharth','Neha','Abhishek','Shreya','Manish','Anjali','Deepak','Swati','Rajesh','Lakshmi',
      'Karthik','Divya','Gokul','Harini','Jagan','Lakshmi','Mohan','Nandini'];
    const lastNames = ['Sharma','Patel','Kumar','Singh','Reddy','Nair','Gupta','Iyer','Joshi','Mehta'];
    data.students = [];
    let reg = 24001;
    for (let i = 0; i < 15; i++) {
      data.students.push({
        id: i + 1, student_id: 'STU' + reg, register_number: String(reg),
        name: firstNames[i] + ' ' + lastNames[i % 10],
        gender: i % 2 === 0 ? 'Male' : 'Female',
        department_id: 1, class_id: 1, course: 'B.Sc Computer Science',
        year: 2, academic_year: '2025-26', email: 'student' + reg + '@college.edu',
        phone: '98765' + String(reg).slice(-5), status: 'Active'
      });
      reg++;
    }
    for (let i = 0; i < 10; i++) {
      data.students.push({
        id: 16 + i, student_id: 'STU' + reg, register_number: String(reg),
        name: firstNames[(i + 5) % 38] + ' ' + lastNames[(i + 3) % 10],
        gender: i % 2 === 0 ? 'Male' : 'Female',
        department_id: 2, class_id: 3, course: 'B.Sc Mathematics',
        year: 2, academic_year: '2025-26', email: 'student' + reg + '@college.edu',
        phone: '98765' + String(reg).slice(-5), status: 'Active'
      });
      reg++;
    }
    for (let i = 0; i < 8; i++) {
      data.students.push({
        id: 26 + i, student_id: 'STU' + reg, register_number: String(reg),
        name: firstNames[(i + 10) % 38] + ' ' + lastNames[(i + 5) % 10],
        gender: i % 2 === 0 ? 'Female' : 'Male',
        department_id: 3, class_id: 4, course: 'B.A English',
        year: 2, academic_year: '2025-26', email: 'student' + reg + '@college.edu',
        phone: '98765' + String(reg).slice(-5), status: 'Active'
      });
      reg++;
    }
    for (let i = 0; i < 5; i++) {
      data.students.push({
        id: 34 + i, student_id: 'STU' + reg, register_number: String(reg),
        name: firstNames[(i + 15) % 38] + ' ' + lastNames[(i + 7) % 10],
        gender: i % 2 === 0 ? 'Male' : 'Female',
        department_id: 4, class_id: 5, course: 'B.Com',
        year: 2, academic_year: '2025-26', email: 'student' + reg + '@college.edu',
        phone: '98765' + String(reg).slice(-5), status: 'Active'
      });
      reg++;
    }

    data.faculty = [
      { id: 1, faculty_id: 'FAC001', name: 'Dr. Ramesh Kumar', department_id: 1, designation: 'Professor', email: 'ramesh@college.edu', phone: '9876500001', status: 'Active' },
      { id: 2, faculty_id: 'FAC002', name: 'Prof. Sunita Rao', department_id: 1, designation: 'Associate Professor', email: 'sunita@college.edu', phone: '9876500002', status: 'Active' },
      { id: 3, faculty_id: 'FAC003', name: 'Dr. Anil Mehta', department_id: 2, designation: 'Professor', email: 'anil@college.edu', phone: '9876500003', status: 'Active' },
      { id: 4, faculty_id: 'FAC004', name: 'Ms. Priya Nair', department_id: 3, designation: 'Assistant Professor', email: 'priya@college.edu', phone: '9876500004', status: 'Active' },
      { id: 5, faculty_id: 'FAC005', name: 'Mr. Suresh Iyer', department_id: 4, designation: 'Associate Professor', email: 'suresh@college.edu', phone: '9876500005', status: 'Active' }
    ];

    data.users = [
      { id: 1, username: 'admin', password: self.hash('admin123'), role: 'admin', name: 'Administrator' },
      { id: 2, username: 'FAC001', password: self.hash('faculty123'), role: 'faculty', faculty_id: 1, name: 'Dr. Ramesh Kumar' },
      { id: 3, username: 'FAC002', password: self.hash('faculty123'), role: 'faculty', faculty_id: 2, name: 'Prof. Sunita Rao' },
      { id: 4, username: 'FAC003', password: self.hash('faculty123'), role: 'faculty', faculty_id: 3, name: 'Dr. Anil Mehta' }
    ];

    const hallsData = [
      { num: 'Hall 101', building: 'Main Block', block: 'A', floor: 'First Floor', rows: 5, cols: 6 },
      { num: 'Hall 102', building: 'Main Block', block: 'A', floor: 'First Floor', rows: 5, cols: 6 },
      { num: 'Hall 201', building: 'Science Block', block: 'B', floor: 'Second Floor', rows: 6, cols: 5 }
    ];
    data.halls = [];
    data.desks = [];
    let deskId = 1;
    hallsData.forEach(function (h, idx) {
      const capacity = h.rows * h.cols;
      const hallId = idx + 1;
      data.halls.push({
        id: hallId, hall_number: h.num, building: h.building, block: h.block,
        floor: h.floor, room_number: h.num.split(' ')[1], total_desks: capacity,
        rows: h.rows, columns: h.cols, capacity: capacity, status: 'Available'
      });
      let dn = 1;
      for (let r = 1; r <= h.rows; r++) {
        for (let c = 1; c <= h.cols; c++) {
          data.desks.push({ id: deskId++, hall_id: hallId, desk_number: dn++, row: r, column: c, status: 'Available' });
        }
      }
    });

    const today = new Date();
    const d1 = new Date(today); d1.setDate(d1.getDate() + 5);
    const d2 = new Date(today); d2.setDate(d2.getDate() + 7);
    const d3 = new Date(today); d3.setDate(d3.getDate() + 10);
    const fmt = function (d) { return d.toISOString().slice(0, 10); };
    const dayName = function (d) { return d.toLocaleDateString('en-US', { weekday: 'long' }); };

    data.exams = [
      { id: 1, exam_id: 'EXAM001', name: 'Data Structures - Semester Exam', academic_year: '2025-26', semester: 3, exam_type: 'Semester Exam', subject_id: 1, date: fmt(d1), day: dayName(d1), start_time: '10:00', end_time: '13:00', status: 'Upcoming' },
      { id: 2, exam_id: 'EXAM002', name: 'DBMS - Semester Exam', academic_year: '2025-26', semester: 3, exam_type: 'Semester Exam', subject_id: 2, date: fmt(d2), day: dayName(d2), start_time: '10:00', end_time: '13:00', status: 'Upcoming' },
      { id: 3, exam_id: 'EXAM003', name: 'Linear Algebra - Semester Exam', academic_year: '2025-26', semester: 3, exam_type: 'Semester Exam', subject_id: 3, date: fmt(d1), day: dayName(d1), start_time: '14:00', end_time: '17:00', status: 'Upcoming' },
      { id: 4, exam_id: 'EXAM004', name: 'Common Aptitude Test', academic_year: '2025-26', semester: 3, exam_type: 'Common Test', subject_id: 1, date: fmt(d3), day: dayName(d3), start_time: '10:00', end_time: '12:00', status: 'Upcoming' }
    ];

    data.participants = [
      { id: 1, exam_id: 1, class_id: 1 },
      { id: 2, exam_id: 2, class_id: 1 },
      { id: 3, exam_id: 3, class_id: 3 },
      { id: 4, exam_id: 4, class_id: 1 },
      { id: 5, exam_id: 4, class_id: 3 },
      { id: 6, exam_id: 4, class_id: 4 }
    ];

    const csStudents = data.students.filter(function (s) { return s.class_id === 1; });
    const hall1Desks = data.desks.filter(function (d) { return d.hall_id === 1; }).sort(function (a, b) { return a.desk_number - b.desk_number; });
    data.seatings = [];
    csStudents.forEach(function (stu, i) {
      if (i < hall1Desks.length) {
        data.seatings.push({
          id: i + 1, exam_id: 1, student_id: stu.id,
          hall_id: 1, desk_id: hall1Desks[i].id, strategy_used: 'sequential'
        });
      }
    });

    data.duties = [
      { id: 1, faculty_id: 1, exam_id: 1, hall_id: 1, date: fmt(d1), start_time: '10:00', end_time: '13:00', duty_type: 'Hall Supervisor', status: 'Assigned' },
      { id: 2, faculty_id: 2, exam_id: 1, hall_id: 1, date: fmt(d1), start_time: '10:00', end_time: '13:00', duty_type: 'Assistant Supervisor', status: 'Assigned' }
    ];

    data.attendance = [];
    data.seeded = true;
    return data;
  },

  seed() {
    let data = this.loadLocal();
    if (data.seeded) {
      this._cache = data;
      return data;
    }
    data = this.buildSeed();
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) {
      this.pushToGoogle(data);
    }
    return data;
  },

  async reset() {
    const data = this.buildSeed();
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) {
      await this.pushToGoogle(data);
    }
    return data;
  },

  async init() {
    // 1) Instant: local cache / seed (no network wait)
    let data = this.loadLocal();
    if (!data.seeded) {
      data = this.buildSeed();
      this.saveLocal(data);
    }
    this._cache = data;

    // 2) Background: pull Google Sheet and refresh cache (non-blocking for UI)
    if (this.useGoogle()) {
      this._backgroundSync();
    }
    return data;
  },

  async _backgroundSync() {
    try {
      const remote = await this.fetchFromGoogle();
      if (remote && remote.seeded) {
        const local = this.loadLocal();
        remote.session = (this._cache && this._cache.session) || local.session || null;
        this._cache = remote;
        this.saveLocal(remote);
        // Notify pages that data refreshed
        try {
          window.dispatchEvent(new CustomEvent('cems-data-synced', { detail: remote }));
        } catch (e) {}
      } else if (this._cache && this._cache.seeded) {
        // Sheet empty — push local seed once
        await this.pushToGoogle(this._cache);
      }
    } catch (e) {
      console.warn('Background sheet sync failed', e);
    }
  },

  /** Force refresh from Google (pull) */
  async syncNow() {
    if (!this.useGoogle()) return this.get();
    const remote = await this.fetchFromGoogle();
    if (remote && remote.seeded) {
      remote.session = (this._cache && this._cache.session) || null;
      this._cache = remote;
      this.saveLocal(remote);
      return remote;
    }
    return this.get();
  }
};

DB.initPromise = DB.init();
