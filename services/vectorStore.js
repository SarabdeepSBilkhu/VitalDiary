/**
 * Vector store service — wraps sqlite-vec for RAG log retrieval.
 * 
 * Uses a SEPARATE better-sqlite3 connection so the existing sqlite3
 * (callback-based) database.js is not disturbed.
 * 
 * Only active in SQLite mode (not PostgreSQL). In PG mode, all vector
 * operations are silently skipped (pgvector integration is a future task).
 */
const path = require('path');
const { embed, EMBEDDING_DIM } = require('./embedding');
const { dbQuery } = require('../database');

const isPg = !!(process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL);
const isTest = process.env.NODE_ENV === 'test';

let vecDb = null;

/**
 * Initialize the vector store.
 * Creates a better-sqlite3 connection and the vec_logs virtual table.
 */
function initVectorStore() {
  if (isPg) {
    console.log('[vectorStore] PostgreSQL mode — vector store skipped (pgvector is a future enhancement).');
    return;
  }

  try {
    const Database = require('better-sqlite3');
    const sqliteVec = require('sqlite-vec');

    const dbPath = isTest ? ':memory:' : path.join(__dirname, '..', 'vitaldiary.db');
    vecDb = new Database(dbPath);
    sqliteVec.load(vecDb);

    vecDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_logs USING vec0(
        log_id TEXT,
        user_id INTEGER,
        log_type TEXT,
        summary TEXT,
        embedding float[${EMBEDDING_DIM}]
      )
    `);

    console.log('[vectorStore] sqlite-vec initialized successfully.');
  } catch (err) {
    console.error('[vectorStore] Failed to initialize — RAG will be unavailable:', err.message);
    vecDb = null;
  }
}

/**
 * Build a human-readable text summary of a log entry for embedding.
 */
function buildLogText(logType, logData) {
  switch (logType) {
    case 'vitals':
      return `Vitals reading on ${logData.timestamp}: BP ${logData.systolic}/${logData.diastolic} mmHg, HR ${logData.hr} bpm, SpO2 ${logData.spo2 || '--'}%. Notes: ${logData.notes || 'none'}.`;
    case 'glucose':
      return `Blood glucose on ${logData.timestamp}: ${logData.value} mg/dL (${logData.context}). Notes: ${logData.notes || 'none'}.`;
    case 'weight':
      return `Weight measurement on ${logData.timestamp}: ${logData.value} kg. Notes: ${logData.notes || 'none'}.`;
    case 'reports':
      return `Medical report on ${logData.timestamp}: ${logData.report_type} — ${logData.title}. ${logData.notes || ''}`;
    default:
      return JSON.stringify(logData);
  }
}

/**
 * Upsert a log entry's embedding into the vector store.
 * Fire-and-forget safe — errors are caught and logged without crashing.
 */
async function upsertLogEmbedding(logId, userId, logType, logData) {
  if (!vecDb) return;

  try {
    const summaryText = buildLogText(logType, logData);
    const vector = await embed(summaryText);

    // sqlite-vec upsert: delete then insert (vec0 doesn't support ON CONFLICT)
    vecDb.prepare(`DELETE FROM vec_logs WHERE log_id = ?`).run(logId);
    vecDb.prepare(`
      INSERT INTO vec_logs(log_id, user_id, log_type, summary, embedding)
      VALUES (?, CAST(? AS INTEGER), ?, ?, ?)
    `).run(logId, userId, logType, summaryText, vector);
  } catch (err) {
    console.error(`[vectorStore] Failed to upsert embedding for ${logId}:`, err.message);
  }
}

/**
 * Delete a log entry's embedding from the vector store.
 */
function deleteLogEmbedding(logId) {
  if (!vecDb) return;
  try {
    vecDb.prepare(`DELETE FROM vec_logs WHERE log_id = ?`).run(logId);
  } catch (err) {
    console.error(`[vectorStore] Failed to delete embedding for ${logId}:`, err.message);
  }
}

/**
 * Delete all embeddings for a specific user (used when deleting account)
 */
function deleteUserEmbeddings(userId) {
  if (!vecDb) return;
  try {
    vecDb.prepare(`DELETE FROM vec_logs WHERE user_id = CAST(? AS INTEGER)`).run(userId);
  } catch (err) {
    console.error(`[vectorStore] Failed to delete embeddings for user ${userId}:`, err.message);
  }
}

/**
 * Search for the top-k most semantically similar log entries for a given user.
 * Returns an array of { log_id, log_type, summary, distance } objects.
 */
async function searchSimilarLogs(userId, queryText, k = 5) {
  if (!vecDb) return [];

  try {
    const queryVector = await embed(queryText);
    const rows = vecDb.prepare(`
      SELECT log_id, log_type, summary, distance
      FROM vec_logs
      WHERE user_id = CAST(? AS INTEGER)
      ORDER BY vec_distance_cosine(embedding, ?) ASC
      LIMIT ?
    `).all(userId, queryVector, k);

    return rows;
  } catch (err) {
    console.error('[vectorStore] Search failed:', err.message);
    return [];
  }
}

module.exports = { initVectorStore, upsertLogEmbedding, deleteLogEmbedding, deleteUserEmbeddings, searchSimilarLogs, buildLogText };
