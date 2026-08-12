/* CEMS Application Logic */
const App = {
  toast(msg, type = 'info', duration = 3000) {
    let c = document.querySelector('.toast-container');
    if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, duration);
  },

  formatDate(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  initTheme() {
    const t = localStorage.getItem('cems-theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cems-theme', next);
  },

  setSession(user) {
    DB.update(d => { d.session = user; });
    try { sessionStorage.setItem('cems_session', JSON.stringify(user)); } catch (e) {}
  },

  logout() {
    DB.update(d => { d.session = null; });
    try { sessionStorage.removeItem('cems_session'); } catch (e) {}
    window.location.href = 'index.html';
  },

  getSession() {
    let s = DB.get().session;
    if (s) return s;
    try {
      const raw = sessionStorage.getItem('cems_session');
      if (raw) {
        s = JSON.parse(raw);
        DB.update(d => { d.session = s; });
        return s;
      }
    } catch (e) {}
    return null;
  },

  requireAuth(role) {
    const s = this.getSession();
    if (!s) { window.location.href = 'login.html'; return null; }
    if (role && s.role !== role && s.role !== 'admin') {
      this.toast('Access denied', 'error');
      window.location.href = 'index.html';
      return null;
    }
    return s;
  },

  openModal(id) { document.getElementById(id)?.classList.add('active'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('active'); },

  // Lookups
  deptName(id) {
    const d = DB.get().departments.find(x => x.id === id);
    return d ? d.name : '';
  },
  className(id) {
    const c = DB.get().classes.find(x => x.id === id);
    return c ? c.name : '';
  },
  subjectName(id) {
    const s = DB.get().subjects.find(x => x.id === id);
    return s ? s.name : '';
  },
  subjectCode(id) {
    const s = DB.get().subjects.find(x => x.id === id);
    return s ? s.subject_code : '';
  },
  hallById(id) {
    return DB.get().halls.find(x => x.id === id);
  },
  deskById(id) {
    return DB.get().desks.find(x => x.id === id);
  },
  studentById(id) {
    return DB.get().students.find(x => x.id === id);
  },
  facultyById(id) {
    return DB.get().faculty.find(x => x.id === id);
  }
};

document.addEventListener('DOMContentLoaded', () => App.initTheme());


/* ========== AUTH ========== */
function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    App.toast('Enter username and password', 'warning');
    return;
  }

  function doLogin() {
    const data = DB.get();
    // Ensure users exist
    if (!data.users || !data.users.length) {
      const seeded = DB.buildSeed();
      DB._cache = seeded;
      DB.saveLocal(seeded);
    }
    const users = DB.get().users || [];
    const user = users.find(u =>
      String(u.username).toLowerCase() === username &&
      u.password === DB.hash(password)
    );

    if (!user) {
      App.toast('Invalid username or password', 'error');
      return;
    }

    App.setSession({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      faculty_id: user.faculty_id
    });
    App.toast('Login successful', 'success');

    setTimeout(function () {
      if (user.role === 'admin') window.location.href = 'admin.html';
      else if (user.role === 'faculty') window.location.href = 'faculty.html';
      else window.location.href = 'index.html';
    }, 300);
  }

  if (DB.initPromise) {
    DB.initPromise.then(doLogin).catch(doLogin);
  } else {
    doLogin();
  }
}

/* ========== HOME TIMETABLE ========== */
function loadHomeTimetable() {
  const tbody = document.getElementById('timetableBody');
  if (!tbody) return;
  const data = DB.get();
  const exams = data.exams.filter(e => e.status === 'Upcoming' || e.status === 'Ongoing');

  if (!exams.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No upcoming examinations</td></tr>';
    return;
  }

  tbody.innerHTML = exams.map(e => {
    const parts = data.participants.filter(p => p.exam_id === e.id);
    const classNames = parts.map(p => App.className(p.class_id)).join(', ');
    const deptIds = [...new Set(parts.map(p => {
      const c = data.classes.find(x => x.id === p.class_id);
      return c ? c.department_id : null;
    }).filter(Boolean))];
    const depts = deptIds.map(id => App.deptName(id)).join(', ');
    return `<tr>
      <td><strong>${App.subjectName(e.subject_id)}</strong><br><small class="text-muted">${App.subjectCode(e.subject_id)}</small></td>
      <td>${App.formatDate(e.date)}</td>
      <td>${e.day}</td>
      <td>${e.start_time} – ${e.end_time}</td>
      <td>${classNames || '—'}</td>
      <td>${depts || '—'}</td>
      <td>${e.exam_type}</td>
      <td><span class="badge badge-info">${e.status}</span></td>
    </tr>`;
  }).join('');
}

/* ========== STUDENT SEAT FINDER ========== */
function findSeat(e) {
  e.preventDefault();
  const raw = document.getElementById('regNumber').value.trim();
  const reg = raw.toUpperCase();
  const area = document.getElementById('resultArea');
  if (!reg) {
    App.toast('Please enter a register number', 'warning');
    return;
  }

  const data = DB.get();
  const student = data.students.find(s =>
    String(s.register_number).trim().toUpperCase() === reg && s.status === 'Active'
  );

  if (!student) {
    area.innerHTML = `<div class="card"><div class="card-body empty-state">
      <h3>Register number not found</h3>
      <p>No student matches “${raw}”. Check the number and try again.</p>
    </div></div>`;
    return;
  }

  const seatings = data.seatings.filter(s => s.student_id === student.id);
  if (!seatings.length) {
    area.innerHTML = `<div class="card"><div class="card-body empty-state">
      <h3>${student.name}</h3>
      <p>Register number ${student.register_number} is registered, but no seating arrangement is available yet.</p>
    </div></div>`;
    return;
  }

  const s = seatings[0];
  const exam = data.exams.find(x => x.id === s.exam_id);
  const hall = App.hallById(s.hall_id);
  const desk = App.deskById(s.desk_id);

  let html = `<div class="result-card">
    <div class="result-header">
      <h3>Student Exam Details</h3>
      <div class="exam-name">${exam ? exam.name : ''}</div>
    </div>
    <div class="result-body">
      <div class="result-grid">
        <div class="result-item"><label>Student Name</label><span>${student.name}</span></div>
        <div class="result-item"><label>Register Number</label><span>${student.register_number}</span></div>
        <div class="result-item"><label>Class</label><span>${App.className(student.class_id)}</span></div>
        <div class="result-item"><label>Department</label><span>${App.deptName(student.department_id)}</span></div>
        <div class="result-item"><label>Subject</label><span>${exam ? App.subjectName(exam.subject_id) : ''}</span></div>
        <div class="result-item"><label>Date</label><span>${exam ? App.formatDate(exam.date) + ' (' + exam.day + ')' : ''}</span></div>
        <div class="result-item"><label>Time</label><span>${exam ? exam.start_time + ' – ' + exam.end_time : ''}</span></div>
        <div class="result-item"><label>Hall</label><span>${hall ? hall.hall_number : ''}</span></div>
        <div class="result-item"><label>Building</label><span>${hall ? hall.building + (hall.block ? ' / ' + hall.block : '') : ''}</span></div>
        <div class="result-item"><label>Floor</label><span>${hall ? hall.floor : ''}</span></div>
        <div class="result-item"><label>Desk Number</label><span>${desk ? desk.desk_number : ''}</span></div>
        <div class="result-item"><label>Row / Column</label><span>Row ${desk ? desk.row : ''}, Column ${desk ? desk.column : ''}</span></div>
      </div>
      <div class="seat-highlight">
        <div class="label">Your Assigned Seat</div>
        <div class="value">Desk ${desk ? desk.desk_number : ''}</div>
        <div class="text-muted" style="font-size:0.85rem;margin-top:4px;">Row ${desk ? desk.row : ''} · Column ${desk ? desk.column : ''}</div>
      </div>
      <div class="mt-3">
        <h4 class="text-center mb-2" style="font-size:0.95rem;">Seating Arrangement — ${hall ? hall.hall_number : ''}</h4>
        <div id="seatMap" class="seating-grid"></div>
      </div>
    </div>
  </div>`;

  area.innerHTML = html;
  renderHallMap('seatMap', s.hall_id, s.exam_id, desk ? desk.desk_number : null);
}

