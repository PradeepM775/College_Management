/* CEMS Database Layer
   - Primary: Google Sheets (via Apps Script Web App)
   - Cache / offline fallback: localStorage
*/

const DB = {
  KEY: 'cems_data_v2',

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



  LOCK_MS: 12 * 60 * 1000, // 12 minutes without heartbeat = expired

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

  async refreshFromRemote() {
    if (!this.useGoogle()) return this.get();
    var remote = await this.fetchFromGoogle();
    if (remote && remote.seeded) {
      var local = this.loadLocal();
      remote.session = (this._cache && this._cache.session) || local.session || null;
      if (!remote.history) remote.history = local.history || [];
      this._cache = remote;
      this.saveLocal(remote);
      return remote;
    }
    return this.get();
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

  /** Record an activity entry (synced with full DB to Google Sheet) */
  log(action, details) {
    try {
      const session = (this.get().session) || {};
      this.update(data => {
        if (!data.history) data.history = [];
        data.history.unshift({
          id: this.nextId(data.history),
          at: new Date().toISOString(),
          action: String(action || 'action'),
          details: String(details || ''),
          user: session.username || session.name || 'system',
          role: session.role || ''
        });
        // keep last 500 entries
        if (data.history.length > 500) data.history = data.history.slice(0, 500);
      });
    } catch (e) {
      console.warn('log failed', e);
    }
  },

  hash(pw) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = ((h << 5) - h) + pw.charCodeAt(i) | 0;
    return 'h' + Math.abs(h).toString(36);
  },

  nextId(arr) {
    if (!arr || !arr.length) return 1;
    var ids = arr.map(function (x) { return Number(x.id) || 0; });
    return Math.max.apply(null, ids) + 1;
  },

  /**
   * Fresh empty database — only admin login account.
   * No demo students / faculty / departments / classes / subjects / exams / halls.
   * User adds all data from the website; changes sync to Google Sheets.
   */
  buildEmpty() {
    const data = this.defaultData();
    data.users = [
      { id: 1, username: 'admin', password: this.hash('admin123'), role: 'admin', name: 'Administrator' }
    ];
    data.history = [];
    data.admin_lock = null;
    data.seeded = true; // means "initialized" (structure ready), not "has demo data"
    return data;
  },

  /** Back-compat alias */
  buildSeed() {
    return this.buildEmpty();
  },

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

  seed() {
    var data = this.loadLocal();
    if (data.seeded) {
      this._cache = data;
      return data;
    }
    data = this.buildEmpty();
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) this.pushToGoogle(data);
    return data;
  },

  /** Clear ALL business data; keep only admin login. Also clears Google Sheet. */
  async reset() {
    var data = this.buildEmpty();
    this._cache = data;
    this.saveLocal(data);
    if (this.useGoogle()) {
      await this.pushToGoogle(data);
    }
    return data;
  },

  async init() {
    // Prefer remote Google Sheet if available; otherwise local; otherwise empty+admin
    var data = this.loadLocal();

    if (this.useGoogle()) {
      try {
        var remote = await this.fetchFromGoogle();
        if (remote && remote.seeded) {
          remote.session = data.session || null;
          if (!remote.history) remote.history = data.history || [];
          this.ensureAdminUser(remote);
          this._cache = remote;
          this.saveLocal(remote);
          return remote;
        }
      } catch (e) {
        console.warn('Remote load failed during init', e);
      }
    }

    if (!data.seeded) {
      data = this.buildEmpty();
      this.saveLocal(data);
      if (this.useGoogle()) this.pushToGoogle(data);
    } else {
      this.ensureAdminUser(data);
      this.saveLocal(data);
    }
    this._cache = data;

    if (this.useGoogle()) this._backgroundSync();
    return data;
  },

  async _backgroundSync() {
    try {
      var remote = await this.fetchFromGoogle();
      if (remote && remote.seeded) {
        var local = this.loadLocal();
        remote.session = (this._cache && this._cache.session) || local.session || null;
        if (!remote.history) remote.history = local.history || [];
        this.ensureAdminUser(remote);
        this._cache = remote;
        this.saveLocal(remote);
        try {
          window.dispatchEvent(new CustomEvent('cems-data-synced', { detail: remote }));
        } catch (e) {}
      } else if (this._cache && this._cache.seeded) {
        // Sheet empty — push current local (empty or user data), never demo
        await this.pushToGoogle(this._cache);
      }
    } catch (e) {
      console.warn('Background sheet sync failed', e);
    }
  },

  async syncNow() {
    if (!this.useGoogle()) return this.get();
    var remote = await this.fetchFromGoogle();
    if (remote && remote.seeded) {
      remote.session = (this._cache && this._cache.session) || null;
      this.ensureAdminUser(remote);
      this._cache = remote;
      this.saveLocal(remote);
      return remote;
    }
    return this.get();
  }
};

DB.initPromise = DB.init();
