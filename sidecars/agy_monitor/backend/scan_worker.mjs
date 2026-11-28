import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { resolvePaths } from './paths.mjs';

const RETRY_ERRORS = new Set(['EBUSY', 'EACCES', 'EPERM']);
const RETRY_DELAYS_MS = [25, 60, 140, 300];
const CHUNK_SIZE = 512 * 1024;
const MAX_LINE_BUFFER = 16 * 1024 * 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn) {
  let lastErr;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!err || !RETRY_ERRORS.has(err.code) || i === RETRY_DELAYS_MS.length) {
        throw err;
      }
      await sleep(RETRY_DELAYS_MS[i]);
    }
  }
  throw lastErr;
}

function toNonNegInt(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function parseTimestampMs(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? Math.trunc(raw) : Math.trunc(raw * 1000);
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

export function resolveDefaultBrainDir() {
  if (process.env.AGY_MONITOR_BRAIN_DIR) {
    return path.resolve(process.env.AGY_MONITOR_BRAIN_DIR);
  }
  return resolvePaths().brainDir;
}

export function resolveDefaultCacheDbPath() {
  if (process.env.AGY_MONITOR_CACHE_DB) {
    return path.resolve(process.env.AGY_MONITOR_CACHE_DB);
  }
  return resolvePaths().telemetryCacheDb;
}

export function resolveDefaultConversationsDir(brainDir = null) {
  if (process.env.AGY_MONITOR_CONVERSATIONS_DIR) {
    return path.resolve(process.env.AGY_MONITOR_CONVERSATIONS_DIR);
  }
  if (brainDir) {
    return path.resolve(brainDir, '..', 'conversations');
  }
  return resolvePaths().conversationsDir;
}

function readProtoVarint(buf, offset) {
  let val = 0n;
  let shift = 0n;
  let i = offset;
  const maxEnd = Math.min(buf.length, offset + 10);
  while (i < maxEnd) {
    const b = buf[i];
    i += 1;
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: val, next: i, ok: true };
    }
    shift += 7n;
  }
  return { value: 0n, next: buf.length, ok: false };
}

function iterProtoFields(buf, onField) {
  let i = 0;
  while (i < buf.length) {
    const tagRes = readProtoVarint(buf, i);
    if (!tagRes.ok) break;
    i = tagRes.next;
    const field = Number(tagRes.value >> 3n);
    const wire = Number(tagRes.value & 7n);
    if (field <= 0) break;
    if (wire === 0) {
      const vRes = readProtoVarint(buf, i);
      if (!vRes.ok) break;
      i = vRes.next;
      onField(field, wire, vRes.value);
    } else if (wire === 1) {
      if (i + 8 > buf.length) break;
      onField(field, wire, buf.subarray(i, i + 8));
      i += 8;
    } else if (wire === 2) {
      const lenRes = readProtoVarint(buf, i);
      if (!lenRes.ok) break;
      const len = Number(lenRes.value);
      i = lenRes.next;
      if (!Number.isSafeInteger(len) || len < 0 || i + len > buf.length) break;
      onField(field, wire, buf.subarray(i, i + len));
      i += len;
    } else if (wire === 5) {
      if (i + 4 > buf.length) break;
      onField(field, wire, buf.subarray(i, i + 4));
      i += 4;
    } else {
      break;
    }
  }
}

function decodeProtoTimestampMs(buf) {
  if (!buf || buf.length === 0) return null;
  let sec = 0n;
  let nanos = 0n;
  iterProtoFields(buf, (f, w, v) => {
    if (w !== 0) return;
    if (f === 1) sec = v;
    else if (f === 2) nanos = v;
  });
  if (sec <= 0n || sec > 4_102_444_800n) return null;
  const nanoNum = nanos >= 0n && nanos < 1_000_000_000n ? Number(nanos) : 0;
  return Number(sec) * 1000 + nanoNum / 1e6;
}

/**
 * Parses Antigravity conversation SQLite `steps.metadata` protobuf blob for exact
 * request timing: field 1 = created_at, field 6 = first_token_at (status 8),
 * field 7 = completed_at (status 3), with field 26 status_transitions fallback.
 */
export function parseStepMetadataTiming(rawBuf) {
  if (!rawBuf) return null;
  const buf = Buffer.isBuffer(rawBuf)
    ? rawBuf
    : rawBuf instanceof Uint8Array
      ? Buffer.from(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength)
      : null;
  if (!buf || buf.length === 0) return null;

  let createdAtMs = null;
  let firstTokenAtMs = null;
  let completedAtMs = null;
  let transFirstTokenMs = null;
  let transCompletedMs = null;

  try {
    iterProtoFields(buf, (f, w, v) => {
      if (w !== 2) return;
      if (f === 1 && createdAtMs === null) {
        createdAtMs = decodeProtoTimestampMs(v);
      } else if (f === 6 && firstTokenAtMs === null) {
        firstTokenAtMs = decodeProtoTimestampMs(v);
      } else if (f === 7 && completedAtMs === null) {
        completedAtMs = decodeProtoTimestampMs(v);
      } else if (f === 26) {
        iterProtoFields(v, (tf, tw, tv) => {
          if (tf !== 1 || tw !== 2) return;
          let statusCode = -1;
          let ts = null;
          iterProtoFields(tv, (ef, ew, ev) => {
            if (ef === 1 && ew === 0) statusCode = Number(ev);
            else if (ef === 2 && ew === 2) ts = decodeProtoTimestampMs(ev);
          });
          if (ts !== null) {
            if (statusCode === 8 && transFirstTokenMs === null) transFirstTokenMs = ts;
            else if (statusCode === 3) transCompletedMs = ts;
          }
        });
      }
    });
  } catch {
    return null;
  }

  if (firstTokenAtMs === null) firstTokenAtMs = transFirstTokenMs;
  if (completedAtMs === null) completedAtMs = transCompletedMs;
  if (createdAtMs === null) return null;

  let ttftMs = null;
  if (firstTokenAtMs !== null && firstTokenAtMs > createdAtMs) {
    const diff = Math.round(firstTokenAtMs - createdAtMs);
    if (diff >= 1 && diff <= 600_000) {
      ttftMs = diff;
    }
  }

  let durationMs = null;
  if (completedAtMs !== null && completedAtMs > createdAtMs) {
    const diff = Math.round(completedAtMs - createdAtMs);
    if (diff >= 1 && diff <= 1_800_000) {
      durationMs = diff;
    }
  }

  if (ttftMs !== null && durationMs !== null && ttftMs > durationMs) {
    ttftMs = durationMs;
  }

  if (ttftMs === null && durationMs === null) return null;
  return {
    createdAtMs: Math.round(createdAtMs),
    firstTokenAtMs: firstTokenAtMs !== null ? Math.round(firstTokenAtMs) : null,
    completedAtMs: completedAtMs !== null ? Math.round(completedAtMs) : null,
    ttftMs,
    durationMs,
  };
}

function decodeProtoUtf8(buf, maxLen = 200) {
  if (!buf || buf.length === 0 || buf.length > maxLen) return '';
  const text = buf.toString('utf8').trim();
  if (!text) return '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return '';
  }
  return text;
}

function isAntigravityRoutingLabel(model) {
  return String(model || '').trim().toLowerCase() === 'gemini-default';
}

/**
 * Extracts generation linkage keys from Antigravity `steps.metadata` protobuf:
 * - field #20 -> field #3: 0-based `gen_metadata.idx`
 * - field #9  -> field #11: `responseId` matching `gen_metadata.#1.#4.#11`
 */
