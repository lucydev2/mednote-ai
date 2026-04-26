/* ---------------------------------------------------------------
   MedNote AI — shared localStorage layer
   Single key: mednote_v1 — survives page reloads, per-browser.
   Production target: real backend (DB) — see spec §5.
   --------------------------------------------------------------- */

(function () {
  const KEY = 'mednote_v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { version: 1, kees: [], insights: [] };
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        kees: Array.isArray(parsed.kees) ? parsed.kees : [],
        insights: Array.isArray(parsed.insights) ? parsed.insights : []
      };
    } catch (e) {
      console.warn('Storage read failed:', e);
      return { version: 1, kees: [], insights: [] };
    }
  }

  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Storage write failed (quota or private mode?):', e);
      throw e;
    }
  }

  function genId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  }

  const Storage = {
    // ---- KEEs ----
    getKEEs() {
      return read().kees;
    },

    saveKEE(kee) {
      const d = read();
      const idx = d.kees.findIndex(k => k.id === kee.id);
      const now = new Date().toISOString();
      if (idx >= 0) {
        d.kees[idx] = { ...d.kees[idx], ...kee, updated_at: now };
      } else {
        d.kees.push({
          id: kee.id || genId('k'),
          name: kee.name,
          institution: kee.institution || kee.org || '',
          specialty: kee.specialty || '',
          created_at: now,
          updated_at: now
        });
      }
      write(d);
      return d.kees[idx >= 0 ? idx : d.kees.length - 1];
    },

    findKEE(id) {
      return read().kees.find(k => k.id === id) || null;
    },

    searchKEEs(query) {
      if (!query) return [];
      const q = query.toLowerCase();
      return read().kees.filter(k =>
        (k.name || '').toLowerCase().includes(q) ||
        (k.institution || '').toLowerCase().includes(q)
      );
    },

    deleteKEE(id) {
      const d = read();
      d.kees = d.kees.filter(k => k.id !== id);
      // also delete associated insights
      d.insights = d.insights.filter(i => i.kee_id !== id);
      write(d);
    },

    // ---- Insights & Briefs ----
    getInsights() {
      return read().insights.slice().sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || '')
      );
    },

    saveInsight(insight) {
      const d = read();
      const now = new Date().toISOString();
      const id = insight.id || genId('i');
      const idx = d.insights.findIndex(i => i.id === id);
      const record = {
        id,
        type: insight.type || 'insight',
        kee_id: insight.kee_id || null,
        kee_name: insight.kee_name || '',
        kee_institution: insight.kee_institution || '',
        title: insight.title || '',
        created_at: (idx >= 0 ? d.insights[idx].created_at : null) || now,
        updated_at: now,
        output_language: insight.output_language || 'ko',
        input_text: insight.input_text || '',
        data: insight.data || {}
      };
      if (idx >= 0) d.insights[idx] = record;
      else d.insights.unshift(record);
      write(d);
      return record;
    },

    findInsight(id) {
      return read().insights.find(i => i.id === id) || null;
    },

    deleteInsight(id) {
      const d = read();
      d.insights = d.insights.filter(i => i.id !== id);
      write(d);
    },

    // ---- KEE-interaction analytics (for KEE list page) ----
    getKEEStats(keeId) {
      const items = read().insights.filter(i => i.kee_id === keeId);
      const sorted = items.slice().sort((a, b) =>
        (b.created_at || '').localeCompare(a.created_at || '')
      );
      return {
        count: items.length,
        last_contact: sorted[0]?.created_at || null,
        types: {
          brief: items.filter(i => i.type === 'brief').length,
          insight: items.filter(i => i.type === 'insight').length
        }
      };
    },

    // ---- Bulk ----
    clearAll() {
      localStorage.removeItem(KEY);
    },

    exportJSON() {
      return JSON.stringify(read(), null, 2);
    },

    importJSON(json) {
      try {
        const parsed = JSON.parse(json);
        write(parsed);
        return true;
      } catch (e) {
        return false;
      }
    },

    _genId: genId
  };

  // ---- Helpers (also exposed for convenience) ----
  Storage.formatDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const today = new Date();
    const isThisYear = d.getFullYear() === today.getFullYear();
    return isThisYear
      ? `${months[d.getMonth()]} ${d.getDate()}`
      : `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  Storage.computeInitials = function (name) {
    if (!name) return 'NK';
    const ko = String(name).match(/[가-힣]+/);
    const en = String(name).match(/[A-Za-z]+/g);
    if (ko && ko[0].length >= 2) return ko[0].slice(-2);
    if (en && en.length > 0) {
      const filtered = en.filter(w => !/^(dr|prof|mr|ms|mrs|pf)\.?$/i.test(w));
      const src = (filtered.length > 0 ? filtered : en).join('');
      return src.slice(0, 2).toUpperCase();
    }
    return 'NK';
  };

  // Signal CSS class mapping (matches styles.css palette)
  Storage.signalClass = function (tag) {
    const map = {
      'efficacy-driven': 'efficacy',
      'safety-cautious': 'safety',
      'biomarker-focused': 'biomarker',
      'regimen-conservative': 'regimen',
      'IO-combination-oriented': 'regimen',
      'real-world-data-sensitive': 'rwd',
      'data-skeptical': 'skeptical',
      'reimbursement-focused': 'safety'
    };
    return map[tag] || 'efficacy';
  };

  Storage.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  };

  window.Storage = Storage;
})();
