const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const initSqlJs = require('sql.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: os.tmpdir() });
const sessions = {}; // sessionId -> { db, SQL, data, filename }

let SQL;
initSqlJs().then(s => { SQL = s; console.log('sql.js ready'); });

function getDb(sessionId) {
  const s = sessions[sessionId];
  if (!s) throw new Error('Session not found');
  return s.db;
}

function saveToFile(sessionId) {
  const s = sessions[sessionId];
  const data = s.db.export();
  fs.writeFileSync(s.filePath, Buffer.from(data));
}

// Upload DB
app.post('/api/upload', upload.single('db'), async (req, res) => {
  try {
    if (!SQL) return res.status(503).json({ error: 'SQL engine not ready' });
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const filePath = req.file.path + '.db';
    fs.renameSync(req.file.path, filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const db = new SQL.Database(fileBuffer);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values.flat() || [];
    sessions[sessionId] = { db, filePath, filename: req.file.originalname };
    res.json({ sessionId, tables, filename: req.file.originalname });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Download DB
app.get('/api/download/:sessionId', (req, res) => {
  const s = sessions[req.params.sessionId];
  if (!s) return res.status(404).json({ error: 'Session not found' });
  saveToFile(req.params.sessionId);
  res.download(s.filePath, s.filename || 'game_data.db');
});

function dbAll(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    const colNames = stmt.getColumnNames();
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push(row);
    }
    stmt.free();
    return rows;
  } catch(e) { return []; }
}

function dbRun(db, sql, params = []) {
  db.run(sql, params);
}

// --- QUESTS ---
app.get('/api/:sessionId/quests', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    res.json({
      quests: dbAll(db, 'SELECT * FROM quests'),
      steps: dbAll(db, 'SELECT * FROM quest_steps ORDER BY quest_id, step_index'),
      requirements: dbAll(db, 'SELECT * FROM quest_requirements'),
      rewards: dbAll(db, 'SELECT * FROM quest_rewards_flags'),
      translations: dbAll(db, "SELECT * FROM translations WHERE id LIKE 'quest.%'"),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:sessionId/quests', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    const { quest, steps, translations } = req.body;
    dbRun(db, `INSERT OR REPLACE INTO quests (id, type, title_key, description_key, is_story) VALUES (?, ?, ?, ?, ?)`,
      [quest.id, quest.type, quest.title_key, quest.description_key, quest.is_story ? 1 : 0]);
    dbRun(db, `DELETE FROM quest_steps WHERE quest_id = ?`, [quest.id]);
    for (const s of (steps || [])) {
      dbRun(db, `INSERT INTO quest_steps (quest_id, step_index, type, target, required_count) VALUES (?, ?, ?, ?, ?)`,
        [quest.id, s.step_index, s.type, s.target, s.required_count]);
    }
    for (const t of (translations || [])) {
      dbRun(db, `INSERT OR REPLACE INTO translations (id, language_id, text) VALUES (?, ?, ?)`, [t.id, t.language_id, t.text]);
    }
    saveToFile(req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/:sessionId/quests/:questId', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    const id = req.params.questId;
    dbRun(db, 'DELETE FROM quest_steps WHERE quest_id = ?', [id]);
    dbRun(db, 'DELETE FROM quest_requirements WHERE quest_id = ?', [id]);
    dbRun(db, 'DELETE FROM quest_rewards_flags WHERE quest_id = ?', [id]);
    dbRun(db, 'DELETE FROM quests WHERE id = ?', [id]);
    saveToFile(req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- DIALOGUES ---
app.get('/api/:sessionId/dialogues', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    res.json({
      dialogues: dbAll(db, 'SELECT * FROM dialogues'),
      choices: dbAll(db, 'SELECT * FROM dialogue_choices'),
      translations: dbAll(db, "SELECT * FROM translations WHERE id LIKE 'npc.%'"),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/:sessionId/dialogues', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    const { dialogue, choices, translations } = req.body;
    dbRun(db, `INSERT OR REPLACE INTO dialogues (id, text_key) VALUES (?, ?)`, [dialogue.id, dialogue.text_key]);
    dbRun(db, `DELETE FROM dialogue_choices WHERE dialogue_id = ?`, [dialogue.id]);
    for (const c of (choices || [])) {
      dbRun(db, `INSERT INTO dialogue_choices (dialogue_id, text_key, next_dialogue_id, condition_flag, condition_value, action) VALUES (?, ?, ?, ?, ?, ?)`,
        [dialogue.id, c.text_key, c.next_dialogue_id || '', c.condition_flag || null, c.condition_value || null, c.action || null]);
    }
    for (const t of (translations || [])) {
      dbRun(db, `INSERT OR REPLACE INTO translations (id, language_id, text) VALUES (?, ?, ?)`, [t.id, t.language_id, t.text]);
    }
    saveToFile(req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/:sessionId/dialogues/:dialogueId', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    const id = req.params.dialogueId;
    dbRun(db, 'DELETE FROM dialogue_choices WHERE dialogue_id = ?', [id]);
    dbRun(db, 'DELETE FROM dialogues WHERE id = ?', [id]);
    saveToFile(req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- TRANSLATIONS ---
app.get('/api/:sessionId/translations', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    res.json({
      translations: dbAll(db, 'SELECT * FROM translations ORDER BY id, language_id'),
      languages: dbAll(db, 'SELECT * FROM languages'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/:sessionId/translations', (req, res) => {
  try {
    const db = getDb(req.params.sessionId);
    const { id, language_id, text } = req.body;
    dbRun(db, 'INSERT OR REPLACE INTO translations (id, language_id, text) VALUES (?, ?, ?)', [id, language_id, text]);
    saveToFile(req.params.sessionId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve static frontend
app.use(express.static(path.join(__dirname, '../client')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RPG Editor running on port ${PORT}`));
