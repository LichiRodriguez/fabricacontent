const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "factory.db");

// Ensure data directory exists
const fs = require("fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma("journal_mode = WAL");

// ─── Schema ───────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  -- 'tweet', 'article', 'thread', 'video', 'idea'
    original_text TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sources(id)
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL,
    structure TEXT NOT NULL,
    hook TEXT NOT NULL,
    body TEXT NOT NULL,
    cta TEXT NOT NULL,
    angle TEXT,
    duration TEXT,
    visual_format TEXT,
    status TEXT DEFAULT 'pending',  -- pending, queued, recorded, uploaded
    tiktok_url TEXT,
    -- Metrics (filled after upload)
    views INTEGER,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    favorites INTEGER,
    avg_watch_time REAL,
    full_watch_rate REAL,
    metrics_updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_id) REFERENCES topics(id)
  );

  CREATE TABLE IF NOT EXISTS analysis_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start DATE NOT NULL,
    analysis_text TEXT NOT NULL,
    patterns_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Source operations ────────────────────────────────────────────────
const insertSource = db.prepare(
  `INSERT INTO sources (type, original_text, language) VALUES (?, ?, ?)`
);

const getSource = db.prepare(`SELECT * FROM sources WHERE id = ?`);

// ─── Topic operations ─────────────────────────────────────────────────
const insertTopic = db.prepare(
  `INSERT INTO topics (source_id, name, description) VALUES (?, ?, ?)`
);

// ─── Script operations ────────────────────────────────────────────────
const insertScript = db.prepare(
  `INSERT INTO scripts (topic_id, structure, hook, body, cta, angle, duration, visual_format)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateScriptStatus = db.prepare(
  `UPDATE scripts SET status = ? WHERE id = ?`
);

const updateScriptUrl = db.prepare(
  `UPDATE scripts SET tiktok_url = ?, status = 'uploaded' WHERE id = ?`
);

const updateScriptMetrics = db.prepare(
  `UPDATE scripts SET views = ?, likes = ?, comments = ?, shares = ?,
   favorites = ?, avg_watch_time = ?, full_watch_rate = ?,
   metrics_updated_at = CURRENT_TIMESTAMP WHERE id = ?`
);

const getScriptsByStatus = db.prepare(
  `SELECT s.*, t.name as topic_name FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   WHERE s.status = ? ORDER BY s.created_at DESC`
);

const getScriptById = db.prepare(
  `SELECT s.*, t.name as topic_name, src.original_text as source_text
   FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   JOIN sources src ON t.source_id = src.id
   WHERE s.id = ?`
);

const getAllScripts = db.prepare(
  `SELECT s.*, t.name as topic_name FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   ORDER BY s.created_at DESC`
);

const getScriptsWithMetrics = db.prepare(
  `SELECT s.*, t.name as topic_name FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   WHERE s.views IS NOT NULL
   ORDER BY s.views DESC`
);

const getRecentScripts = db.prepare(
  `SELECT s.*, t.name as topic_name FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   ORDER BY s.created_at DESC LIMIT ?`
);

// ─── Stats queries ────────────────────────────────────────────────────
const getStatusCounts = db.prepare(
  `SELECT status, COUNT(*) as count FROM scripts GROUP BY status`
);

const getTopPerformers = db.prepare(
  `SELECT s.*, t.name as topic_name FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   WHERE s.views IS NOT NULL
   ORDER BY s.views DESC LIMIT ?`
);

const getStructureStats = db.prepare(
  `SELECT structure,
     COUNT(*) as total,
     AVG(views) as avg_views,
     AVG(likes) as avg_likes,
     AVG(full_watch_rate) as avg_watch_rate
   FROM scripts
   WHERE views IS NOT NULL
   GROUP BY structure
   ORDER BY avg_views DESC`
);

const getTopicStats = db.prepare(
  `SELECT t.name as topic,
     COUNT(*) as total_scripts,
     SUM(CASE WHEN s.views IS NOT NULL THEN 1 ELSE 0 END) as with_metrics,
     AVG(s.views) as avg_views,
     AVG(s.likes) as avg_likes
   FROM scripts s
   JOIN topics t ON s.topic_id = t.id
   GROUP BY t.name
   HAVING with_metrics > 0
   ORDER BY avg_views DESC`
);

const getHookStats = db.prepare(
  `SELECT hook, views, likes, comments, shares, structure, full_watch_rate
   FROM scripts
   WHERE views IS NOT NULL
   ORDER BY views DESC LIMIT 20`
);

// ─── Analysis log ─────────────────────────────────────────────────────
const insertAnalysis = db.prepare(
  `INSERT INTO analysis_log (week_start, analysis_text, patterns_json) VALUES (?, ?, ?)`
);

const getLatestAnalysis = db.prepare(
  `SELECT * FROM analysis_log ORDER BY created_at DESC LIMIT 1`
);

// ─── Bulk save from AI generation ─────────────────────────────────────
function saveGeneration(sourceType, originalText, topics) {
  const saveAll = db.transaction(() => {
    const sourceResult = insertSource.run(sourceType, originalText, "en");
    const sourceId = sourceResult.lastInsertRowid;

    const scriptIds = [];

    for (const topic of topics) {
      const topicResult = insertTopic.run(sourceId, topic.tema, topic.descripcion);
      const topicId = topicResult.lastInsertRowid;

      for (const script of topic.guiones || []) {
        const scriptResult = insertScript.run(
          topicId,
          script.estructura || "",
          script.hook || "",
          script.desarrollo || "",
          script.cta || "",
          script.angulo || "",
          script.duracion_estimada || "",
          script.formato_visual || ""
        );
        scriptIds.push(scriptResult.lastInsertRowid);
      }
    }

    return { sourceId, scriptIds };
  });

  return saveAll();
}

module.exports = {
  db,
  saveGeneration,
  insertSource,
  getSource,
  insertTopic,
  insertScript,
  updateScriptStatus,
  updateScriptUrl,
  updateScriptMetrics,
  getScriptsByStatus,
  getScriptById,
  getAllScripts,
  getScriptsWithMetrics,
  getRecentScripts,
  getStatusCounts,
  getTopPerformers,
  getStructureStats,
  getTopicStats,
  getHookStats,
  insertAnalysis,
  getLatestAnalysis,
};