function renderHallMap(containerId, hallId, examId, highlightDesk) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const data = DB.get();
  const hall = App.hallById(hallId);
  if (!hall) return;

  const desks = data.desks.filter(d => d.hall_id === hallId).sort((a, b) => a.desk_number - b.desk_number);
  el.style.gridTemplateColumns = `repeat(${hall.columns}, minmax(56px, 68px))`;

  el.innerHTML = desks.map(d => {
    const seating = data.seatings.find(s => s.exam_id === examId && s.desk_id === d.id);
    let cls = 'desk-cell';
    if (highlightDesk && d.desk_number === highlightDesk) cls += ' highlight';
    else if (seating) cls += ' occupied';
    else cls += ' available';

    const stu = seating ? App.studentById(seating.student_id) : null;
    return `<div class="${cls}" title="${stu ? stu.register_number + ' - ' + stu.name : 'Available'}">
      <span class="desk-num">${String(d.desk_number).padStart(2, '0')}</span>
      ${stu ? `<span class="reg-num">${stu.register_number}</span>` : ''}
    </div>`;
  }).join('');
}

/* ========== ADMIN DASHBOARD ========== */
function loadAdminDashboard() {
  const data = DB.get();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('statStudents', data.students.filter(s => s.status === 'Active').length);
  set('statFaculty', data.faculty.filter(f => f.status === 'Active').length);
  set('statClasses', data.classes.length);
  set('statDepts', data.departments.length);
  set('statHalls', data.halls.length);
  set('statExams', data.exams.length);
  set('statDesks', data.desks.length);
  const today = new Date().toISOString().slice(0, 10);
  set('statToday', data.exams.filter(e => e.date === today).length);
  set('statSeatings', data.seatings.length);

  const chartEl = document.getElementById('deptChart');
  if (chartEl) {
    const max = Math.max(...data.departments.map(d => data.students.filter(s => s.department_id === d.id && s.status === 'Active').length), 1);
    chartEl.innerHTML = '<div class="bar-chart">' + data.departments.map(d => {
      const count = data.students.filter(s => s.department_id === d.id && s.status === 'Active').length;
      return `<div class="bar-row">
        <div class="bar-label"><span>${d.name}</span><span>${count}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max * 100)}%;"></div></div>
      </div>`;
    }).join('') + '</div>';
  }
}

/* ========== STUDENTS ========== */
function loadStudentsPanel() {
  const data = DB.get();
  const tbody = document.getElementById('studentsBody');
  if (!tbody) return;

  const search = (document.getElementById('stuSearch')?.value || '').toLowerCase();
  let list = data.students;
  if (search) {
    list = list.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.register_number.includes(search)
    );
  }

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No students found</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(s => `<tr>
    <td><strong>${s.register_number}</strong></td>
    <td>${s.name}</td>
    <td>${s.gender}</td>
    <td>${App.deptName(s.department_id)}</td>
    <td>${App.className(s.class_id)}</td>
    <td>${s.year}</td>
    <td><span class="badge badge-${s.status === 'Active' ? 'success' : 'danger'}">${s.status}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="editStudent(${s.id})">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id})">Delete</button>
    </td>
  </tr>`).join('');
}

function openAddStudent() {
  document.getElementById('stuModalTitle').textContent = 'Add Student';
  document.getElementById('stuForm').reset();
  document.getElementById('stuId').value = '';
  document.getElementById('stuAcademicYear').value = '2025-26';
  populateStudentSelects();
  App.openModal('studentModal');
}