export function parseStepMetadataGenLink(rawBuf) {
  if (!rawBuf) return { genIdx: null, responseId: null };
  const buf = Buffer.isBuffer(rawBuf)
    ? rawBuf
    : rawBuf instanceof Uint8Array
      ? Buffer.from(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength)
      : null;
  if (!buf || buf.length === 0) return { genIdx: null, responseId: null };

  let genIdx = null;
  let responseId = null;
  try {
    iterProtoFields(buf, (f, w, v) => {
      if (w !== 2) return;
      if (f === 20 && genIdx === null) {
        iterProtoFields(v, (mf, mw, mv) => {
          if (mf === 3 && mw === 0 && genIdx === null) {
            const n = Number(mv);
            if (Number.isSafeInteger(n) && n >= 0) genIdx = n;
          }
        });
      } else if (f === 9 && responseId === null) {
        iterProtoFields(v, (uf, uw, uv) => {
          if (uf === 11 && uw === 2 && responseId === null) {
            const id = decodeProtoUtf8(uv, 128);
            if (id) responseId = id;
          }
        });
      }
    });
  } catch {
    return { genIdx: null, responseId: null };
  }
  return { genIdx, responseId };
}

/**
 * Parses Antigravity `gen_metadata.data` (`GeneratorMetadata`) protobuf:
 * - field #2: linked `steps.idx` (single varint or packed varints)
 * - field #1 (`chatModel`):
 *   - field #19: `responseModel` (authoritative upstream returned model ID, e.g. `gemini-3.8-flash-n`)
 *   - field #21: `displayLabel` (requested UI model label, e.g. `Gemini 3.8 Flash (High)`)
 *   - field #4 -> field #11: `responseId`
 *   - field #20: key/value map (`model_enum`, etc.)
 */
export function parseGenMetadataRecord(rawBuf) {
  if (!rawBuf) return null;
  const buf = Buffer.isBuffer(rawBuf)
    ? rawBuf
    : rawBuf instanceof Uint8Array
      ? Buffer.from(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength)
      : null;
  if (!buf || buf.length === 0) return null;

  const stepIndices = [];
  let responseModel = null;
  let displayLabel = null;
  let responseId = null;
  let modelEnum = null;
  let hasChatModel = false;

  try {
    iterProtoFields(buf, (f, w, v) => {
      if (f === 2 && w === 0) {
        const idx = Number(v);
        if (Number.isSafeInteger(idx) && idx >= 0) stepIndices.push(idx);
      } else if (f === 2 && w === 2) {
        let pos = 0;
        while (pos < v.length) {
          const r = readProtoVarint(v, pos);
          if (!r.ok) break;
          const idx = Number(r.value);
          if (Number.isSafeInteger(idx) && idx >= 0) stepIndices.push(idx);
          pos = r.next;
        }
      } else if (f === 1 && w === 2 && !hasChatModel) {
        hasChatModel = true;
        iterProtoFields(v, (cf, cw, cv) => {
          if (cf === 19 && cw === 2 && responseModel === null) {
            const m = decodeProtoUtf8(cv, 160);
            if (m) responseModel = m;
          } else if (cf === 21 && cw === 2 && displayLabel === null) {
            const lbl = decodeProtoUtf8(cv, 160);
            if (lbl) displayLabel = lbl;
          } else if (cf === 4 && cw === 2 && responseId === null) {
            iterProtoFields(cv, (uf, uw, uv) => {
              if (uf === 11 && uw === 2 && responseId === null) {
                const id = decodeProtoUtf8(uv, 128);
                if (id) responseId = id;
              }
            });
          } else if (cf === 20 && cw === 2 && modelEnum === null) {
            let key = '';
            let val = '';
            iterProtoFields(cv, (kf, kw, kv) => {
              if (kf === 1 && kw === 2) key = decodeProtoUtf8(kv, 64);
              else if (kf === 2 && kw === 2) val = decodeProtoUtf8(kv, 128);
            });
            if (key === 'model_enum' && val) modelEnum = val;
          }
        });
      }
    });
  } catch {
    return null;
  }

  if (!hasChatModel && stepIndices.length === 0) return null;
  return {
    stepIndices,
    responseModel,
    displayLabel,
    responseId,
    modelEnum,
  };
}

function coarseModelFamilyKey(modelId) {
  const s = String(modelId || '').toLowerCase();
  if (s.includes('hydrogen')) return 'hydrogen';
  if (s.includes('neon')) return 'neon';
  if (s.includes('argon')) return 'argon';
  if (s.includes('flash')) return 'flash';
  if (s.includes('opus')) return 'opus';
  if (s.includes('sonnet')) return 'sonnet';
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('carbon')) return 'carbon';
  if (s.includes('gpt')) return 'gpt';
  if (s.includes('pro')) return 'pro';
  return s;
}

/**
 * Builds same-conversation `#21 displayLabel -> #19 responseModel` recovery map
 * (mirroring tokscale's SessionModels recovery for continuation turns that omit `#19`).
 */
function buildSessionModelsResolver(records) {
  const byDisplay = new Map();
  const distinctModels = new Set();
  const unresolvedLabels = new Set();

  for (const rec of records) {
    if (!rec) continue;
    const label = rec.displayLabel || '';
    const model = rec.responseModel && !isAntigravityRoutingLabel(rec.responseModel) ? rec.responseModel : '';
    if (!model) {
      if (label) unresolvedLabels.add(label);
      continue;
    }
    distinctModels.add(model);
    if (label) {
      if (!byDisplay.has(label)) {
        byDisplay.set(label, model);
      } else {
        const prev = byDisplay.get(label);
        if (prev !== null && prev !== model) {
          if (coarseModelFamilyKey(prev) === coarseModelFamilyKey(model)) {
            // Keep the latest concrete variant within the same model family (e.g. flash-n / flash-control)
            byDisplay.set(label, model);
          } else {
            // Genuinely conflicting families for the same display label -> mark ambiguous
            byDisplay.set(label, null);
          }
        }
      }
    }
  }

  const resolvedByDisplay = new Map();
  for (const [label, model] of byDisplay.entries()) {
    if (model) resolvedByDisplay.set(label, model);
  }

  let everyLabelIdentified = true;
  for (const label of unresolvedLabels) {
    if (!resolvedByDisplay.has(label)) {
      everyLabelIdentified = false;
      break;
    }
  }
  const soleModel =
    distinctModels.size === 1 && everyLabelIdentified ? [...distinctModels][0] : null;

  return {
    recover(rec) {
      if (!rec) return null;
      if (rec.responseModel && !isAntigravityRoutingLabel(rec.responseModel)) {
        return rec.responseModel;
      }
      if (rec.displayLabel) {
        return resolvedByDisplay.get(rec.displayLabel) || null;
      }
      return soleModel;
    },
  };
}

/**
 * Reads exact per-step timing (`steps.metadata`) AND authoritative upstream `responseModel`
 * (`gen_metadata.#1.#19`) + requested UI `displayLabel` (`gen_metadata.#1.#21`) from
 * Antigravity's per-conversation SQLite database (`conversations/<convId>.db`) in read-only mode.
 */
