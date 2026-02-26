const express = require("express");
const db = require("./db");
const path = require("path");

function createDashboard() {
  const app = express();

  app.use(express.json());

  // ─── API Routes ───────────────────────────────────────────────────
  app.get("/api/stats", (req, res) => {
    const counts = db.getStatusCounts.all();
    const map = {};
    counts.forEach((c) => (map[c.status] = c.count));
    res.json({
      pending: map.pending || 0,
      queued: map.queued || 0,
      recorded: map.recorded || 0,
      uploaded: map.uploaded || 0,
      total: Object.values(map).reduce((a, b) => a + b, 0),
    });
  });

  app.get("/api/scripts", (req, res) => {
    const status = req.query.status;
    if (status) {
      res.json(db.getScriptsByStatus.all(status));
    } else {
      res.json(db.getAllScripts.all());
    }
  });

  app.get("/api/scripts/:id", (req, res) => {
    const script = db.getScriptById.get(parseInt(req.params.id));
    if (!script) return res.status(404).json({ error: "Not found" });
    res.json(script);
  });

  app.patch("/api/scripts/:id/status", (req, res) => {
    const { status } = req.body;
    const id = parseInt(req.params.id);
    db.updateScriptStatus.run(status, id);
    res.json({ ok: true });
  });

  app.patch("/api/scripts/:id/url", (req, res) => {
    const { url } = req.body;
    const id = parseInt(req.params.id);
    db.updateScriptUrl.run(url, id);
    res.json({ ok: true });
  });

  app.patch("/api/scripts/:id/metrics", (req, res) => {
    const { views, likes, comments, shares, favorites, avg_watch_time, full_watch_rate } = req.body;
    const id = parseInt(req.params.id);
    db.updateScriptMetrics.run(
      views || 0, likes || 0, comments || 0, shares || 0,
      favorites || 0, avg_watch_time || null, full_watch_rate || null, id
    );
    res.json({ ok: true });
  });

  app.get("/api/analytics/structures", (req, res) => {
    res.json(db.getStructureStats.all());
  });

  app.get("/api/analytics/topics", (req, res) => {
    res.json(db.getTopicStats.all());
  });

  app.get("/api/analytics/top", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    res.json(db.getTopPerformers.all(limit));
  });

  app.get("/api/analytics/hooks", (req, res) => {
    res.json(db.getHookStats.all());
  });

  app.get("/api/analytics/latest", (req, res) => {
    const analysis = db.getLatestAnalysis.get();
    if (!analysis) return res.json(null);
    res.json({
      ...analysis,
      patterns: JSON.parse(analysis.patterns_json || "{}"),
    });
  });

  // ─── Serve Dashboard HTML ─────────────────────────────────────────
  app.get("/", (req, res) => {
    res.send(DASHBOARD_HTML);
  });

  return app;
}