function populateStudentSelects() {
  const data = DB.get();
  const deptSel = document.getElementById('stuDept');
  const classSel = document.getElementById('stuClass');
  if (deptSel) deptSel.innerHTML = data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  if (classSel) classSel.innerHTML = data.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function editStudent(id) {
  const s = App.studentById(id);
  if (!s) return;
  populateStudentSelects();
  document.getElementById('stuModalTitle').textContent = 'Edit Student';
  document.getElementById('stuId').value = s.id;
  document.getElementById('stuReg').value = s.register_number;
  document.getElementById('stuName').value = s.name;
  document.getElementById('stuGender').value = s.gender;
  document.getElementById('stuYear').value = s.year;
  document.getElementById('stuDept').value = s.department_id;
  document.getElementById('stuClass').value = s.class_id;
  document.getElementById('stuCourse').value = s.course;
  document.getElementById('stuAcademicYear').value = s.academic_year;
  document.getElementById('stuEmail').value = s.email || '';
  document.getElementById('stuPhone').value = s.phone || '';
  if (document.getElementById('stuStatus')) document.getElementById('stuStatus').value = s.status || 'Active';
  App.openModal('studentModal');
}

function saveStudent() {
  const id = document.getElementById('stuId').value;
  const reg = document.getElementById('stuReg').value.trim().toUpperCase();
  const name = document.getElementById('stuName').value.trim();
  if (!reg || !name) { App.toast('Register number and name required', 'warning'); return; }

  let ok = true;
  DB.update(data => {
    if (id) {
      const s = data.students.find(x => x.id === parseInt(id));
      if (!s) return;
      if (data.students.some(x => x.register_number === reg && x.id !== s.id)) {
        App.toast('Register number already exists', 'error'); ok = false; return;
      }
      s.register_number = reg; s.name = name;
      s.gender = document.getElementById('stuGender').value;
      s.year = parseInt(document.getElementById('stuYear').value);
      s.department_id = parseInt(document.getElementById('stuDept').value);
      s.class_id = parseInt(document.getElementById('stuClass').value);
      s.course = document.getElementById('stuCourse').value;
      s.academic_year = document.getElementById('stuAcademicYear').value;
      s.email = document.getElementById('stuEmail').value;
      s.phone = document.getElementById('stuPhone').value;
      if (document.getElementById('stuStatus')) s.status = document.getElementById('stuStatus').value;
    } else {
      if (data.students.some(x => x.register_number === reg)) {
        App.toast('Register number already exists', 'error'); ok = false; return;
      }
      data.students.push({
        id: DB.nextId(data.students),
        student_id: 'STU' + reg,
        register_number: reg, name,
        gender: document.getElementById('stuGender').value,
        year: parseInt(document.getElementById('stuYear').value),
        department_id: parseInt(document.getElementById('stuDept').value),
        class_id: parseInt(document.getElementById('stuClass').value),
        course: document.getElementById('stuCourse').value,
        academic_year: document.getElementById('stuAcademicYear').value,
        email: document.getElementById('stuEmail').value,
        phone: document.getElementById('stuPhone').value,
        status: document.getElementById('stuStatus') ? document.getElementById('stuStatus').value : 'Active'
      });
    }
  });
  if (!ok) return;
  App.closeModal('studentModal');
  App.toast(id ? 'Student updated' : 'Student added', 'success');
  loadStudentsPanel();
  loadAdminDashboard();
}

function deleteStudent(id) {
  if (!confirm('Delete this student?')) return;
  DB.update(data => {
    data.students = data.students.filter(s => s.id !== id);
    data.seatings = data.seatings.filter(s => s.student_id !== id);
    data.attendance = data.attendance.filter(a => a.student_id !== id);
  });
  App.toast('Student deleted', 'success');
  loadStudentsPanel();
  loadAdminDashboard();
}

/* ========== FACULTY CRUD ========== */
function loadFacultyPanel() {
  const tbody = document.getElementById('facultyBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.faculty.map(f => `<tr>
    <td><strong>${f.faculty_id}</strong></td>
    <td>${f.name}</td>
    <td>${App.deptName(f.department_id)}</td>
    <td>${f.designation}</td>
    <td>${f.email || ''}</td>
    <td>${f.phone || ''}</td>
    <td><span class="badge badge-${f.status === 'Active' ? 'success' : 'danger'}">${f.status}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="editFaculty(${f.id})">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteFaculty(${f.id})">Delete</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted">No faculty</td></tr>';
}

function openAddFaculty() {
  document.getElementById('facModalTitle').textContent = 'Add Faculty';
  document.getElementById('facForm').reset();
  document.getElementById('facId').value = '';
  document.getElementById('facPwHint').textContent = '(required for new)';
  const data = DB.get();
  document.getElementById('facDept').innerHTML = data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  App.openModal('facultyModal');
}

function editFaculty(id) {
  const f = App.facultyById(id);
  if (!f) return;
  const data = DB.get();
  document.getElementById('facDept').innerHTML = data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('facModalTitle').textContent = 'Edit Faculty';
  document.getElementById('facId').value = f.id;
  document.getElementById('facCode').value = f.faculty_id;
  document.getElementById('facName').value = f.name;
  document.getElementById('facDept').value = f.department_id;
  document.getElementById('facDesig').value = f.designation;
  document.getElementById('facEmail').value = f.email || '';
  document.getElementById('facPhone').value = f.phone || '';
  document.getElementById('facStatus').value = f.status;
  document.getElementById('facPassword').value = '';
  document.getElementById('facPwHint').textContent = '(leave blank to keep current)';
  App.openModal('facultyModal');
}

function saveFaculty() {
  const id = document.getElementById('facId').value;
  const code = document.getElementById('facCode').value.trim().toUpperCase();
  const name = document.getElementById('facName').value.trim();
  const password = document.getElementById('facPassword').value;
  if (!code || !name) { App.toast('Faculty ID and name required', 'warning'); return; }
  if (!id && !password) { App.toast('Password required for new faculty', 'warning'); return; }

  let ok = true;
  DB.update(data => {
    if (id) {
      const f = data.faculty.find(x => x.id === parseInt(id));
      if (!f) return;
      if (data.faculty.some(x => x.faculty_id === code && x.id !== f.id)) {
        App.toast('Faculty ID already exists', 'error'); ok = false; return;
      }
      f.faculty_id = code;
      f.name = name;
      f.department_id = parseInt(document.getElementById('facDept').value);
      f.designation = document.getElementById('facDesig').value;
      f.email = document.getElementById('facEmail').value;
      f.phone = document.getElementById('facPhone').value;
      f.status = document.getElementById('facStatus').value;

      // Update linked user
      let user = data.users.find(u => u.faculty_id === f.id);
      if (user) {
        user.username = code;
        user.name = name;
        if (password) user.password = DB.hash(password);
      } else if (password) {
        data.users.push({
          id: DB.nextId(data.users),
          username: code,
          password: DB.hash(password),
          role: 'faculty',
          faculty_id: f.id,
          name
        });
      }
    } else {
      if (data.faculty.some(x => x.faculty_id === code)) {
        App.toast('Faculty ID already exists', 'error'); ok = false; return;
      }
      if (data.users.some(u => u.username === code)) {
        App.toast('Username already exists', 'error'); ok = false; return;
      }
      const fid = DB.nextId(data.faculty);
      data.faculty.push({
        id: fid,
        faculty_id: code,
        name,
        department_id: parseInt(document.getElementById('facDept').value),
        designation: document.getElementById('facDesig').value,
        email: document.getElementById('facEmail').value,
        phone: document.getElementById('facPhone').value,
        status: document.getElementById('facStatus').value || 'Active'
      });
      data.users.push({
        id: DB.nextId(data.users),
        username: code,
        password: DB.hash(password),
        role: 'faculty',
        faculty_id: fid,
        name
      });
    }
  });
  if (!ok) return;
  App.closeModal('facultyModal');
  App.toast(id ? 'Faculty updated' : 'Faculty added', 'success');
  loadFacultyPanel();
  loadAdminDashboard();
}

function deleteFaculty(id) {
  if (!confirm('Delete this faculty member? Their login will also be removed.')) return;
  DB.update(data => {
    if (data.duties.some(d => d.faculty_id === id)) {
      App.toast('Cannot delete faculty with assigned duties', 'error');
      return;
    }
    data.faculty = data.faculty.filter(f => f.id !== id);
    data.users = data.users.filter(u => u.faculty_id !== id);
  });
  App.toast('Faculty deleted', 'success');
  loadFacultyPanel();
  loadAdminDashboard();
}

/* ========== HALLS CRUD ========== */
function loadHallsPanel() {
  const tbody = document.getElementById('hallsBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.halls.map(h => `<tr>
    <td><strong>${h.hall_number}</strong></td>
    <td>${h.building}</td>
    <td>${h.floor}</td>
    <td>${h.rows} × ${h.columns}</td>
    <td>${h.capacity}</td>
    <td><span class="badge badge-success">${h.status}</span></td>
    <td>
      <button class="btn btn-sm btn-danger" onclick="deleteHall(${h.id})">Remove</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted">No halls</td></tr>';
}

function openAddHall() {
  document.getElementById('hallModalTitle').textContent = 'Add Exam Hall';
  document.getElementById('hallId').value = '';
  document.getElementById('hallNum').value = '';
  document.getElementById('hallBuilding').value = '';
  document.getElementById('hallBlock').value = '';
  document.getElementById('hallFloor').value = '';
  document.getElementById('hallRows').value = 5;
  document.getElementById('hallCols').value = 6;
  if (document.getElementById('hallStatus')) document.getElementById('hallStatus').value = 'Available';
  App.openModal('hallModal');
}

function saveHall() {
  const num = document.getElementById('hallNum').value.trim();
  const building = document.getElementById('hallBuilding').value.trim();
  const floor = document.getElementById('hallFloor').value.trim();
  const rows = parseInt(document.getElementById('hallRows').value);
  const cols = parseInt(document.getElementById('hallCols').value);
  if (!num || !building || !floor || !rows || !cols) {
    App.toast('Please fill all required fields', 'warning');
    return;
  }

  let ok = true;
  DB.update(data => {
    if (data.halls.some(h => h.hall_number.toLowerCase() === num.toLowerCase())) {
      App.toast('Hall number already exists', 'error');
      ok = false;
      return;
    }
    const hid = DB.nextId(data.halls);
    const capacity = rows * cols;
    data.halls.push({
      id: hid,
      hall_number: num,
      building,
      block: document.getElementById('hallBlock').value.trim(),
      floor,
      room_number: num.replace(/[^0-9]/g, '') || num,
      total_desks: capacity,
      rows, columns: cols, capacity,
      status: 'Available'
    });
    let maxDeskId = data.desks.length ? Math.max(...data.desks.map(d => d.id)) : 0;
    let dn = 1;
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        data.desks.push({
          id: ++maxDeskId,
          hall_id: hid,
          desk_number: dn++,
          row: r,
          column: c,
          status: 'Available'
        });
      }
    }
  });
  if (!ok) return;
  App.closeModal('hallModal');
  App.toast('Hall added with ' + (rows * cols) + ' desks', 'success');
  loadHallsPanel();
  loadAdminDashboard();
}

function deleteHall(id) {
  const data = DB.get();
  if (data.seatings.some(s => s.hall_id === id)) {
    App.toast('Cannot remove hall with seating arrangements. Delete seating first.', 'error');
    return;
  }
  if (data.duties.some(d => d.hall_id === id)) {
    App.toast('Cannot remove hall with assigned faculty duties.', 'error');
    return;
  }
  if (!confirm('Remove this exam hall and all its desks?')) return;
  DB.update(d => {
    d.halls = d.halls.filter(h => h.id !== id);
    d.desks = d.desks.filter(desk => desk.hall_id !== id);
  });
  App.toast('Hall removed', 'success');
  loadHallsPanel();
  loadAdminDashboard();
}

/* ========== EXAMS CRUD ========== */
function loadExamsPanel() {
  const tbody = document.getElementById('examsBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.exams.map(e => `<tr>
    <td><strong>${e.exam_id}</strong></td>
    <td>${e.name}</td>
    <td>${App.subjectName(e.subject_id)}</td>
    <td>${App.formatDate(e.date)}</td>
    <td>${e.start_time} – ${e.end_time}</td>
    <td>${e.exam_type}</td>
    <td><span class="badge badge-info">${e.status}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="editExam(${e.id})">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteExam(${e.id})">Delete</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted">No exams</td></tr>';
}

function populateExamForm() {
  const data = DB.get();
  document.getElementById('examSubject').innerHTML = data.subjects.map(s =>
    `<option value="${s.id}">${s.subject_code} - ${s.name}</option>`
  ).join('');
  document.getElementById('examClassChecks').innerHTML = data.classes.map(c =>
    `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:0.85rem;">
      <input type="checkbox" class="exam-class-check" value="${c.id}"> ${c.name}
    </label>`
  ).join('');
}

function openAddExam() {
  document.getElementById('examModalTitle').textContent = 'Add Exam';
  document.getElementById('examForm').reset();
  document.getElementById('examId').value = '';
  document.getElementById('examStart').value = '10:00';
  document.getElementById('examEnd').value = '13:00';
  populateExamForm();
  App.openModal('examModal');
}

function editExam(id) {
  const data = DB.get();
  const e = data.exams.find(x => x.id === id);
  if (!e) return;
  populateExamForm();
  document.getElementById('examModalTitle').textContent = 'Edit Exam';
  document.getElementById('examId').value = e.id;
  document.getElementById('examCode').value = e.exam_id;
  document.getElementById('examName').value = e.name;
  document.getElementById('examSubject').value = e.subject_id;
  document.getElementById('examDate').value = e.date;
  document.getElementById('examType').value = e.exam_type;
  document.getElementById('examStart').value = e.start_time;
  document.getElementById('examEnd').value = e.end_time;
  document.getElementById('examStatus').value = e.status;

  const partIds = data.participants.filter(p => p.exam_id === id).map(p => p.class_id);
  document.querySelectorAll('.exam-class-check').forEach(cb => {
    cb.checked = partIds.includes(parseInt(cb.value));
  });
  App.openModal('examModal');
}

function saveExam() {
  const id = document.getElementById('examId').value;
  const code = document.getElementById('examCode').value.trim().toUpperCase();
  const name = document.getElementById('examName').value.trim();
  const date = document.getElementById('examDate').value;
  const start = document.getElementById('examStart').value;
  const end = document.getElementById('examEnd').value;
  const classIds = [...document.querySelectorAll('.exam-class-check:checked')].map(c => parseInt(c.value));

  if (!code || !name || !date || !start || !end) {
    App.toast('Please fill all required fields', 'warning');
    return;
  }
  if (!classIds.length) {
    App.toast('Select at least one eligible class', 'warning');
    return;
  }

  const day = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  let ok = true;

  DB.update(data => {
    if (id) {
      const e = data.exams.find(x => x.id === parseInt(id));
      if (!e) return;
      if (data.exams.some(x => x.exam_id === code && x.id !== e.id)) {
        App.toast('Exam ID already exists', 'error'); ok = false; return;
      }
      e.exam_id = code;
      e.name = name;
      e.subject_id = parseInt(document.getElementById('examSubject').value);
      e.date = date;
      e.day = day;
      e.start_time = start;
      e.end_time = end;
      e.exam_type = document.getElementById('examType').value;
      e.status = document.getElementById('examStatus').value;
      data.participants = data.participants.filter(p => p.exam_id !== e.id);
      classIds.forEach(cid => {
        data.participants.push({ id: DB.nextId(data.participants), exam_id: e.id, class_id: cid });
      });
    } else {
      if (data.exams.some(x => x.exam_id === code)) {
        App.toast('Exam ID already exists', 'error'); ok = false; return;
      }
      const eid = DB.nextId(data.exams);
      data.exams.push({
        id: eid,
        exam_id: code,
        name,
        academic_year: '2025-26',
        semester: 3,
        exam_type: document.getElementById('examType').value,
        subject_id: parseInt(document.getElementById('examSubject').value),
        date, day,
        start_time: start,
        end_time: end,
        status: document.getElementById('examStatus').value || 'Upcoming'
      });
      classIds.forEach(cid => {
        data.participants.push({ id: DB.nextId(data.participants), exam_id: eid, class_id: cid });
      });
    }
  });
  if (!ok) return;
  App.closeModal('examModal');
  App.toast(id ? 'Exam updated' : 'Exam added', 'success');
  loadExamsPanel();
  loadAdminDashboard();
}

function deleteExam(id) {
  const data = DB.get();
  if (data.seatings.some(s => s.exam_id === id)) {
    if (!confirm('This exam has seating arrangements. Delete exam and all related seating/attendance/duties?')) return;
  } else if (!confirm('Delete this exam?')) return;

  DB.update(d => {
    d.exams = d.exams.filter(e => e.id !== id);
    d.participants = d.participants.filter(p => p.exam_id !== id);
    d.seatings = d.seatings.filter(s => s.exam_id !== id);
    d.duties = d.duties.filter(x => x.exam_id !== id);
    d.attendance = d.attendance.filter(a => a.exam_id !== id);
  });
  App.toast('Exam deleted', 'success');
  loadExamsPanel();
  loadAdminDashboard();
}

/* ========== SEATING ========== */
function loadSeatingPanel() {
  const data = DB.get();
  const examSel = document.getElementById('seatExam');
  const hallBox = document.getElementById('hallChecks');
  if (!examSel) return;

  examSel.innerHTML = '<option value="">Select exam...</option>' +
    data.exams.map(e => {
      const has = data.seatings.some(s => s.exam_id === e.id);
      return `<option value="${e.id}">${e.exam_id} - ${App.subjectName(e.subject_id)} (${e.date}) ${has ? '✓' : ''}</option>`;
    }).join('');

  if (hallBox) {
    hallBox.innerHTML = data.halls.map(h =>
      `<label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:0.875rem;">
        <input type="checkbox" value="${h.id}" class="hall-check">
        <span>${h.hall_number} (${h.capacity} desks) - ${h.building}</span>
      </label>`
    ).join('');
  }
}

function generateSeating() {
  const examId = parseInt(document.getElementById('seatExam').value);
  const strategy = document.getElementById('seatStrategy').value;
  const hallIds = [...document.querySelectorAll('.hall-check:checked')].map(c => parseInt(c.value));

  if (!examId) { App.toast('Select an exam', 'warning'); return; }
  if (!hallIds.length) { App.toast('Select at least one hall', 'warning'); return; }
  if (!confirm('This will replace any existing seating for this exam. Continue?')) return;

  const data = DB.get();
  const partClassIds = data.participants.filter(p => p.exam_id === examId).map(p => p.class_id);
  let students = data.students.filter(s => partClassIds.includes(s.class_id) && s.status === 'Active');

  if (!students.length) { App.toast('No eligible students', 'error'); return; }

  const allDesks = [];
  hallIds.forEach(hid => {
    data.desks.filter(d => d.hall_id === hid).sort((a, b) => a.desk_number - b.desk_number)
      .forEach(d => allDesks.push(d));
  });

  if (allDesks.length < students.length) {
    App.toast(`Not enough desks. Students: ${students.length}, Desks: ${allDesks.length}`, 'error');
    return;
  }

  if (strategy === 'alternate') {
    const byDept = {};
    students.forEach(s => { (byDept[s.department_id] = byDept[s.department_id] || []).push(s); });
    const ordered = [];
    const deptIds = Object.keys(byDept);
    const maxLen = Math.max(...Object.values(byDept).map(a => a.length));
    for (let i = 0; i < maxLen; i++) {
      deptIds.forEach(did => { if (byDept[did][i]) ordered.push(byDept[did][i]); });
    }
    students = ordered;
  } else if (strategy === 'random') {
    students = students.sort(() => Math.random() - 0.5);
  } else if (strategy === 'random_dept') {
    const byDept = {};
    students.forEach(s => { (byDept[s.department_id] = byDept[s.department_id] || []).push(s); });
    Object.keys(byDept).forEach(k => byDept[k].sort(() => Math.random() - 0.5));
    const ordered = [];
    const deptIds = Object.keys(byDept).sort(() => Math.random() - 0.5);
    const maxLen = Math.max(...Object.values(byDept).map(a => a.length));
    for (let i = 0; i < maxLen; i++) {
      deptIds.forEach(did => { if (byDept[did][i]) ordered.push(byDept[did][i]); });
    }
    students = ordered;
  }

  DB.update(d => {
    d.seatings = d.seatings.filter(s => s.exam_id !== examId);
    students.forEach((stu, i) => {
      d.seatings.push({
        id: DB.nextId(d.seatings) + i,
        exam_id: examId,
        student_id: stu.id,
        hall_id: allDesks[i].hall_id,
        desk_id: allDesks[i].id,
        strategy_used: strategy
      });
    });
  });

  App.toast(`Seating generated for ${students.length} students`, 'success');
  viewSeating();
}

function viewSeating() {
  const examId = parseInt(document.getElementById('seatExam').value);
  if (!examId) { App.toast('Select an exam', 'warning'); return; }

  const result = document.getElementById('seatingResult');
  const data = DB.get();
  const exam = data.exams.find(e => e.id === examId);
  const seatings = data.seatings.filter(s => s.exam_id === examId);

  if (!seatings.length) {
    result.innerHTML = '<div class="card"><div class="card-body empty-state"><h3>No seating arrangement</h3><p>No seating arrangement for this exam.</p></div></div>';
    return;
  }

  const byHall = {};
  seatings.forEach(s => {
    if (!byHall[s.hall_id]) byHall[s.hall_id] = [];
    byHall[s.hall_id].push(s);
  });

  let html = `<div class="card"><div class="card-header">
    Seating: ${exam ? exam.name : ''} — ${exam ? App.subjectName(exam.subject_id) : ''} (${seatings.length} students)
  </div><div class="card-body">`;

  Object.keys(byHall).forEach(hid => {
    const hall = App.hallById(parseInt(hid));
    html += `<h4 class="mb-2">${hall.hall_number} — ${hall.building}, ${hall.floor}</h4>
      <div class="seating-grid mb-3" id="map-h${hid}" style="grid-template-columns:repeat(${hall.columns},70px);"></div>`;
  });
  html += '</div></div>';
  result.innerHTML = html;

  Object.keys(byHall).forEach(hid => {
    renderHallMap('map-h' + hid, parseInt(hid), examId, null);
  });
}

/* ========== FACULTY PORTAL ========== */
function loadFacultyDashboard() {
  const session = App.getSession();
  if (!session) return;
  const data = DB.get();
  const fac = data.faculty.find(f => f.id === session.faculty_id);
  if (!fac && session.role !== 'admin') return;

  const facId = fac ? fac.id : (session.faculty_id || 1);
  const faculty = App.facultyById(facId) || data.faculty[0];

  const info = document.getElementById('facultyInfo');
  if (info) {
    info.innerHTML = `<h2 style="font-size:1.4rem;">${faculty.name}</h2>
      <p class="text-secondary" style="font-size:0.9rem;">${faculty.designation} · ${App.deptName(faculty.department_id)} · ${faculty.faculty_id}</p>`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const duties = data.duties.filter(d => d.faculty_id === faculty.id);
  const todayDuties = duties.filter(d => d.date === today);
  const upcoming = duties.filter(d => d.date > today);

  const todayEl = document.getElementById('todayDuties');
  if (todayEl) {
    todayEl.innerHTML = todayDuties.length
      ? todayDuties.map(d => dutyCard(d, true)).join('')
      : '<p class="text-muted text-center">No duties assigned for today</p>';
  }

  const upEl = document.getElementById('upcomingDuties');
  if (upEl) {
    upEl.innerHTML = upcoming.length
      ? upcoming.map(d => dutyCard(d, false)).join('')
      : '<p class="text-muted text-center">No upcoming duties</p>';
  }
}

function dutyCard(d, isToday) {
  const exam = DB.get().exams.find(e => e.id === d.exam_id);
  const hall = App.hallById(d.hall_id);
  return `<div style="padding:16px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:12px;border:1px solid var(--border);border-left:3px solid var(--blue);">
    <div class="d-flex justify-between flex-wrap gap-1">
      <div>
        <strong style="font-size:1rem;">${exam ? exam.name : ''}</strong>
        <br><span class="text-muted" style="font-size:0.85rem;">${exam ? App.subjectName(exam.subject_id) : ''}</span>
      </div>
      <span class="badge badge-info">${d.duty_type}</span>
    </div>
    <div class="mt-1" style="font-size:0.85rem;color:var(--text-secondary);">
      ${App.formatDate(d.date)} · ${d.start_time} – ${d.end_time}<br>
      ${hall ? hall.hall_number : ''} · ${hall ? hall.building : ''} · ${hall ? hall.floor : ''}
    </div>
    ${isToday ? `<button class="btn btn-primary btn-sm mt-2" onclick="openAttendance(${d.exam_id},${d.hall_id})">Mark Attendance</button>` : ''}
  </div>`;
}

function openAttendance(examId, hallId) {
  const panel = document.getElementById('attendancePanel');
  const body = document.getElementById('attendanceBody');
  if (!panel) return;
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth' });

  const data = DB.get();
  const exam = data.exams.find(e => e.id === examId);
  const seatings = data.seatings.filter(s => s.exam_id === examId && s.hall_id === hallId);

  window._attExamId = examId;
  window._attList = seatings.map(s => {
    const stu = App.studentById(s.student_id);
    const desk = App.deskById(s.desk_id);
    const att = data.attendance.find(a => a.exam_id === examId && a.student_id === s.student_id);
    return {
      student_id: s.student_id,
      register_number: stu ? stu.register_number : '',
      name: stu ? stu.name : '',
      desk_number: desk ? desk.desk_number : '',
      status: att ? att.status : 'Absent'
    };
  });

  const present = window._attList.filter(s => s.status === 'Present').length;
  const total = window._attList.length;

  body.innerHTML = `
    <div class="mb-2 d-flex justify-between align-center flex-wrap gap-1">
      <div>
        <strong>${exam ? exam.name : ''}</strong> — ${total} students
        <br><small>Present: ${present} | Absent: ${total - present} | ${total ? Math.round(present / total * 100) : 0}%</small>
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-success btn-sm" onclick="markAllPresent()">Mark All Present</button>
        <button class="btn btn-primary btn-sm" onclick="saveAttendance()">Save Attendance</button>
      </div>
    </div>
    <div class="table-responsive">
      <table>
        <thead><tr><th>Reg. No</th><th>Name</th><th>Desk</th><th>Status</th></tr></thead>
        <tbody>
          ${window._attList.map((s, i) => `
            <tr>
              <td>${s.register_number}</td>
              <td>${s.name}</td>
              <td>${s.desk_number}</td>
              <td>
                <select class="form-control att-status" data-idx="${i}" style="width:120px;">
                  <option value="Present" ${s.status === 'Present' ? 'selected' : ''}>Present</option>
                  <option value="Absent" ${s.status === 'Absent' ? 'selected' : ''}>Absent</option>
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function markAllPresent() {
  document.querySelectorAll('.att-status').forEach(s => s.value = 'Present');
}

function saveAttendance() {
  DB.update(data => {
    window._attList.forEach((s, i) => {
      const status = document.querySelector(`.att-status[data-idx="${i}"]`).value;
      const existing = data.attendance.find(a => a.exam_id === window._attExamId && a.student_id === s.student_id);
      if (existing) existing.status = status;
      else data.attendance.push({
        id: DB.nextId(data.attendance),
        exam_id: window._attExamId,
        student_id: s.student_id,
        status
      });
    });
  });
  App.toast('Attendance saved', 'success');
}

/* ========== DEPARTMENTS ========== */
function loadDeptPanel() {
  const tbody = document.getElementById('deptBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.departments.map(d => {
    const count = data.students.filter(s => s.department_id === d.id).length;
    return `<tr>
      <td><strong>${d.code}</strong></td>
      <td>${d.name}</td>
      <td><span class="badge badge-${d.status==='Active'?'success':'muted'}">${d.status}</span></td>
      <td>${count}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editDept(${d.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDept(${d.id})">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-center text-muted">No departments</td></tr>';
}

function openAddDept() {
  document.getElementById('deptModalTitle').textContent = 'Add Department';
  document.getElementById('deptId').value = '';
  document.getElementById('deptCode').value = '';
  document.getElementById('deptName').value = '';
  document.getElementById('deptStatus').value = 'Active';
  App.openModal('deptModal');
}

function editDept(id) {
  const d = DB.get().departments.find(x => x.id === id);
  if (!d) return;
  document.getElementById('deptModalTitle').textContent = 'Edit Department';
  document.getElementById('deptId').value = d.id;
  document.getElementById('deptCode').value = d.code;
  document.getElementById('deptName').value = d.name;
  document.getElementById('deptStatus').value = d.status;
  App.openModal('deptModal');
}

function saveDept() {
  const id = document.getElementById('deptId').value;
  const code = document.getElementById('deptCode').value.trim().toUpperCase();
  const name = document.getElementById('deptName').value.trim();
  if (!code || !name) { App.toast('Code and name required', 'warning'); return; }
  let ok = true;
  DB.update(data => {
    if (id) {
      const d = data.departments.find(x => x.id === parseInt(id));
      if (!d) return;
      if (data.departments.some(x => x.code === code && x.id !== d.id)) { App.toast('Code already exists', 'error'); ok = false; return; }
      d.code = code; d.name = name; d.status = document.getElementById('deptStatus').value;
    } else {
      if (data.departments.some(x => x.code === code)) { App.toast('Code already exists', 'error'); ok = false; return; }
      data.departments.push({ id: DB.nextId(data.departments), code, name, status: document.getElementById('deptStatus').value });
    }
  });
  if (!ok) return;
  App.closeModal('deptModal');
  App.toast(id ? 'Department updated' : 'Department added', 'success');
  loadDeptPanel();
  loadAdminDashboard();
}

function deleteDept(id) {
  const data = DB.get();
  if (data.students.some(s => s.department_id === id) || data.classes.some(c => c.department_id === id)) {
    App.toast('Cannot delete department with classes or students', 'error');
    return;
  }
  if (!confirm('Delete this department?')) return;
  DB.update(d => { d.departments = d.departments.filter(x => x.id !== id); });
  App.toast('Department deleted', 'success');
  loadDeptPanel();
  loadAdminDashboard();
}

/* ========== CLASSES ========== */
function loadClassPanel() {
  const tbody = document.getElementById('classBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.classes.map(c => {
    const count = data.students.filter(s => s.class_id === c.id).length;
    return `<tr>
      <td><strong>${c.name}</strong></td>
      <td>${App.deptName(c.department_id)}</td>
      <td>${c.course}</td>
      <td>${c.year}</td>
      <td>${c.section}</td>
      <td>${c.academic_year}</td>
      <td>${count}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editClass(${c.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClass(${c.id})">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="text-center text-muted">No classes</td></tr>';
}

function openAddClass() {
  document.getElementById('classModalTitle').textContent = 'Add Class';
  document.getElementById('classId').value = '';
  document.getElementById('className').value = '';
  document.getElementById('classCourse').value = '';
  document.getElementById('classSection').value = 'A';
  document.getElementById('classAcadYear').value = '2025-26';
  document.getElementById('classDept').innerHTML = DB.get().departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  App.openModal('classModal');
}

function editClass(id) {
  const c = DB.get().classes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('classDept').innerHTML = DB.get().departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('classModalTitle').textContent = 'Edit Class';
  document.getElementById('classId').value = c.id;
  document.getElementById('className').value = c.name;
  document.getElementById('classDept').value = c.department_id;
  document.getElementById('classCourse').value = c.course;
  document.getElementById('classYear').value = c.year;
  document.getElementById('classSection').value = c.section;
  document.getElementById('classAcadYear').value = c.academic_year;
  App.openModal('classModal');
}

function saveClass() {
  const id = document.getElementById('classId').value;
  const name = document.getElementById('className').value.trim();
  if (!name) { App.toast('Class name required', 'warning'); return; }
  DB.update(data => {
    const payload = {
      name,
      department_id: parseInt(document.getElementById('classDept').value),
      course: document.getElementById('classCourse').value.trim(),
      year: parseInt(document.getElementById('classYear').value),
      section: document.getElementById('classSection').value.trim() || 'A',
      academic_year: document.getElementById('classAcadYear').value.trim()
    };
    if (id) {
      const c = data.classes.find(x => x.id === parseInt(id));
      if (c) Object.assign(c, payload);
    } else {
      data.classes.push({ id: DB.nextId(data.classes), ...payload });
    }
  });
  App.closeModal('classModal');
  App.toast(id ? 'Class updated' : 'Class added', 'success');
  loadClassPanel();
  loadAdminDashboard();
}

function deleteClass(id) {
  if (DB.get().students.some(s => s.class_id === id)) {
    App.toast('Cannot delete class with students', 'error');
    return;
  }
  if (!confirm('Delete this class?')) return;
  DB.update(d => {
    d.classes = d.classes.filter(x => x.id !== id);
    d.participants = d.participants.filter(p => p.class_id !== id);
  });
  App.toast('Class deleted', 'success');
  loadClassPanel();
  loadAdminDashboard();
}

/* ========== SUBJECTS ========== */
function loadSubjectPanel() {
  const tbody = document.getElementById('subjectBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.subjects.map(s => `<tr>
    <td><strong>${s.subject_code}</strong></td>
    <td>${s.name}</td>
    <td>${App.deptName(s.department_id)}</td>
    <td>${s.semester}</td>
    <td>${s.credits}</td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="editSubject(${s.id})">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSubject(${s.id})">Delete</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">No subjects</td></tr>';
}

function openAddSubject() {
  document.getElementById('subModalTitle').textContent = 'Add Subject';
  document.getElementById('subId').value = '';
  document.getElementById('subCode').value = '';
  document.getElementById('subName').value = '';
  document.getElementById('subSem').value = 3;
  document.getElementById('subCredits').value = 4;
  document.getElementById('subDept').innerHTML = DB.get().departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  App.openModal('subjectModal');
}

function editSubject(id) {
  const s = DB.get().subjects.find(x => x.id === id);
  if (!s) return;
  document.getElementById('subDept').innerHTML = DB.get().departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('subModalTitle').textContent = 'Edit Subject';
  document.getElementById('subId').value = s.id;
  document.getElementById('subCode').value = s.subject_code;
  document.getElementById('subName').value = s.name;
  document.getElementById('subDept').value = s.department_id;
  document.getElementById('subSem').value = s.semester;
  document.getElementById('subCredits').value = s.credits;
  App.openModal('subjectModal');
}

function saveSubject() {
  const id = document.getElementById('subId').value;
  const code = document.getElementById('subCode').value.trim().toUpperCase();
  const name = document.getElementById('subName').value.trim();
  if (!code || !name) { App.toast('Code and name required', 'warning'); return; }
  let ok = true;
  DB.update(data => {
    if (id) {
      const s = data.subjects.find(x => x.id === parseInt(id));
      if (!s) return;
      if (data.subjects.some(x => x.subject_code === code && x.id !== s.id)) { App.toast('Code exists', 'error'); ok = false; return; }
      s.subject_code = code; s.name = name;
      s.department_id = parseInt(document.getElementById('subDept').value);
      s.semester = parseInt(document.getElementById('subSem').value);
      s.credits = parseInt(document.getElementById('subCredits').value);
    } else {
      if (data.subjects.some(x => x.subject_code === code)) { App.toast('Code exists', 'error'); ok = false; return; }
      data.subjects.push({
        id: DB.nextId(data.subjects), subject_code: code, name,
        department_id: parseInt(document.getElementById('subDept').value),
        semester: parseInt(document.getElementById('subSem').value),
        credits: parseInt(document.getElementById('subCredits').value)
      });
    }
  });
  if (!ok) return;
  App.closeModal('subjectModal');
  App.toast(id ? 'Subject updated' : 'Subject added', 'success');
  loadSubjectPanel();
}

function deleteSubject(id) {
  if (DB.get().exams.some(e => e.subject_id === id)) {
    App.toast('Cannot delete subject linked to exams', 'error');
    return;
  }
  if (!confirm('Delete this subject?')) return;
  DB.update(d => { d.subjects = d.subjects.filter(x => x.id !== id); });
  App.toast('Subject deleted', 'success');
  loadSubjectPanel();
}

/* ========== HALL EDIT ========== */
function editHall(id) {
  const h = App.hallById(id);
  if (!h) return;
  document.getElementById('hallModalTitle').textContent = 'Edit Exam Hall';
  document.getElementById('hallId').value = h.id;
  document.getElementById('hallNum').value = h.hall_number;
  document.getElementById('hallBuilding').value = h.building;
  document.getElementById('hallBlock').value = h.block || '';
  document.getElementById('hallFloor').value = h.floor;
  document.getElementById('hallRows').value = h.rows;
  document.getElementById('hallCols').value = h.columns;
  if (document.getElementById('hallStatus')) document.getElementById('hallStatus').value = h.status || 'Available';
  App.openModal('hallModal');
}

/* Override saveHall to support edit */
function saveHall() {
  const id = document.getElementById('hallId').value;
  const num = document.getElementById('hallNum').value.trim();
  const building = document.getElementById('hallBuilding').value.trim();
  const floor = document.getElementById('hallFloor').value.trim();
  const rows = parseInt(document.getElementById('hallRows').value);
  const cols = parseInt(document.getElementById('hallCols').value);
  if (!num || !building || !floor || !rows || !cols) {
    App.toast('Please fill all required fields', 'warning');
    return;
  }
  let ok = true;
  DB.update(data => {
    if (id) {
      const h = data.halls.find(x => x.id === parseInt(id));
      if (!h) return;
      if (data.halls.some(x => x.hall_number.toLowerCase() === num.toLowerCase() && x.id !== h.id)) {
        App.toast('Hall number already exists', 'error'); ok = false; return;
      }
      h.hall_number = num;
      h.building = building;
      h.block = document.getElementById('hallBlock').value.trim();
      h.floor = floor;
      if (document.getElementById('hallStatus')) h.status = document.getElementById('hallStatus').value;
    } else {
      if (data.halls.some(h => h.hall_number.toLowerCase() === num.toLowerCase())) {
        App.toast('Hall number already exists', 'error'); ok = false; return;
      }
      const hid = DB.nextId(data.halls);
      const capacity = rows * cols;
      data.halls.push({
        id: hid, hall_number: num, building,
        block: document.getElementById('hallBlock').value.trim(),
        floor, room_number: num.replace(/[^0-9]/g, '') || num,
        total_desks: capacity, rows, columns: cols, capacity,
        status: document.getElementById('hallStatus') ? document.getElementById('hallStatus').value : 'Available'
      });
      let maxDeskId = data.desks.length ? Math.max(...data.desks.map(d => d.id)) : 0;
      let dn = 1;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          data.desks.push({ id: ++maxDeskId, hall_id: hid, desk_number: dn++, row: r, column: c, status: 'Available' });
        }
      }
    }
  });
  if (!ok) return;
  App.closeModal('hallModal');
  App.toast(id ? 'Hall updated' : 'Hall added', 'success');
  loadHallsPanel();
  loadAdminDashboard();
}

/* Update halls table with Edit */
function loadHallsPanel() {
  const tbody = document.getElementById('hallsBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.halls.map(h => `<tr>
    <td><strong>${h.hall_number}</strong></td>
    <td>${h.building}</td>
    <td>${h.block || '—'}</td>
    <td>${h.floor}</td>
    <td>${h.rows} × ${h.columns}</td>
    <td>${h.capacity}</td>
    <td><span class="badge badge-success">${h.status}</span></td>
    <td>
      <button class="btn btn-sm btn-secondary" onclick="editHall(${h.id})">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteHall(${h.id})">Delete</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted">No halls</td></tr>';
}

function clearSeating() {
  const examId = parseInt(document.getElementById('seatExam').value);
  if (!examId) { App.toast('Select an exam', 'warning'); return; }
  if (!confirm('Clear all seating for this exam?')) return;
  DB.update(d => { d.seatings = d.seatings.filter(s => s.exam_id !== examId); });
  App.toast('Seating cleared', 'success');
  document.getElementById('seatingResult').innerHTML = '';
  loadSeatingPanel();
}

/* ========== DUTIES ========== */
function loadDutiesPanel() {
  const tbody = document.getElementById('dutiesBody');
  if (!tbody) return;
  const data = DB.get();
  tbody.innerHTML = data.duties.map(d => {
    const fac = App.facultyById(d.faculty_id);
    const exam = data.exams.find(e => e.id === d.exam_id);
    const hall = App.hallById(d.hall_id);
    return `<tr>
      <td>${fac ? fac.name : '—'}</td>
      <td>${exam ? exam.exam_id : '—'}</td>
      <td>${exam ? App.subjectName(exam.subject_id) : '—'}</td>
      <td>${hall ? hall.hall_number : '—'}</td>
      <td>${App.formatDate(d.date)}</td>
      <td>${d.start_time} – ${d.end_time}</td>
      <td>${d.duty_type}</td>
      <td><span class="badge badge-info">${d.status}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="editDuty(${d.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDuty(${d.id})">Delete</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="text-center text-muted">No duties assigned</td></tr>';
}

function openAddDuty() {
  const data = DB.get();
  document.getElementById('dutyModalTitle').textContent = 'Assign Duty';
  document.getElementById('dutyId').value = '';
  document.getElementById('dutyFaculty').innerHTML = data.faculty.map(f => `<option value="${f.id}">${f.faculty_id} — ${f.name}</option>`).join('');
  document.getElementById('dutyExam').innerHTML = data.exams.map(e => `<option value="${e.id}">${e.exam_id} — ${e.name}</option>`).join('');
  document.getElementById('dutyHall').innerHTML = data.halls.map(h => `<option value="${h.id}">${h.hall_number}</option>`).join('');
  document.getElementById('dutyDate').value = '';
  document.getElementById('dutyStart').value = '10:00';
  document.getElementById('dutyEnd').value = '13:00';
  document.getElementById('dutyStatus').value = 'Assigned';
  App.openModal('dutyModal');
}

function editDuty(id) {
  const d = DB.get().duties.find(x => x.id === id);
  if (!d) return;
  openAddDuty();
  document.getElementById('dutyModalTitle').textContent = 'Edit Duty';
  document.getElementById('dutyId').value = d.id;
  document.getElementById('dutyFaculty').value = d.faculty_id;
  document.getElementById('dutyExam').value = d.exam_id;
  document.getElementById('dutyHall').value = d.hall_id;
  document.getElementById('dutyType').value = d.duty_type;
  document.getElementById('dutyDate').value = d.date;
  document.getElementById('dutyStart').value = d.start_time;
  document.getElementById('dutyEnd').value = d.end_time;
  document.getElementById('dutyStatus').value = d.status;
}

function saveDuty() {
  const id = document.getElementById('dutyId').value;
  const faculty_id = parseInt(document.getElementById('dutyFaculty').value);
  const exam_id = parseInt(document.getElementById('dutyExam').value);
  const hall_id = parseInt(document.getElementById('dutyHall').value);
  const date = document.getElementById('dutyDate').value;
  const start_time = document.getElementById('dutyStart').value;
  const end_time = document.getElementById('dutyEnd').value;
  if (!date) { App.toast('Date required', 'warning'); return; }

  let ok = true;
  DB.update(data => {
    // conflict check
    const conflict = data.duties.find(d =>
      d.faculty_id === faculty_id && d.date === date && d.status !== 'Cancelled' &&
      (!id || d.id !== parseInt(id)) &&
      !(end_time <= d.start_time || start_time >= d.end_time)
    );
    if (conflict) {
      App.toast('Faculty already has overlapping duty on this date', 'error');
      ok = false;
      return;
    }
    const payload = {
      faculty_id, exam_id, hall_id, date, start_time, end_time,
      duty_type: document.getElementById('dutyType').value,
      status: document.getElementById('dutyStatus').value
    };
    if (id) {
      const d = data.duties.find(x => x.id === parseInt(id));
      if (d) Object.assign(d, payload);
    } else {
      data.duties.push({ id: DB.nextId(data.duties), ...payload });
    }
  });
  if (!ok) return;
  App.closeModal('dutyModal');
  App.toast(id ? 'Duty updated' : 'Duty assigned', 'success');
  loadDutiesPanel();
}

function deleteDuty(id) {
  if (!confirm('Remove this duty assignment?')) return;
  DB.update(d => { d.duties = d.duties.filter(x => x.id !== id); });
  App.toast('Duty deleted', 'success');
  loadDutiesPanel();
}

/* ========== ADMIN ATTENDANCE ========== */
function loadAttendancePanel() {
  const data = DB.get();
  const examSel = document.getElementById('attExam');
  const hallSel = document.getElementById('attHall');
  if (!examSel) return;
  examSel.innerHTML = '<option value="">Select exam…</option>' +
    data.exams.map(e => `<option value="${e.id}">${e.exam_id} — ${e.name}</option>`).join('');
  hallSel.innerHTML = '<option value="">All Halls</option>' +
    data.halls.map(h => `<option value="${h.id}">${h.hall_number}</option>`).join('');
}

function loadAdminAttendance() {
  const examId = parseInt(document.getElementById('attExam').value);
  const hallId = document.getElementById('attHall').value ? parseInt(document.getElementById('attHall').value) : null;
  const tbody = document.getElementById('attBody');
  const summary = document.getElementById('attSummary');
  const actions = document.getElementById('attActions');
  if (!examId) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select an examination</td></tr>';
    summary.style.display = 'none';
    return;
  }
  const data = DB.get();
  let seatings = data.seatings.filter(s => s.exam_id === examId);
  if (hallId) seatings = seatings.filter(s => s.hall_id === hallId);

  window._adminAtt = seatings.map(s => {
    const stu = App.studentById(s.student_id);
    const desk = App.deskById(s.desk_id);
    const hall = App.hallById(s.hall_id);
    const att = data.attendance.find(a => a.exam_id === examId && a.student_id === s.student_id);
    return {
      student_id: s.student_id,
      register_number: stu ? stu.register_number : '',
      name: stu ? stu.name : '',
      department: stu ? App.deptName(stu.department_id) : '',
      hall: hall ? hall.hall_number : '',
      desk: desk ? desk.desk_number : '',
      status: att ? att.status : 'Absent'
    };
  });

  const present = window._adminAtt.filter(x => x.status === 'Present').length;
  const total = window._adminAtt.length;
  const pct = total ? Math.round(present / total * 100) : 0;

  summary.style.display = 'grid';
  summary.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Students</div><div class="stat-value">${total}</div></div>
    <div class="stat-card"><div class="stat-label">Present</div><div class="stat-value">${present}</div></div>
    <div class="stat-card"><div class="stat-label">Absent</div><div class="stat-value">${total - present}</div></div>
    <div class="stat-card"><div class="stat-label">Attendance %</div><div class="stat-value">${pct}%</div></div>`;

  tbody.innerHTML = window._adminAtt.map((s, i) => `<tr>
    <td>${s.register_number}</td>
    <td>${s.name}</td>
    <td>${s.department}</td>
    <td>${s.hall}</td>
    <td>${s.desk}</td>
    <td>
      <select class="form-control admin-att-status" data-idx="${i}" style="width:120px;">
        <option value="Present" ${s.status==='Present'?'selected':''}>Present</option>
        <option value="Absent" ${s.status==='Absent'?'selected':''}>Absent</option>
      </select>
    </td>
  </tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted">No seating for this exam</td></tr>';

  actions.style.cssText = 'display:flex !important;';
  actions.innerHTML = `
    <button class="btn btn-success btn-sm" onclick="adminMarkAllPresent()">Mark All Present</button>
    <button class="btn btn-primary btn-sm" onclick="adminSaveAttendance()">Save Attendance</button>`;
  window._adminAttExamId = examId;
}

function adminMarkAllPresent() {
  document.querySelectorAll('.admin-att-status').forEach(s => s.value = 'Present');
}

function adminSaveAttendance() {
  if (!window._adminAtt) return;
  DB.update(data => {
    window._adminAtt.forEach((s, i) => {
      const status = document.querySelector(`.admin-att-status[data-idx="${i}"]`).value;
      const existing = data.attendance.find(a => a.exam_id === window._adminAttExamId && a.student_id === s.student_id);
      if (existing) existing.status = status;
      else data.attendance.push({ id: DB.nextId(data.attendance), exam_id: window._adminAttExamId, student_id: s.student_id, status });
    });
  });
  App.toast('Attendance saved', 'success');
  loadAdminAttendance();
}

/* ========== REPORTS ========== */
function loadReportsPanel() {
  const data = DB.get();
  const el = document.getElementById('reportCards');
  if (!el) return;
  const present = data.attendance.filter(a => a.status === 'Present').length;
  const attTotal = data.attendance.length;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Students</div><div class="stat-value">${data.students.length}</div></div>
    <div class="stat-card"><div class="stat-label">Faculty</div><div class="stat-value">${data.faculty.length}</div></div>
    <div class="stat-card"><div class="stat-label">Exams</div><div class="stat-value">${data.exams.length}</div></div>
    <div class="stat-card"><div class="stat-label">Seat Allocations</div><div class="stat-value">${data.seatings.length}</div></div>
    <div class="stat-card"><div class="stat-label">Duties</div><div class="stat-value">${data.duties.length}</div></div>
    <div class="stat-card"><div class="stat-label">Attendance Records</div><div class="stat-value">${attTotal}</div></div>
    <div class="stat-card"><div class="stat-label">Present Marks</div><div class="stat-value">${present}</div></div>
    <div class="stat-card"><div class="stat-label">Halls</div><div class="stat-value">${data.halls.length}</div></div>`;
}

function exportCSV(type) {
  const data = DB.get();
  let rows = [];
  let filename = type + '.csv';
  if (type === 'students') {
    rows = [['Register Number','Name','Gender','Department','Class','Year','Email','Phone','Status']];
    data.students.forEach(s => rows.push([s.register_number,s.name,s.gender,App.deptName(s.department_id),App.className(s.class_id),s.year,s.email||'',s.phone||'',s.status]));
  } else if (type === 'faculty') {
    rows = [['Faculty ID','Name','Department','Designation','Email','Phone','Status']];
    data.faculty.forEach(f => rows.push([f.faculty_id,f.name,App.deptName(f.department_id),f.designation,f.email||'',f.phone||'',f.status]));
  } else if (type === 'exams') {
    rows = [['Exam ID','Name','Subject','Date','Start','End','Type','Status']];
    data.exams.forEach(e => rows.push([e.exam_id,e.name,App.subjectName(e.subject_id),e.date,e.start_time,e.end_time,e.exam_type,e.status]));
  } else if (type === 'seatings') {
    rows = [['Exam','Register Number','Name','Hall','Desk','Row','Column']];
    data.seatings.forEach(s => {
      const stu = App.studentById(s.student_id);
      const desk = App.deskById(s.desk_id);
      const hall = App.hallById(s.hall_id);
      const exam = data.exams.find(e => e.id === s.exam_id);
      rows.push([exam?exam.exam_id:'', stu?stu.register_number:'', stu?stu.name:'', hall?hall.hall_number:'', desk?desk.desk_number:'', desk?desk.row:'', desk?desk.column:'']);
    });
  } else if (type === 'attendance') {
    rows = [['Exam','Register Number','Name','Status']];
    data.attendance.forEach(a => {
      const stu = App.studentById(a.student_id);
      const exam = data.exams.find(e => e.id === a.exam_id);
      rows.push([exam?exam.exam_id:'', stu?stu.register_number:'', stu?stu.name:'', a.status]);
    });
  }
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  App.toast('Export downloaded', 'success');
}

/* ========== SETTINGS ========== */
function loadSettingsPanel() {
  const data = DB.get();
  const s = data.settings || {};
  if (document.getElementById('setCollege')) document.getElementById('setCollege').value = s.college_name || '';
  if (document.getElementById('setYear')) document.getElementById('setYear').value = s.academic_year || '';
  if (document.getElementById('setStrategy')) document.getElementById('setStrategy').value = s.default_seating_strategy || 'alternate';
  if (document.getElementById('setSheetUrl')) document.getElementById('setSheetUrl').value = DB.GOOGLE_SCRIPT_URL || '';
}

function saveSettings() {
  DB.update(data => {
    data.settings = data.settings || {};
    data.settings.college_name = document.getElementById('setCollege').value.trim();
    data.settings.academic_year = document.getElementById('setYear').value.trim();
    data.settings.default_seating_strategy = document.getElementById('setStrategy').value;
  });
  const url = document.getElementById('setSheetUrl').value.trim();
  if (url) {
    DB.GOOGLE_SCRIPT_URL = url;
    App.toast('Settings saved. Sheet URL applied for this session. For permanent use, also set it in js/db.js.', 'success');
  } else {
    App.toast('Settings saved', 'success');
  }
}

/* ========== NAV ========== */
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  const nav = document.querySelector('[data-panel="' + name + '"]');
  if (nav) nav.classList.add('active');
  const title = document.getElementById('topTitle');
  if (title) title.textContent = name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1');

  if (name === 'dashboard') loadAdminDashboard();
  if (name === 'students') loadStudentsPanel();
  if (name === 'faculty') loadFacultyPanel();
  if (name === 'departments') loadDeptPanel();
  if (name === 'classes') loadClassPanel();
  if (name === 'subjects') loadSubjectPanel();
  if (name === 'exams') loadExamsPanel();
  if (name === 'halls') loadHallsPanel();
  if (name === 'seating') loadSeatingPanel();
  if (name === 'duties') loadDutiesPanel();
  if (name === 'attendance') loadAttendancePanel();
  if (name === 'reports') loadReportsPanel();
  if (name === 'settings') loadSettingsPanel();
}