export function readConvDbStepTelemetry(convDbPath, stepIndices) {
  const result = new Map();
  if (!convDbPath || !Array.isArray(stepIndices) || stepIndices.length === 0) {
    return result;
  }
  const uniqueIds = [...new Set(stepIndices.filter((n) => Number.isInteger(n) && n >= 0))];
  if (uniqueIds.length === 0) return result;
  if (!fs.existsSync(convDbPath)) return result;

  let convDb = null;
  try {
    convDb = new DatabaseSync(convDbPath, { readOnly: true, timeout: 1000 });
    try {
      convDb.exec('PRAGMA cache_size = -1000; PRAGMA temp_store = FILE;');
    } catch {
      // Ignore pragma restriction on read-only DB
    }
    const stepLinks = new Map();
    const wantedGenIds = new Set();
    const CHUNK = 200;

    for (let start = 0; start < uniqueIds.length; start += CHUNK) {
      const slice = uniqueIds.slice(start, start + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const rows = convDb
        .prepare(
          `SELECT idx, metadata FROM steps WHERE idx IN (${placeholders}) AND metadata IS NOT NULL`
        )
        .iterate(...slice);
      for (const row of rows) {
        const idx = Number(row.idx);
        if (!Number.isInteger(idx)) continue;
        const timing = parseStepMetadataTiming(row.metadata);
        const link = parseStepMetadataGenLink(row.metadata);
        stepLinks.set(idx, link);
        if (link.genIdx !== null) wantedGenIds.add(link.genIdx);
        result.set(idx, {
          timing,
          upstreamModel: null,
          requestedModelLabel: null,
        });
      }
    }

    const hasGenTable = Boolean(
      convDb
        .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gen_metadata'`)
        .get()
    );

    if (hasGenTable) {
      const genByIdx = new Map();
      const wantedGenList = [...wantedGenIds];
      for (let start = 0; start < wantedGenList.length; start += CHUNK) {
        const slice = wantedGenList.slice(start, start + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        const genRows = convDb
          .prepare(
            `SELECT idx, data FROM gen_metadata WHERE idx IN (${placeholders}) AND data IS NOT NULL`
          )
          .iterate(...slice);
        for (const gr of genRows) {
          const gIdx = Number(gr.idx);
          const parsed = parseGenMetadataRecord(gr.data);
          if (parsed && Number.isInteger(gIdx)) {
            genByIdx.set(gIdx, parsed);
          }
        }
      }

      // First pass: resolve directly linked gen_metadata rows (O(k) fast path)
      let needsFullGenScan = false;
      for (const idx of uniqueIds) {
        const link = stepLinks.get(idx);
        const gen = link && link.genIdx !== null ? genByIdx.get(link.genIdx) : null;
        if (!gen) {
          needsFullGenScan = true;
          continue;
        }
        const entry = result.get(idx) || { timing: null, upstreamModel: null, requestedModelLabel: null };
        if (gen.displayLabel) entry.requestedModelLabel = gen.displayLabel;
        if (gen.responseModel && !isAntigravityRoutingLabel(gen.responseModel)) {
          entry.upstreamModel = gen.responseModel;
        } else {
          needsFullGenScan = true;
        }
        result.set(idx, entry);
      }

      // Fallback / SessionModels recovery pass only when a step lacked direct genIdx or omitted #19
      // Stream rows via .iterate() so large gen_metadata BLOBs are never materialized in full.
      if (needsFullGenScan) {
        const allGenRows = convDb
          .prepare(
            `SELECT idx, data FROM gen_metadata WHERE data IS NOT NULL AND length(data) < 262144 ORDER BY idx ASC`
          )
          .iterate();
        const allParsed = [];
        const byStepIdx = new Map();
        const byResponseId = new Map();

        for (const gr of allGenRows) {
          const gIdx = Number(gr.idx);
          const parsed = genByIdx.get(gIdx) || parseGenMetadataRecord(gr.data);
          if (!parsed) continue;
          if (Number.isInteger(gIdx)) genByIdx.set(gIdx, parsed);
          allParsed.push(parsed);
          for (const sIdx of parsed.stepIndices) {
            byStepIdx.set(sIdx, parsed);
          }
          if (parsed.responseId) {
            byResponseId.set(parsed.responseId, parsed);
          }
        }

        const sessionModels = buildSessionModelsResolver(allParsed);
        for (const idx of uniqueIds) {
          const entry = result.get(idx) || { timing: null, upstreamModel: null, requestedModelLabel: null };
          if (entry.upstreamModel) continue;
          const link = stepLinks.get(idx);
          const gen =
            (link && link.genIdx !== null ? genByIdx.get(link.genIdx) : null) ||
            (link && link.responseId ? byResponseId.get(link.responseId) : null) ||
            byStepIdx.get(idx) ||
            null;
          if (!gen) continue;
          if (!entry.requestedModelLabel && gen.displayLabel) {
            entry.requestedModelLabel = gen.displayLabel;
          }
          const recovered = sessionModels.recover(gen);
          if (recovered) {
            entry.upstreamModel = recovered;
          }
          result.set(idx, entry);
        }
      }
    }
  } catch {
    // Non-fatal: gracefully fall back to transcript fields if DB is busy/missing/legacy
  } finally {
    if (convDb) {
      try {
        convDb.close();
      } catch {
        // Ignore close error
      }
    }
  }
  return result;
}

/**
 * Reads exact per-step TTFT and total duration from Antigravity's per-conversation
 * SQLite database (`conversations/<convId>.db`) in strictly read-only mode.
 */
export function readConvDbStepTimings(convDbPath, stepIndices) {
  const telemetryMap = readConvDbStepTelemetry(convDbPath, stepIndices);
  const timings = new Map();
  for (const [idx, info] of telemetryMap.entries()) {
    if (info?.timing) timings.set(idx, info.timing);
  }
  return timings;
}

/**
 * Ensures the SQLite telemetry cache schema exists and configures WAL concurrency.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function ensureCacheSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    PRAGMA cache_size = -2000;
    PRAGMA temp_store = FILE;

    CREATE TABLE IF NOT EXISTS session_watermarks (
      conv_id TEXT PRIMARY KEY,
      transcript_path TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      byte_offset INTEGER NOT NULL,
      last_scan_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_ledger (
      conv_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_type TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      tool_calls_count INTEGER NOT NULL DEFAULT 0,
      content_chars INTEGER NOT NULL DEFAULT 0,
      thinking_chars INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      status TEXT,
      error_text TEXT,
      ttft_ms INTEGER,
      upstream_model TEXT,
      requested_model_label TEXT,
      PRIMARY KEY (conv_id, step_index)
    );

    CREATE INDEX IF NOT EXISTS idx_step_ledger_created
      ON step_ledger(created_at_ms);
    CREATE INDEX IF NOT EXISTS idx_step_ledger_conv_time
      ON step_ledger(conv_id, created_at_ms);

    CREATE TABLE IF NOT EXISTS conv_latest_metrics (
      conv_id TEXT PRIMARY KEY,
      latest_model TEXT,
      latest_upstream_model TEXT,
      latest_requested_model TEXT,
      latest_requested_label TEXT,
      latest_model_at_ms INTEGER NOT NULL DEFAULT 0,
      latest_context_tokens INTEGER NOT NULL DEFAULT 0,
      latest_uncached_input INTEGER NOT NULL DEFAULT 0,
      latest_cache_read INTEGER NOT NULL DEFAULT 0,
      latest_output_tokens INTEGER NOT NULL DEFAULT 0,
      user_chars_total INTEGER NOT NULL DEFAULT 0,
      tool_chars_total INTEGER NOT NULL DEFAULT 0,
      latest_speed_tok_s REAL,
      avg_speed_tok_s REAL,
      speed_source TEXT,
      speed_at_ms INTEGER NOT NULL DEFAULT 0,
      last_step_at_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scan_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Idempotent migration for pre-existing telemetry_cache.db files
  const existingCols = new Set(
    db.prepare(`PRAGMA table_info(step_ledger)`).all().map((c) => String(c.name || '').toLowerCase())
  );
  if (!existingCols.has('status')) {
    db.exec(`ALTER TABLE step_ledger ADD COLUMN status TEXT`);
  }
  if (!existingCols.has('error_text')) {
    db.exec(`ALTER TABLE step_ledger ADD COLUMN error_text TEXT`);
  }
  if (!existingCols.has('ttft_ms')) {
    db.exec(`ALTER TABLE step_ledger ADD COLUMN ttft_ms INTEGER`);
  }
  if (!existingCols.has('upstream_model')) {
    db.exec(`ALTER TABLE step_ledger ADD COLUMN upstream_model TEXT`);
  }
  if (!existingCols.has('requested_model_label')) {
    db.exec(`ALTER TABLE step_ledger ADD COLUMN requested_model_label TEXT`);
  }

  const latestCols = new Set(
    db.prepare(`PRAGMA table_info(conv_latest_metrics)`).all().map((c) => String(c.name || '').toLowerCase())
  );
  if (!latestCols.has('latest_upstream_model')) {
    db.exec(`ALTER TABLE conv_latest_metrics ADD COLUMN latest_upstream_model TEXT`);
  }
  if (!latestCols.has('latest_requested_model')) {
    db.exec(`ALTER TABLE conv_latest_metrics ADD COLUMN latest_requested_model TEXT`);
  }
  if (!latestCols.has('latest_requested_label')) {
    db.exec(`ALTER TABLE conv_latest_metrics ADD COLUMN latest_requested_label TEXT`);
  }
}

function openCacheDb(cacheDbPath) {
  fs.mkdirSync(path.dirname(cacheDbPath), { recursive: true });
  const db = new DatabaseSync(cacheDbPath, { timeout: 3000 });
  ensureCacheSchema(db);
  return db;
}

const COLD_CONV_AGE_MS = 10 * 60 * 1000;
const COLD_RESCAN_MODULO = 2;

async function discoverTranscripts(brainDir, { coldCache = null, scanTick = 0, fullSweep = true } = {}) {
  let entries;
  try {
    entries = await fsp.readdir(brainDir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }

  const nowMs = Date.now();
  const seenIds = coldCache ? new Set() : null;
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const convId = entry.name;
    if (convId.startsWith('.')) continue;
    if (seenIds) seenIds.add(convId);

    const cached = coldCache ? coldCache.get(convId) : null;
    if (
      !fullSweep &&
      cached &&
      nowMs - cached.mtimeMs > COLD_CONV_AGE_MS &&
      scanTick % COLD_RESCAN_MODULO !== 0
    ) {
      if (cached.exists) {
        results.push({
          convId,
          transcriptPath: cached.transcriptPath,
          mtimeMs: cached.mtimeMs,
          sizeBytes: cached.sizeBytes,
        });
      }
      continue;
    }

    const transcriptPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      const st = await withRetry(() => fsp.stat(transcriptPath));
      if (st.isFile()) {
        const mtimeMs = Math.trunc(st.mtimeMs);
        const sizeBytes = st.size;
        if (coldCache) {
          coldCache.set(convId, { exists: true, transcriptPath, mtimeMs, sizeBytes });
        }
        results.push({
          convId,
          transcriptPath,
          mtimeMs,
          sizeBytes,
        });
      } else if (coldCache) {
        coldCache.set(convId, { exists: false, transcriptPath, mtimeMs: 0, sizeBytes: 0 });
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        if (coldCache) {
          coldCache.set(convId, { exists: false, transcriptPath, mtimeMs: 0, sizeBytes: 0 });
        }
        continue;
      }
      if (err && RETRY_ERRORS.has(err.code)) continue;
      throw err;
    }
  }
  if (coldCache && seenIds) {
    for (const key of coldCache.keys()) {
      if (!seenIds.has(key)) coldCache.delete(key);
    }
  }
  return results;
}

function parseLineToRow(convId, lineText, fallbackStepIndex) {
  const trimmed = lineText.trim();
  if (!trimmed) return null;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const stepIndex = Number.isInteger(obj.step_index) && obj.step_index >= 0
    ? obj.step_index
    : fallbackStepIndex;
  const stepType = typeof obj.type === 'string' && obj.type ? obj.type : 'GENERIC';
  const createdAtMs = parseTimestampMs(obj.created_at);
  const rawStatus = typeof obj.status === 'string' && obj.status.trim() ? obj.status.trim().toUpperCase() : null;
  const status = stepType === 'ERROR_MESSAGE' ? 'ERROR' : rawStatus;
  const errorText =
    typeof obj.error === 'string' && obj.error.trim()
      ? obj.error.trim().slice(0, 240)
      : stepType === 'ERROR_MESSAGE' && typeof obj.content === 'string' && obj.content.trim()
        ? obj.content.trim().slice(0, 240)
        : null;
  let model = typeof obj.model === 'string' && obj.model.trim() ? obj.model.trim() : null;
  if (!model && stepType === 'ERROR_MESSAGE' && errorText) {
    const modelMatch = errorText.match(/\bfor model\s+([a-zA-Z0-9._-]+)/i);
    if (modelMatch && modelMatch[1]) {
      model = modelMatch[1];
    }
  }
  const inputTokens = toNonNegInt(obj.input_tokens);
  const cacheReadTokens = toNonNegInt(obj.cache_read_tokens);
  const outputTokens = toNonNegInt(obj.output_tokens);
  const toolCallsCount = Array.isArray(obj.tool_calls) ? obj.tool_calls.length : 0;
  const contentChars = typeof obj.content === 'string' ? obj.content.length : 0;
  const thinkingChars = typeof obj.thinking === 'string' ? obj.thinking.length : 0;
  const rawTtft =
    obj.ttft_ms ?? obj.first_token_ms ?? obj.first_token_latency_ms ?? obj.time_to_first_token_ms;
  const ttftMs =
    typeof rawTtft === 'number' && Number.isFinite(rawTtft) && rawTtft > 0
      ? Math.trunc(rawTtft)
      : null;

  return {
    conv_id: convId,
    step_index: stepIndex,
    step_type: stepType,
    created_at_ms: createdAtMs,
    model,
    input_tokens: inputTokens,
    cache_read_tokens: cacheReadTokens,
    output_tokens: outputTokens,
    tool_calls_count: toolCallsCount,
    content_chars: contentChars,
    thinking_chars: thinkingChars,
    status,
    error_text: errorText,
    ttft_ms: ttftMs,
  };
}

/**
 * Reads complete JSONL lines from startOffset up to file size without splitting UTF-8 or half-written lines.
 */
async function readDeltaLines(
  convId,
  filePath,
  startOffset,
  sizeBytes,
  mtimeMs,
  flushPartial,
  initialFallbackIndex = 0,
) {
  const rows = [];
  let cursor = startOffset;
  let leftover = Buffer.alloc(0);
  let fallbackIndex = Math.max(0, Number(initialFallbackIndex) || 0);

  const fh = await withRetry(() => fsp.open(filePath, 'r'));
  try {
    while (cursor < sizeBytes) {
      const toRead = Math.min(CHUNK_SIZE, sizeBytes - cursor);
      const chunk = Buffer.allocUnsafe(toRead);
      const { bytesRead } = await withRetry(() => fh.read(chunk, 0, toRead, cursor));
      if (bytesRead <= 0) break;
      cursor += bytesRead;

      const slice = bytesRead === toRead ? chunk : chunk.subarray(0, bytesRead);
      const combined = leftover.length > 0 ? Buffer.concat([leftover, slice]) : slice;

      const lastNl = combined.lastIndexOf(0x0a);
      if (lastNl !== -1) {
        const completeBlock = combined.subarray(0, lastNl).toString('utf8');
        const lines = completeBlock.split(/\r?\n/);
        for (const line of lines) {
          const parsed = parseLineToRow(convId, line, fallbackIndex++);
          if (parsed) rows.push(parsed);
        }
        leftover = Buffer.from(combined.subarray(lastNl + 1));
      } else {
        if (combined.length > MAX_LINE_BUFFER) {
          // Oversized malformed line guard: discard unparseable giant buffer and advance cleanly.
          leftover = Buffer.alloc(0);
        } else {
          leftover = Buffer.from(combined);
        }
      }
    }
  } finally {
    await fh.close().catch(() => {});
  }

  let consumedBytes = cursor - leftover.length;

  // Handle a final line lacking trailing '\n' only if it is complete JSON and safe to consume.
  if (leftover.length > 0) {
    const trailingText = leftover.toString('utf8').trim();
    const isQuiet = flushPartial || (Date.now() - mtimeMs >= 500);
    if (trailingText && isQuiet && trailingText.endsWith('}')) {
      try {
        JSON.parse(trailingText);
        const parsed = parseLineToRow(convId, trailingText, fallbackIndex++);
        if (parsed) rows.push(parsed);
        consumedBytes = cursor;
      } catch {
        // Incomplete JSON write in progress: hold byte_offset at last newline.
      }
    }
  }

  return {
    rows,
    nextOffset: consumedBytes,
  };
}

function recomputeConvMetrics(db, convId, { conversationsDir = null, forceRefreshConvDb = false } = {}) {
  const rows = db
    .prepare(
      `SELECT step_index, step_type, created_at_ms, model, upstream_model, requested_model_label,
              input_tokens, cache_read_tokens, output_tokens, tool_calls_count, content_chars,
              duration_ms, ttft_ms
       FROM step_ledger
       WHERE conv_id = ?
       ORDER BY step_index ASC`
    )
    .all(convId);

  if (!rows.length) {
    db.prepare(`DELETE FROM conv_latest_metrics WHERE conv_id = ?`).run(convId);
    return;
  }

  let convDbStepTelemetry = null;
  if (conversationsDir) {
    const missingConvDbIndices = [];
    const recentPlannerIndices = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (r.step_type !== 'PLANNER_RESPONSE') continue;
      recentPlannerIndices.push(r.step_index);
      const hasStaleFamilyMismatch = Boolean(
        r.model &&
          r.upstream_model &&
          coarseModelFamilyKey(r.model) !== coarseModelFamilyKey(r.upstream_model),
      );
      if (
        forceRefreshConvDb ||
        hasStaleFamilyMismatch ||
        r.ttft_ms == null ||
        r.duration_ms == null ||
        r.upstream_model == null
      ) {
        missingConvDbIndices.push(r.step_index);
      }
    }
    // Always verify the tail 4 PLANNER_RESPONSE steps against convDb so in-place rewrites never lag
    for (const tailIdx of recentPlannerIndices.slice(-4)) {
      missingConvDbIndices.push(tailIdx);
    }
    if (missingConvDbIndices.length > 0) {
      const convDbPath = path.join(conversationsDir, `${convId}.db`);
      const map = readConvDbStepTelemetry(convDbPath, missingConvDbIndices);
      if (map.size > 0) {
        convDbStepTelemetry = map;
      }
    }
  }

  let latestModel = null;
  let latestUpstreamModel = null;
  let latestRequestedModel = null;
  let latestRequestedLabel = null;
  let latestModelAtMs = 0;
  let latestContextTokens = 0;
  let latestUncachedInput = 0;
  let latestCacheRead = 0;
  let latestOutputTokens = 0;
  let userCharsTotal = 0;
  let toolCharsTotal = 0;
  let latestSpeedTokS = null;
  let speedSource = null;
  let speedAtMs = 0;
  let lastStepAtMs = 0;

  let speedOutSum = 0;
  let speedSecSum = 0;
  const updateDurationStmt = db.prepare(
    `UPDATE step_ledger SET duration_ms = ? WHERE conv_id = ? AND step_index = ?`
  );
  const updateConvDbStepStmt = db.prepare(
    `UPDATE step_ledger
     SET ttft_ms = COALESCE(?, ttft_ms),
         duration_ms = COALESCE(?, duration_ms),
         upstream_model = COALESCE(?, upstream_model),
         requested_model_label = COALESCE(?, requested_model_label)
     WHERE conv_id = ? AND step_index = ?`
  );

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.created_at_ms > lastStepAtMs) {
      lastStepAtMs = row.created_at_ms;
    }

    if (row.step_type === 'CHECKPOINT') {
      // CHECKPOINT resets current conversation context segment breakdown, NEVER deletes step_ledger burn history.
      userCharsTotal = 0;
      toolCharsTotal = 0;
      const checkpointIn = row.input_tokens + row.cache_read_tokens;
      // Real Antigravity CHECKPOINT logs the summarizer call itself (input+cache = pre-compaction full context,
      // output = compacted summary). Estimate post-compaction occupancy from summary + system base instead of spiking to 100%.
      const looksLikeSummarizerCall =
        latestContextTokens > 0 &&
        checkpointIn >= latestContextTokens * 0.85 &&
        row.output_tokens > 0 &&
        row.output_tokens < checkpointIn * 0.5;
      latestUncachedInput = row.input_tokens;
      latestCacheRead = row.cache_read_tokens;
      latestOutputTokens = row.output_tokens;
      latestContextTokens = looksLikeSummarizerCall
        ? Math.min(checkpointIn, row.output_tokens + 12800)
        : checkpointIn;
      continue;
    }

    if (row.step_type === 'USER_INPUT') {
      userCharsTotal += row.content_chars;
    } else if (row.step_type === 'GENERIC' || row.step_type === 'ERROR_MESSAGE') {
      toolCharsTotal += row.content_chars;
      if (row.model && !latestModel) {
        latestModel = row.model;
        latestModelAtMs = row.created_at_ms;
      }
    }

    if (row.step_type === 'PLANNER_RESPONSE') {
      const stepTotal = row.input_tokens + row.cache_read_tokens + row.output_tokens;
      if (stepTotal > 0) {
        latestUncachedInput = row.input_tokens;
        latestCacheRead = row.cache_read_tokens;
        latestOutputTokens = row.output_tokens;
        latestContextTokens = stepTotal;
      }
      if (row.tool_calls_count > 0) {
        toolCharsTotal += row.tool_calls_count * 120;
      }

      const dbStepInfo = convDbStepTelemetry ? convDbStepTelemetry.get(row.step_index) : null;
      const dbTiming = dbStepInfo?.timing ?? null;
      const dbUpstreamModel = dbStepInfo?.upstreamModel ?? null;
      const dbRequestedLabel = dbStepInfo?.requestedModelLabel ?? null;
      if (
        (dbTiming && (dbTiming.ttftMs != null || dbTiming.durationMs != null)) ||
        dbUpstreamModel != null ||
        dbRequestedLabel != null
      ) {
        updateConvDbStepStmt.run(
          dbTiming?.ttftMs ?? null,
          dbTiming?.durationMs ?? null,
          dbUpstreamModel,
          dbRequestedLabel,
          convId,
          row.step_index
        );
        if (dbTiming?.ttftMs != null) row.ttft_ms = dbTiming.ttftMs;
        if (dbTiming?.durationMs != null) row.duration_ms = dbTiming.durationMs;
        if (dbUpstreamModel != null) row.upstream_model = dbUpstreamModel;
        if (dbRequestedLabel != null) row.requested_model_label = dbRequestedLabel;
      }

      if ((row.model || row.upstream_model) && row.created_at_ms >= latestModelAtMs) {
        if (row.model) {
          latestModel = row.model;
        }
        latestModelAtMs = row.created_at_ms;
        if (row.upstream_model) {
          latestUpstreamModel = row.upstream_model;
          latestRequestedModel = row.model || row.requested_model_label || null;
          latestRequestedLabel = row.requested_model_label || null;
        } else {
          // Newer PLANNER_RESPONSE without conv DB gen_metadata: do not pair stale upstream model with a new turn
          latestUpstreamModel = null;
          latestRequestedModel = null;
          latestRequestedLabel = null;
        }
      }

      const hasExactDuration =
        (dbTiming && dbTiming.durationMs != null) ||
        (row.ttft_ms != null && row.duration_ms != null);

      if (hasExactDuration && row.output_tokens > 0) {
        const dt = Number(row.duration_ms);
        if (dt >= 500 && dt <= 600_000) {
          const tokPerSec = row.output_tokens / (dt / 1000);
          const completedAt = dbTiming?.completedAtMs ?? row.created_at_ms + dt;
          if (completedAt >= speedAtMs) {
            latestSpeedTokS = Number(tokPerSec.toFixed(1));
            speedSource = 'conv_db_exact';
            speedAtMs = completedAt;
          }
          speedOutSum += row.output_tokens;
          speedSecSum += dt / 1000;
        }
      } else {
        const next = rows[i + 1];
        const nextIsPostToolStep =
          next &&
          (next.step_type === 'GENERIC' ||
            next.step_type === 'ERROR_MESSAGE' ||
            next.step_type === 'CHECKPOINT' ||
            next.step_type === 'CODE_ACTION' ||
            next.step_type === 'RUN_COMMAND' ||
            next.step_type === 'VIEW_FILE' ||
            next.step_type === 'LIST_DIRECTORY' ||
            next.step_type === 'SEARCH_WEB' ||
            next.step_type === 'GREP_SEARCH' ||
            next.step_type === 'READ_URL_CONTENT' ||
            next.step_type === 'GENERATE_IMAGE');
        if (row.output_tokens > 0 && row.tool_calls_count > 0 && nextIsPostToolStep) {
          const dt = next.created_at_ms - row.created_at_ms;
          if (dt >= 1000 && dt <= 300_000) {
            updateDurationStmt.run(dt, convId, row.step_index);
            if (dt <= 180_000) {
              const tokPerSec = row.output_tokens / (dt / 1000);
              if (next.created_at_ms >= speedAtMs) {
                latestSpeedTokS = Number(tokPerSec.toFixed(1));
                speedSource = 'tool_step_e2e_est';
                speedAtMs = next.created_at_ms;
              }
              speedOutSum += row.output_tokens;
              speedSecSum += dt / 1000;
            }
          }
        }
      }
    } else if (row.model && row.step_type !== 'ERROR_MESSAGE' && row.created_at_ms >= latestModelAtMs) {
      latestModel = row.model;
      latestModelAtMs = row.created_at_ms;
    }
  }

  const avgSpeedTokS =
    speedSecSum > 0 ? Number((speedOutSum / speedSecSum).toFixed(1)) : null;

  db.prepare(
    `INSERT INTO conv_latest_metrics (
       conv_id, latest_model, latest_upstream_model, latest_requested_model, latest_requested_label,
       latest_model_at_ms, latest_context_tokens, latest_uncached_input, latest_cache_read, latest_output_tokens,
       user_chars_total, tool_chars_total,
       latest_speed_tok_s, avg_speed_tok_s, speed_source, speed_at_ms, last_step_at_ms
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conv_id) DO UPDATE SET
       latest_model = excluded.latest_model,
       latest_upstream_model = excluded.latest_upstream_model,
       latest_requested_model = excluded.latest_requested_model,
       latest_requested_label = excluded.latest_requested_label,
       latest_model_at_ms = excluded.latest_model_at_ms,
       latest_context_tokens = excluded.latest_context_tokens,
       latest_uncached_input = excluded.latest_uncached_input,
       latest_cache_read = excluded.latest_cache_read,
       latest_output_tokens = excluded.latest_output_tokens,
       user_chars_total = excluded.user_chars_total,
       tool_chars_total = excluded.tool_chars_total,
       latest_speed_tok_s = excluded.latest_speed_tok_s,
       avg_speed_tok_s = excluded.avg_speed_tok_s,
       speed_source = excluded.speed_source,
       speed_at_ms = excluded.speed_at_ms,
       last_step_at_ms = excluded.last_step_at_ms`
  ).run(
    convId,
    latestModel,
    latestUpstreamModel,
    latestRequestedModel,
    latestRequestedLabel,
    latestModelAtMs,
    latestContextTokens,
    latestUncachedInput,
    latestCacheRead,
    latestOutputTokens,
    userCharsTotal,
    toolCharsTotal,
    latestSpeedTokS,
    avgSpeedTokS,
    speedSource,
    speedAtMs,
    lastStepAtMs
  );
}

