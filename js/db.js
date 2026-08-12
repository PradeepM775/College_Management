/* CEMS Database — Static HTML + Google Sheets
   ============================================
   Open index.html directly (no Python / no server).

   Source of truth : Google Sheets (via Apps Script URL)
   Instant cache   : browser localStorage
   Rule            : Refresh only READS from Sheet. Never wipes Sheet with empty data.
*/

const DB = {
  KEY: 'cems_data_v3',

  /* ===== PASTE your Apps Script Web App URL ===== */
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbweQKA6puFyzT1-Kj0g3-gj1iQar7hKLh9-VC1l8HoEBxewfRlAHA38x5Lf-FMseQTH/exec',

  syncState: 'idle',   // idle | loading | online | offline | saving | error
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
      history: [],
      settings: {
        college_name: 'Greenwood College of Arts & Science',
        academic_year: '2025-26',
        default_seating_strategy: 'alternate'
      },
      session: null,
      admin_lock: null,
      seeded: false
    };
  },

  useGoogle() {
    return !!(this.GOOGLE_SCRIPT_URL && this.GOOGLE_SCRIPT_URL.indexOf('https://') === 0);
  },

  hasRealData(data) {
    if (!data) return false;
    var keys = ['students', 'faculty', 'departments', 'classes', 'subjects', 'halls', 'exams', 'seatings', 'duties', 'attendance'];
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] && data[keys[i]].length > 0) return true;
    }
    return false;
  },

  dataWeight(data) {
    if (!data) return 0;
    var n = 0;
    var keys = ['students', 'faculty', 'departments', 'classes', 'subjects', 'halls', 'desks', 'exams', 'seatings', 'duties', 'attendance', 'history'];
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] && data[keys[i]].length) n += data[keys[i]].length;
    }
    return n;
  },

  loadLocal() {
    try {
      var raw = localStorage.getItem(this.KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return this.defaultData();
  },

  saveLocal(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('localStorage full or blocked', e);
    }
  },

  get() {
    if (this._cache) return this._cache;
    this._cache = this.loadLocal();
    return this._cache;
  },

  /* ---- Google Sheets load (READ) ---- */
  async fetchRemote() {
    if (!this.useGoogle()) return null;
    this.syncState = 'loading';
    try {
      var url = this.GOOGLE_SCRIPT_URL +
        (this.GOOGLE_SCRIPT_URL.indexOf('?') >= 0 ? '&' : '?') +
        'action=load&_=' + Date.now();
      var res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' });
      var json = await res.json();
      if (json && json.success && json.data) {
        this.syncState = 'online';
        this.lastError = null;
        if (!json.data.seeded) {
          json.data.seeded = this.hasRealData(json.data) || !!(json.data.users && json.data.users.length);
        }
        return json.data;
      }
      this.syncState = 'error';
      this.lastError = (json && json.message) || 'Load failed';
      return null;
    } catch (err) {
      this.syncState = 'offline';
      this.lastError = String(err);
      console.warn('Sheet load failed', err);
      return null;
    }
  },

  /* ---- Google Sheets save (WRITE) — never empty overwrite ---- */
  async pushRemote(data) {
    if (!this.useGoogle() || !data) return false;

    // Block empty wipe
    if (!this.hasRealData(data) && !(data.users && data.users.length > 1)) {
      try {
        var remote = await this.fetchRemote();
        if (remote && this.hasRealData(remote)) {
          console.warn('Blocked empty push — Sheet has data');
          this.lastError = 'Blocked empty overwrite';
          return false;
        }
      } catch (e) {
        return false;
      }
    }

    this.syncState = 'saving';
    try {
      var payload = JSON.parse(JSON.stringify(data));
      payload.session = null;
      payload.seeded = true;
      var res = await fetch(this.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', data: payload })
      });
      var json = await res.json();
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
      console.warn('Sheet save failed', err);
      return false;
    }
  },

  /* Compat aliases used by app.js */
  fetchFromGoogle() { return this.fetchRemote(); },
  pushToGoogle(data) { return this.pushRemote(data); },
  useRemote() { return this.useGoogle(); },
  remoteUrl() { return this.GOOGLE_SCRIPT_URL || ''; },

  /* ---- Mutations (admin) → local + Sheet ---- */
  update(fn) {
    var data = this.get();
    fn(data);
    data.seeded = true;
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) this.pushRemote(data);
    return data;
  },

  log(action, details) {
    try {
      var session = (this.get().session) || {};
      this.update(function (data) {
        if (!data.history) data.history = [];
        data.history.unshift({
          id: DB.nextId(data.history),
          at: new Date().toISOString(),
          action: String(action || 'action'),
          details: String(details || ''),
          user: session.username || session.name || 'system',
          role: session.role || ''
        });
        if (data.history.length > 300) data.history = data.history.slice(0, 300);
      });
    } catch (e) {}
  },

  hash(pw) {
    var h = 0;
    for (var i = 0; i < pw.length; i++) h = ((h << 5) - h) + pw.charCodeAt(i) | 0;
    return 'h' + Math.abs(h).toString(36);
  },

  nextId(arr) {
    if (!arr || !arr.length) return 1;
    var ids = arr.map(function (x) { return Number(x.id) || 0; });
    return Math.max.apply(null, ids) + 1;
  },

  buildEmpty() {
    var data = this.defaultData();
    data.users = [
      { id: 1, username: 'admin', password: this.hash('admin123'), role: 'admin', name: 'Administrator' }
    ];
    data.history = [];
    data.admin_lock = null;
    data.seeded = true;
    return data;
  },

  buildSeed() { return this.buildEmpty(); },

  ensureAdminUser(data) {
    if (!data.users) data.users = [];
    var admin = data.users.find(function (u) {
      return String(u.username).toLowerCase() === 'admin' && u.role === 'admin';
    });
    if (!admin) {
      data.users.push({
        id: this.nextId(data.users),
        username: 'admin',
        password: this.hash('admin123'),
        role: 'admin',
        name: 'Administrator'
      });
    }
    data.seeded = true;
    return data;
  },

  LOCK_MS: 12 * 60 * 1000,

  getDeviceId() {
    try {
      var id = localStorage.getItem('cems_device_id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('cems_device_id', id);
      }
      return id;
    } catch (e) {
      return 'dev_unknown';
    }
  },

  isAdminLockActive(lock) {
    if (!lock || !lock.device_id) return false;
    var t = Date.parse(lock.last_seen || lock.locked_at || 0);
    if (!t) return false;
    return (Date.now() - t) < this.LOCK_MS;
  },

  /* ---- INIT: local instant → Sheet pull (never wipe) ---- */
  async init() {
    // 1) Show cached data immediately (fast)
    var local = this.loadLocal();
    if (local.seeded || this.hasRealData(local) || (local.users && local.users.length)) {
      this.ensureAdminUser(local);
      this._cache = local;
    } else {
      var empty = this.buildEmpty();
      this._cache = empty;
      this.saveLocal(empty);
      // Do NOT push empty shell to Sheet on first open
    }

    // 2) Pull Sheet in background — Sheet is source of truth
    if (this.useGoogle()) {
      try {
        var remote = await this.fetchRemote();
        if (remote && (remote.seeded || this.hasRealData(remote) || (remote.users && remote.users.length))) {
          remote.session = (this._cache && this._cache.session) || local.session || null;
          if (!remote.history) remote.history = (this._cache && this._cache.history) || [];
          this.ensureAdminUser(remote);
          this._cache = remote;
          this.saveLocal(remote);
          try {
            window.dispatchEvent(new CustomEvent('cems-data-synced', { detail: remote }));
          } catch (e) {}
        } else if (this.hasRealData(this._cache)) {
          // Sheet empty, local has real data → upload once
          await this.pushRemote(this._cache);
        }
        // both empty → leave local admin shell; do not push
      } catch (e) {
        console.warn('init remote failed', e);
      }
    }
    return this._cache;
  },

  async refreshFromRemote() {
    if (!this.useGoogle()) return this.get();
    var remote = await this.fetchRemote();
    if (remote && (remote.seeded || this.hasRealData(remote) || (remote.users && remote.users.length))) {
      var local = this.loadLocal();
      remote.session = (this._cache && this._cache.session) || local.session || null;
      if (!remote.history) remote.history = local.history || [];
      this.ensureAdminUser(remote);
      this._cache = remote;
      this.saveLocal(remote);
      return remote;
    }
    return this.get();
  },

  async syncNow() {
    return this.refreshFromRemote();
  },

  /* Explicit Reset only (Settings) — wipes Sheet intentionally */
  async reset() {
    var data = this.buildEmpty();
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) {
      try {
        var payload = JSON.parse(JSON.stringify(data));
        payload.session = null;
        payload.seeded = true;
        await fetch(this.GOOGLE_SCRIPT_URL, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'save', data: payload, force: true })
        });
      } catch (e) {}
    }
    return data;
  }
};

/* Start loading as soon as script parses */
DB.initPromise = DB.init();