// ─── Inline Dashboard HTML ────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Factory — Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0a; color: #e5e5e5; font-family: 'DM Sans', sans-serif; }

    .header {
      border-bottom: 1px solid #1a1a2e; padding: 16px 24px;
      display: flex; align-items: center; gap: 12px;
    }
    .logo {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #ff6b35, #f7c948);
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .header-title { font-family: 'Space Mono', monospace; font-weight: 700; color: #fff; }
    .header-sub { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }

    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }

    /* Stats cards */
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin-bottom: 32px;
    }
    .stat-card {
      background: #111; border: 1px solid #1a1a2e; border-radius: 12px;
      padding: 16px; text-align: center;
    }
    .stat-number {
      font-family: 'Space Mono', monospace; font-size: 28px;
      font-weight: 700; color: #ff6b35;
    }
    .stat-label { font-size: 12px; color: #666; margin-top: 4px; }

    /* Tabs */
    .tabs {
      display: flex; gap: 4px; margin-bottom: 20px;
      border-bottom: 1px solid #1a1a2e; padding-bottom: 0;
    }
    .tab {
      padding: 10px 18px; background: none; border: none; color: #666;
      cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 14px;
      border-bottom: 2px solid transparent; transition: all 0.2s;
    }
    .tab:hover { color: #aaa; }
    .tab.active { color: #ff6b35; border-bottom-color: #ff6b35; }

    /* Script cards */
    .scripts-list { display: flex; flex-direction: column; gap: 8px; }
    .script-card {
      background: #111; border: 1px solid #1a1a2e; border-radius: 12px;
      padding: 16px; cursor: pointer; transition: border-color 0.2s;
    }
    .script-card:hover { border-color: #333; }
    .script-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .script-id { font-family: 'Space Mono', monospace; font-size: 11px; color: #555; }
    .script-structure {
      font-size: 11px; color: #ff6b35; background: rgba(255,107,53,0.1);
      padding: 2px 8px; border-radius: 4px;
    }
    .script-hook { font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px; }
    .script-topic { font-size: 12px; color: #666; }
    .script-meta { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
    .script-meta span {
      font-size: 11px; color: #555; background: #1a1a1a;
      padding: 3px 8px; border-radius: 4px;
    }

    /* Script detail modal */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8); z-index: 100; justify-content: center;
      align-items: center; padding: 16px;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: #111; border: 1px solid #1a1a2e; border-radius: 16px;
      max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px;
    }
    .modal-close {
      float: right; background: none; border: none; color: #666;
      font-size: 20px; cursor: pointer;
    }
    .modal-section { margin-bottom: 16px; }
    .modal-label {
      font-family: 'Space Mono', monospace; font-size: 10px;
      text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;
    }
    .label-hook { color: #ff6b35; }
    .label-body { color: #f7c948; }
    .label-cta { color: #4ecdc4; }
    .modal-text { font-size: 14px; line-height: 1.6; color: #ccc; }
    .modal-text.hook { font-size: 16px; font-weight: 600; color: #fff; }

    /* Status buttons */
    .status-buttons { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
    .status-btn {
      padding: 8px 16px; border-radius: 8px; border: 1px solid #333;
      background: #1a1a1a; color: #888; cursor: pointer; font-size: 13px;
      transition: all 0.2s;
    }
    .status-btn:hover { border-color: #ff6b35; color: #ff6b35; }
    .status-btn.active { background: rgba(255,107,53,0.15); border-color: #ff6b35; color: #ff6b35; }

    /* Metrics panel */
    .metrics-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; margin-top: 24px;
    }
    .metric-card {
      background: #111; border: 1px solid #1a1a2e; border-radius: 12px; padding: 16px;
    }
    .metric-card h3 {
      font-family: 'Space Mono', monospace; font-size: 12px; color: #666;
      margin-bottom: 8px; text-transform: uppercase;
    }
    .metric-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .metric-row .name { color: #aaa; }
    .metric-row .value { color: #ff6b35; font-family: 'Space Mono', monospace; }

    /* Analysis */
    .analysis-card {
      background: linear-gradient(135deg, rgba(255,107,53,0.05), rgba(247,201,72,0.05));
      border: 1px solid rgba(255,107,53,0.15); border-radius: 12px; padding: 20px;
      margin-bottom: 20px;
    }
    .analysis-title { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .analysis-text { font-size: 14px; color: #ccc; line-height: 1.6; }

    .empty-state { text-align: center; padding: 48px; color: #333; }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }

    @media (max-width: 600px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .tabs { overflow-x: auto; }
    }
  </style>
</head>
<body>

<div class="header">
  <div class="logo">⚡</div>
  <div>
    <div class="header-title">Content Factory</div>
    <div class="header-sub">Dashboard de producción</div>
  </div>
</div>

<div class="container">
  <!-- Stats -->
  <div class="stats-grid" id="stats-grid"></div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" data-tab="pipeline" onclick="switchTab('pipeline', this)">📋 Pipeline</button>
    <button class="tab" data-tab="analytics" onclick="switchTab('analytics', this)">📊 Analytics</button>
  </div>

  <!-- Pipeline view -->
  <div id="tab-pipeline">
    <div class="tabs" style="border:none; margin-bottom: 12px;">
      <button class="tab active" onclick="loadScripts('pending', this)">Pendientes</button>
      <button class="tab" onclick="loadScripts('queued', this)">Por grabar</button>
      <button class="tab" onclick="loadScripts('recorded', this)">Grabados</button>
      <button class="tab" onclick="loadScripts('uploaded', this)">Subidos</button>
      <button class="tab" onclick="loadScripts(null, this)">Todos</button>
    </div>
    <div class="scripts-list" id="scripts-list"></div>
  </div>

  <!-- Analytics view -->
  <div id="tab-analytics" style="display:none">
    <div id="analysis-section"></div>
    <div class="metrics-grid" id="metrics-grid"></div>
  </div>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal" id="modal-content"></div>
</div>

<script>
  const API = '';

  // ─── Load stats ───────────────────────────────────────────────
  async function loadStats() {
    const res = await fetch(API + '/api/stats');
    const data = await res.json();
    document.getElementById('stats-grid').innerHTML =
      statCard(data.pending, 'Pendientes', '#888') +
      statCard(data.queued, 'Por grabar', '#f7c948') +
      statCard(data.recorded, 'Grabados', '#4ecdc4') +
      statCard(data.uploaded, 'Subidos', '#ff6b35') +
      statCard(data.total, 'Total', '#fff');
  }

  function statCard(n, label, color) {
    return '<div class="stat-card"><div class="stat-number" style="color:' + color + '">' + n +
      '</div><div class="stat-label">' + label + '</div></div>';
  }

  // ─── Load scripts ─────────────────────────────────────────────
  async function loadScripts(status, tabEl) {
    if (tabEl) {
      tabEl.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tabEl.classList.add('active');
    }
    const url = status ? API + '/api/scripts?status=' + status : API + '/api/scripts';
    const res = await fetch(url);
    const scripts = await res.json();
    const list = document.getElementById('scripts-list');

    if (scripts.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div>No hay guiones acá</div></div>';
      return;
    }

    list.innerHTML = scripts.map(s =>
      '<div class="script-card" onclick="openScript(' + s.id + ')">' +
        '<div class="script-header">' +
          '<span class="script-id">#' + s.id + '</span>' +
          '<span class="script-structure">' + esc(s.structure) + '</span>' +
        '</div>' +
        '<div class="script-hook">' + esc(s.hook) + '</div>' +
        '<div class="script-topic">📂 ' + esc(s.topic_name) + '</div>' +
        '<div class="script-meta">' +
          '<span>⏱ ' + esc(s.duration) + '</span>' +
          '<span>🎥 ' + esc(s.visual_format) + '</span>' +
          (s.views != null ? '<span>👁 ' + Number(s.views).toLocaleString() + '</span>' : '') +
        '</div>' +
      '</div>'
    ).join('');
  }

  // ─── Open script detail ───────────────────────────────────────
  async function openScript(id) {
    const res = await fetch(API + '/api/scripts/' + id);
    const s = await res.json();

    const statuses = ['pending','queued','recorded','uploaded'];
    const labels = { pending: '📋 Pendiente', queued: '🎯 Por grabar', recorded: '🎥 Grabado', uploaded: '✅ Subido' };

    document.getElementById('modal-content').innerHTML =
      '<button class="modal-close" onclick="closeModal()">✕</button>' +
      '<div class="script-header"><span class="script-id">#' + s.id + '</span>' +
        '<span class="script-structure">' + esc(s.structure) + '</span></div>' +
      '<div class="script-topic" style="margin-bottom:16px">📂 ' + esc(s.topic_name) + '</div>' +

      '<div class="modal-section"><div class="modal-label label-hook">🎬 Hook</div>' +
        '<div class="modal-text hook">' + esc(s.hook) + '</div></div>' +

      '<div class="modal-section"><div class="modal-label label-body">📝 Desarrollo</div>' +
        '<div class="modal-text">' + esc(s.body) + '</div></div>' +

      '<div class="modal-section"><div class="modal-label label-cta">📢 CTA</div>' +
        '<div class="modal-text">' + esc(s.cta) + '</div></div>' +

      '<div class="script-meta" style="margin-bottom:12px">' +
        '<span>⏱ ' + esc(s.duration) + '</span>' +
        '<span>🎥 ' + esc(s.visual_format) + '</span>' +
        '<span>🎯 ' + esc(s.angle) + '</span>' +
      '</div>' +

      '<div class="status-buttons">' +
        statuses.map(st =>
          '<button class="status-btn' + (s.status === st ? ' active' : '') +
          '" onclick="setStatus(' + s.id + ',\\'' + st + '\\')">' + labels[st] + '</button>'
        ).join('') +
      '</div>' +

      (s.status === 'uploaded' ?
        '<div style="margin-top:16px">' +
          '<input id="tiktok-url" placeholder="URL de TikTok" value="' + (s.tiktok_url || '') + '"' +
          ' style="width:100%;padding:8px 12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#e5e5e5;font-size:13px;margin-bottom:8px">' +
          '<button onclick="saveUrl(' + s.id + ')" style="padding:6px 14px;background:#222;border:none;color:#888;border-radius:6px;cursor:pointer;font-size:12px">Guardar URL</button>' +
        '</div>' : '') +

      (s.views != null ?
        '<div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a1a2e">' +
          '<div class="modal-label" style="color:#f7c948">📊 Métricas</div>' +
          '<div class="script-meta">' +
            '<span>👁 ' + Number(s.views).toLocaleString() + '</span>' +
            '<span>❤️ ' + Number(s.likes).toLocaleString() + '</span>' +
            '<span>💬 ' + s.comments + '</span>' +
            '<span>🔄 ' + s.shares + '</span>' +
            (s.avg_watch_time ? '<span>⏱ ' + s.avg_watch_time + 's</span>' : '') +
            (s.full_watch_rate ? '<span>👀 ' + s.full_watch_rate + '%</span>' : '') +
          '</div>' +
        '</div>' : '');

    document.getElementById('modal').classList.add('open');
  }

  async function setStatus(id, status) {
    await fetch(API + '/api/scripts/' + id + '/status', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status })
    });
    openScript(id);
    loadStats();
  }

  async function saveUrl(id) {
    const url = document.getElementById('tiktok-url').value;
    await fetch(API + '/api/scripts/' + id + '/url', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ url })
    });
    openScript(id);
  }

  function closeModal() { document.getElementById('modal').classList.remove('open'); }

  // ─── Analytics ────────────────────────────────────────────────
  async function loadAnalytics() {
    const [structures, topics, top, latest] = await Promise.all([
      fetch(API + '/api/analytics/structures').then(r => r.json()),
      fetch(API + '/api/analytics/topics').then(r => r.json()),
      fetch(API + '/api/analytics/top?limit=5').then(r => r.json()),
      fetch(API + '/api/analytics/latest').then(r => r.json()),
    ]);

    const section = document.getElementById('analysis-section');
    if (latest) {
      section.innerHTML =
        '<div class="analysis-card"><div class="analysis-title">🧠 Último análisis IA</div>' +
        '<div class="analysis-text">' + esc(latest.analysis_text) + '</div></div>';
    } else {
      section.innerHTML =
        '<div class="analysis-card"><div class="analysis-text" style="color:#666">' +
        'Todavía no hay análisis. Usá /analizar en el bot cuando tengas métricas.</div></div>';
    }

    let grid = '';

    if (structures.length > 0) {
      grid += '<div class="metric-card"><h3>📐 Por estructura</h3>' +
        structures.map(s =>
          '<div class="metric-row"><span class="name">' + esc(s.structure) +
          '</span><span class="value">' + Math.round(s.avg_views || 0).toLocaleString() + ' avg views</span></div>'
        ).join('') + '</div>';
    }

    if (topics.length > 0) {
      grid += '<div class="metric-card"><h3>📂 Por tema</h3>' +
        topics.map(t =>
          '<div class="metric-row"><span class="name">' + esc(t.topic) +
          '</span><span class="value">' + Math.round(t.avg_views || 0).toLocaleString() + ' avg views</span></div>'
        ).join('') + '</div>';
    }

    if (top.length > 0) {
      grid += '<div class="metric-card"><h3>🏆 Top performers</h3>' +
        top.map(s =>
          '<div class="metric-row"><span class="name">#' + s.id + ' ' + esc(s.hook.substring(0, 35)) +
          '...</span><span class="value">' + Number(s.views).toLocaleString() + '</span></div>'
        ).join('') + '</div>';
    }

    document.getElementById('metrics-grid').innerHTML = grid ||
      '<div class="empty-state"><div class="icon">📊</div><div>Subí videos y cargá métricas para ver analytics</div></div>';
  }

  // ─── Tab switching ────────────────────────────────────────────
  function switchTab(tab, el) {
    document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('tab-pipeline').style.display = tab === 'pipeline' ? '' : 'none';
    document.getElementById('tab-analytics').style.display = tab === 'analytics' ? '' : 'none';
    if (tab === 'analytics') loadAnalytics();
  }

  function esc(s) { if(!s)return''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  // ─── Init ─────────────────────────────────────────────────────
  loadStats();
  loadScripts('pending');
</script>
</body>
</html>`;

module.exports = { createDashboard };