function computeDbEtag(db) {
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(input_tokens + cache_read_tokens + output_tokens), 0) AS tokSum,
              COALESCE(MAX(created_at_ms), 0) AS maxTs,
              COALESCE(SUM(COALESCE(ttft_ms, 0) + COALESCE(duration_ms, 0)), 0) AS timingSum,
              COALESCE(SUM(LENGTH(COALESCE(upstream_model, ''))), 0) AS upModelLenSum
       FROM step_ledger`
    )
    .get();
  const wm = db
    .prepare(`SELECT COUNT(*) AS files, COALESCE(SUM(byte_offset), 0) AS offsetSum FROM session_watermarks`)
    .get();
  const raw = `${agg.cnt}:${agg.tokSum}:${agg.maxTs}:${agg.timingSum}:${agg.upModelLenSum}:${wm.files}:${wm.offsetSum}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
}

const PREPARED_STMTS_BY_DB = new WeakMap();

function getPreparedStatements(db) {
  let stmts = PREPARED_STMTS_BY_DB.get(db);
  if (stmts) return stmts;
  stmts = {
    selectWatermark: db.prepare(
      `SELECT mtime_ms, size_bytes, byte_offset FROM session_watermarks WHERE conv_id = ?`
    ),
    selectMaxStep: db.prepare(
      `SELECT COALESCE(MAX(step_index), -1) AS max_idx FROM step_ledger WHERE conv_id = ?`
    ),
    deleteConvSteps: db.prepare(`DELETE FROM step_ledger WHERE conv_id = ?`),
    deleteRewoundTail: db.prepare(
      `DELETE FROM step_ledger WHERE conv_id = ? AND step_index > ? AND created_at_ms < ?`
    ),
    deleteConvMetrics: db.prepare(`DELETE FROM conv_latest_metrics WHERE conv_id = ?`),
    upsertStep: db.prepare(
      `INSERT INTO step_ledger (
         conv_id, step_index, step_type, created_at_ms, model,
         input_tokens, cache_read_tokens, output_tokens, tool_calls_count,
         content_chars, thinking_chars, status, error_text, ttft_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(conv_id, step_index) DO UPDATE SET
         step_type = excluded.step_type,
         created_at_ms = excluded.created_at_ms,
         model = excluded.model,
         input_tokens = excluded.input_tokens,
         cache_read_tokens = excluded.cache_read_tokens,
         output_tokens = excluded.output_tokens,
         tool_calls_count = excluded.tool_calls_count,
         content_chars = excluded.content_chars,
         thinking_chars = excluded.thinking_chars,
         status = COALESCE(excluded.status, step_ledger.status),
         error_text = COALESCE(excluded.error_text, step_ledger.error_text),
         ttft_ms = CASE
           WHEN excluded.created_at_ms != step_ledger.created_at_ms
             OR excluded.step_type != step_ledger.step_type
             OR COALESCE(excluded.model, '') != COALESCE(step_ledger.model, '')
           THEN excluded.ttft_ms
           ELSE COALESCE(excluded.ttft_ms, step_ledger.ttft_ms)
         END,
         duration_ms = CASE
           WHEN excluded.created_at_ms != step_ledger.created_at_ms
             OR excluded.step_type != step_ledger.step_type
             OR COALESCE(excluded.model, '') != COALESCE(step_ledger.model, '')
           THEN NULL
           ELSE step_ledger.duration_ms
         END,
         upstream_model = CASE
           WHEN excluded.created_at_ms != step_ledger.created_at_ms
             OR excluded.step_type != step_ledger.step_type
             OR COALESCE(excluded.model, '') != COALESCE(step_ledger.model, '')
           THEN NULL
           ELSE step_ledger.upstream_model
         END,
         requested_model_label = CASE
           WHEN excluded.created_at_ms != step_ledger.created_at_ms
             OR excluded.step_type != step_ledger.step_type
             OR COALESCE(excluded.model, '') != COALESCE(step_ledger.model, '')
           THEN NULL
           ELSE step_ledger.requested_model_label
         END`
    ),
    upsertWatermark: db.prepare(
      `INSERT INTO session_watermarks (
         conv_id, transcript_path, mtime_ms, size_bytes, byte_offset, last_scan_ms
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(conv_id) DO UPDATE SET
         transcript_path = excluded.transcript_path,
         mtime_ms = excluded.mtime_ms,
         size_bytes = excluded.size_bytes,
         byte_offset = excluded.byte_offset,
         last_scan_ms = excluded.last_scan_ms`
    ),
    upsertMeta: db.prepare(
      `INSERT INTO scan_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ),
  };
  PREPARED_STMTS_BY_DB.set(db, stmts);
  return stmts;
}

function scanDbWithConnection(db, transcripts, { flushPartial = false, conversationsDir = null } = {}) {
  return (async () => {
    const {
      selectWatermark,
      selectMaxStep,
      deleteConvSteps,
      deleteRewoundTail,
      deleteConvMetrics,
      upsertStep,
      upsertWatermark,
      upsertMeta,
    } = getPreparedStatements(db);

    const changedConvs = [];
    const changedConvSet = new Set();
    let updatedFiles = 0;
    let newSteps = 0;
    const nowMs = Date.now();

    for (const item of transcripts) {
      const prev = selectWatermark.get(item.convId);
      if (
        prev &&
        prev.mtime_ms === item.mtimeMs &&
        prev.size_bytes === item.sizeBytes &&
        prev.byte_offset === item.sizeBytes
      ) {
        continue;
      }

      const truncated = Boolean(prev && item.sizeBytes < prev.byte_offset);
      const startOffset = truncated ? 0 : prev ? prev.byte_offset : 0;
      const maxStepRow = truncated ? null : selectMaxStep.get(item.convId);
      const initialFallbackIdx =
        truncated || !prev ? 0 : Math.max(0, Number(maxStepRow?.max_idx ?? -1) + 1);

      const { rows, nextOffset } = await readDeltaLines(
        item.convId,
        item.transcriptPath,
        startOffset,
        item.sizeBytes,
        item.mtimeMs,
        flushPartial,
        initialFallbackIdx
      );

      if (!truncated && rows.length === 0 && prev && nextOffset === prev.byte_offset) {
        // Still update mtime/size watermark only if size didn't leave unread complete lines
        continue;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        if (truncated) {
          deleteConvSteps.run(item.convId);
          deleteConvMetrics.run(item.convId);
        }
        let highWaterStep = truncated ? -1 : Number(maxStepRow?.max_idx ?? -1);
        for (const r of rows) {
          // Detect Antigravity conversation rewind / retry reusing an earlier step_index:
          // purge obsolete future step_index rows from the abandoned older branch immediately.
          if (highWaterStep >= 0 && r.step_index < highWaterStep && r.created_at_ms > 1000) {
            deleteRewoundTail.run(item.convId, r.step_index, r.created_at_ms - 1000);
            highWaterStep = r.step_index;
          } else if (r.step_index > highWaterStep) {
            highWaterStep = r.step_index;
          }
          upsertStep.run(
            r.conv_id,
            r.step_index,
            r.step_type,
            r.created_at_ms,
            r.model,
            r.input_tokens,
            r.cache_read_tokens,
            r.output_tokens,
            r.tool_calls_count,
            r.content_chars,
            r.thinking_chars,
            r.status ?? null,
            r.error_text ?? null,
            r.ttft_ms ?? null
          );
        }
        upsertWatermark.run(
          item.convId,
          item.transcriptPath,
          item.mtimeMs,
          item.sizeBytes,
          nextOffset,
          nowMs
        );
        if (rows.length > 0 || truncated) {
          recomputeConvMetrics(db, item.convId, { conversationsDir });
          changedConvs.push(item.convId);
          changedConvSet.add(item.convId);
          updatedFiles += 1;
          newSteps += rows.length;
        }
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore rollback error
        }
        throw err;
      }
    }

    if (conversationsDir && fs.existsSync(conversationsDir)) {
      const timingBackfillRow = db
        .prepare(`SELECT value FROM scan_meta WHERE key = 'conv_db_timing_backfill_v1'`)
        .get();
      const upstreamBackfillRow = db
        .prepare(`SELECT value FROM scan_meta WHERE key = 'conv_db_upstream_model_backfill_v1'`)
        .get();
      const rewindRepairRow = db
        .prepare(`SELECT value FROM scan_meta WHERE key = 'conv_db_rewind_repair_v2'`)
        .get();
      const needsTimingBackfill = !timingBackfillRow || timingBackfillRow.value !== '1';
      const needsUpstreamBackfill = !upstreamBackfillRow || upstreamBackfillRow.value !== '1';
      const needsRewindRepair = !rewindRepairRow || rewindRepairRow.value !== '1';
      const needsFullBackfill = needsTimingBackfill || needsUpstreamBackfill || needsRewindRepair;
      const candidateRows = needsRewindRepair
        ? db
            .prepare(`SELECT DISTINCT conv_id FROM step_ledger WHERE step_type = 'PLANNER_RESPONSE'`)
            .all()
        : needsFullBackfill
        ? db
            .prepare(
              `SELECT DISTINCT conv_id FROM step_ledger
               WHERE step_type = 'PLANNER_RESPONSE'
                 AND (ttft_ms IS NULL OR duration_ms IS NULL OR upstream_model IS NULL)`
            )
            .all()
        : db
            .prepare(
              `SELECT DISTINCT conv_id FROM step_ledger
               WHERE step_type = 'PLANNER_RESPONSE'
                 AND (ttft_ms IS NULL OR duration_ms IS NULL OR upstream_model IS NULL)
                 AND created_at_ms >= ?
               LIMIT 5`
            )
            .all(nowMs - 120_000);

      let backfilledAny = false;
      for (const cand of candidateRows) {
        const cid = String(cand?.conv_id || '');
        if (!cid || (changedConvSet.has(cid) && !needsRewindRepair)) continue;
        const convDbPath = path.join(conversationsDir, `${cid}.db`);
        if (!fs.existsSync(convDbPath)) continue;
        db.exec('BEGIN IMMEDIATE');
        try {
          recomputeConvMetrics(db, cid, { conversationsDir, forceRefreshConvDb: needsRewindRepair });
          db.exec('COMMIT');
          if (!changedConvSet.has(cid)) {
            changedConvs.push(cid);
            changedConvSet.add(cid);
          }
          backfilledAny = true;
        } catch {
          try {
            db.exec('ROLLBACK');
          } catch {
            // Ignore rollback error
          }
        }
      }

      if (needsTimingBackfill && (candidateRows.length === 0 || backfilledAny)) {
        upsertMeta.run('conv_db_timing_backfill_v1', '1');
      }
      if (needsUpstreamBackfill && (candidateRows.length === 0 || backfilledAny)) {
        upsertMeta.run('conv_db_upstream_model_backfill_v1', '1');
      }
      if (needsRewindRepair && (candidateRows.length === 0 || backfilledAny)) {
        upsertMeta.run('conv_db_rewind_repair_v2', '1');
      }
    }

    const prevEtagRow = db.prepare(`SELECT value FROM scan_meta WHERE key = 'etag'`).get();
    const etag = computeDbEtag(db);
    upsertMeta.run('etag', etag);
    upsertMeta.run('last_scan_ms', String(nowMs));

    return {
      scannedFiles: transcripts.length,
      updatedFiles,
      newSteps,
      changedConvs,
      etag,
      etagChanged: !prevEtagRow || prevEtagRow.value !== etag,
    };
  })();
}

/**
 * Performs a single incremental scan pass across all transcript.jsonl files.
 * Accepts either `(brainDir, cacheDbPath, options)` or `({ brainDir, cacheDbPath, conversationsDir, flushPartial })`.
 */
export async function scanOnce(brainDirOrOpts, cacheDbPathArg, options = {}) {
  let brainDir;
  let cacheDbPath;
  let conversationsDir;
  let flushPartial = false;

  if (brainDirOrOpts && typeof brainDirOrOpts === 'object') {
    const explicitBrain = Boolean(brainDirOrOpts.brainDir);
    brainDir = brainDirOrOpts.brainDir || resolveDefaultBrainDir();
    cacheDbPath = brainDirOrOpts.cacheDbPath || resolveDefaultCacheDbPath();
    conversationsDir =
      brainDirOrOpts.conversationsDir ||
      (explicitBrain ? path.resolve(brainDir, '..', 'conversations') : resolveDefaultConversationsDir(brainDir));
    flushPartial = Boolean(brainDirOrOpts.flushPartial);
  } else {
    const explicitBrain = Boolean(brainDirOrOpts);
    brainDir = brainDirOrOpts || resolveDefaultBrainDir();
    cacheDbPath = cacheDbPathArg || resolveDefaultCacheDbPath();
    conversationsDir =
      options.conversationsDir ||
      (explicitBrain ? path.resolve(brainDir, '..', 'conversations') : resolveDefaultConversationsDir(brainDir));
    flushPartial = Boolean(options.flushPartial);
  }

  const transcripts = await discoverTranscripts(brainDir);
  const db = openCacheDb(cacheDbPath);
  try {
    return await scanDbWithConnection(db, transcripts, { flushPartial, conversationsDir });
  } finally {
    db.close();
  }
}

export { scanOnce as runIncrementalScanOnce };

async function runWorkerMain() {
  const useWorkerPort = !isMainThread && Boolean(parentPort);
  const wData = useWorkerPort && workerData && typeof workerData === 'object' ? workerData : null;
  const brainDir =
    typeof wData?.brainDir === 'string' && wData.brainDir
      ? path.resolve(wData.brainDir)
      : resolveDefaultBrainDir();
  const conversationsDir =
    typeof wData?.conversationsDir === 'string' && wData.conversationsDir
      ? path.resolve(wData.conversationsDir)
      : resolveDefaultConversationsDir(brainDir);
  const cacheDbPath =
    typeof wData?.cacheDbPath === 'string' && wData.cacheDbPath
      ? path.resolve(wData.cacheDbPath)
      : resolveDefaultCacheDbPath();
  const rawInterval =
    wData?.scanIntervalMs !== undefined ? wData.scanIntervalMs : process.env.AGY_MONITOR_SCAN_INTERVAL_MS;
  const intervalMs = rawInterval === undefined ? 4000 : Number(rawInterval);

  const sendToParent = (payload) => {
    try {
      if (useWorkerPort) {
        parentPort.postMessage(payload);
      } else if (process.connected && typeof process.send === 'function') {
        process.send(payload);
      }
    } catch {
      // Ignore IPC/port disconnect during shutdown
    }
  };

  const db = openCacheDb(cacheDbPath);
  const coldCache = new Map();
  let scanTick = 0;
  let shuttingDown = false;
  let inFlight = null;
  let timer = null;

  const triggerScan = (forceNotify = false) => {
    if (shuttingDown) return Promise.resolve(null);
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        scanTick += 1;
        const transcripts = await discoverTranscripts(brainDir, {
          coldCache,
          scanTick,
          fullSweep: Boolean(forceNotify) || scanTick === 1,
        });
        const res = await scanDbWithConnection(db, transcripts, { flushPartial: false, conversationsDir });
        if (scanTick % 30 === 0) {
          try {
            db.exec('PRAGMA shrink_memory;');
          } catch {
            // Non-fatal SQLite shrink error
          }
        }
        if (res.etagChanged || forceNotify) {
          sendToParent({
            type: 'updated',
            etag: res.etag,
            changedConvs: res.changedConvs,
            newSteps: res.newSteps,
          });
        }
        return res;
      } catch (err) {
        sendToParent({ type: 'error', message: err?.message || 'scan_error' });
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const onParentMessage = (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'rescan') {
      void triggerScan(Boolean(msg.forceNotify));
    } else if (msg.type === 'shrink') {
      try {
        db.exec('PRAGMA shrink_memory;');
      } catch {
        // Ignore shrink error
      }
      if (typeof global.gc === 'function') {
        try {
          global.gc();
        } catch {
          // Ignore GC error
        }
      }
    } else if (msg.type === 'shutdown') {
      void shutdown();
    }
  };

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (inFlight) {
      await inFlight.catch(() => {});
    }
    try {
      db.close();
    } catch {
      // Ignore close error on shutdown
    }
    if (useWorkerPort) {
      try {
        parentPort.removeListener('message', onParentMessage);
        parentPort.close();
      } catch {
        // Ignore port close error on shutdown
      }
    } else {
      process.exit(0);
    }
  };

  if (useWorkerPort) {
    parentPort.on('message', onParentMessage);
  } else {
    process.on('message', onParentMessage);
    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  }

  await triggerScan(true);

  if (Number.isFinite(intervalMs) && intervalMs > 0 && !shuttingDown) {
    timer = setInterval(() => {
      void triggerScan(false);
    }, Math.max(500, intervalMs));
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const isWorkerThreadEntry =
  !isMainThread &&
  Boolean(parentPort) &&
  (Boolean(workerData?.isScanWorker) || isEntrypoint);

if (isEntrypoint || isWorkerThreadEntry) {
  void runWorkerMain();
}
