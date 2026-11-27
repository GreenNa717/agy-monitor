/**
 * Detached pure-Node background worker (`asar_apply_worker.mjs`) that atomically
 * applies a pre-staged `app.asar.agy_pending` once Antigravity releases its file lock.
 *
 * Design guarantees:
 * - Zero in-place writes to a live running `app.asar`.
 * - Zero subprocess spawning while Antigravity is running (only `process.kill(watchPid, 0)`).
 * - Zero data copying in the lock-wait loop (staging happens once in the same directory;
 *   each poll performs a sub-millisecond `statSync` + atomic `renameSync`).
 * - Verifies staged SHA-256 and target `(size, mtimeMs)` so a concurrent Antigravity
 *   auto-update is never overwritten by an older staged file.
 */

import crypto from 'node:crypto';
import nodeFs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);

function loadRawFs() {
  if (process.versions && process.versions.electron) {
    try {
      const ofs = _require('original-fs');
      if (ofs && typeof ofs.readFileSync === 'function') {
        return ofs;
      }
    } catch {
      // Fallback to standard node:fs
    }
  }
  return nodeFs;
}

const rawFs = loadRawFs();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function isLockError(err) {
  const code = String(err?.code || '').toUpperCase();
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ETXTBSY';
}

export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(20, ms)));
}

function sha256FileSync(filePath, fsMod) {
  const hash = crypto.createHash('sha256');
  const fd = fsMod.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fsMod.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
    }
  } finally {
    try {
      fsMod.closeSync(fd);
    } catch {
      // ignore
    }
  }
  return hash.digest('hex');
}

function safeUnlinkSync(filePath, fsMod) {
  if (!filePath) return;
  try {
    fsMod.rmSync(filePath, { force: true });
  } catch {
    // ignore
  }
}

function cleanupStaleSiblingsSync(targetPath, fsMod) {
  try {
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${base}\\.agy_(?:stale|tmp)(?:\\..+)?$`, 'i');
    for (const name of fsMod.readdirSync(dir)) {
      if (re.test(name)) {
        safeUnlinkSync(path.join(dir, name), fsMod);
      }
    }
  } catch {
    // ignore
  }
}

function readJobSafe(jobPath, fsMod) {
  try {
    if (!fsMod.existsSync(jobPath)) return null;
    const parsed = JSON.parse(fsMod.readFileSync(jobPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function applyPendingAsarJobOnce(jobPath, { fsMod = rawFs, verifiedCache = null } = {}) {
  const job = readJobSafe(jobPath, fsMod);
  if (!job) {
    return { status: 'missing' };
  }

  const targetPath = typeof job.targetPath === 'string' ? job.targetPath : '';
  const stagedPath = typeof job.stagedPath === 'string' ? job.stagedPath : '';
  if (!targetPath || !stagedPath) {
    safeUnlinkSync(jobPath, fsMod);
    return { status: 'invalid' };
  }

  const ttlMs = Number(job.ttlMs) > 0 ? Number(job.ttlMs) : DEFAULT_TTL_MS;
  if (Number(job.createdAtMs) > 0 && Date.now() - Number(job.createdAtMs) > ttlMs) {
    safeUnlinkSync(stagedPath, fsMod);
    safeUnlinkSync(jobPath, fsMod);
    return { status: 'expired' };
  }

  let stagedStat = null;
  try {
    stagedStat = fsMod.statSync(stagedPath);
  } catch {
    stagedStat = null;
  }
  if (!stagedStat || !stagedStat.isFile()) {
    safeUnlinkSync(jobPath, fsMod);
    return { status: 'missing_staged' };
  }

  if (Number(job.pendingSize) > 0 && stagedStat.size !== Number(job.pendingSize)) {
    safeUnlinkSync(stagedPath, fsMod);
    safeUnlinkSync(jobPath, fsMod);
    return { status: 'staged_corrupt' };
  }

  if (job.pendingSha256) {
    const cacheKey = `${stagedPath}|${stagedStat.size}|${stagedStat.mtimeMs}|${job.pendingSha256}`;
    if (!verifiedCache || verifiedCache.key !== cacheKey) {
      const actualSha = sha256FileSync(stagedPath, fsMod);
      if (actualSha !== job.pendingSha256) {
        safeUnlinkSync(stagedPath, fsMod);
        safeUnlinkSync(jobPath, fsMod);
        return { status: 'staged_corrupt' };
      }
      if (verifiedCache) verifiedCache.key = cacheKey;
    }
  }

  let targetStat = null;
  try {
    targetStat = fsMod.statSync(targetPath);
  } catch {
    targetStat = null;
  }
  if (targetStat && targetStat.isFile()) {
    const sizeChanged =
      Number(job.expectedTargetSize) > 0 && targetStat.size !== Number(job.expectedTargetSize);
    const mtimeChanged =
      Number(job.expectedTargetMtimeMs) > 0 &&
      Math.abs(targetStat.mtimeMs - Number(job.expectedTargetMtimeMs)) > 2000;
    if (sizeChanged || mtimeChanged) {
      // Target app.asar was replaced by another process or newer Antigravity update — abort safely.
      safeUnlinkSync(stagedPath, fsMod);
      safeUnlinkSync(jobPath, fsMod);
      return { status: 'target_changed' };
    }
  }

  try {
    fsMod.renameSync(stagedPath, targetPath);
    cleanupStaleSiblingsSync(targetPath, fsMod);
    safeUnlinkSync(jobPath, fsMod);
    return { status: 'applied', action: job.action || 'install', targetPath };
  } catch (err) {
    if (isLockError(err)) {
      return { status: 'locked', code: err?.code || 'EBUSY', error: err?.message || String(err) };
    }
    return { status: 'error', code: err?.code || '', error: err?.message || String(err) };
  }
}

export async function runPendingAsarWorker(
  jobPath,
  {
    watchPid = 0,
    pollMs = 1000,
    maxWaitMs = DEFAULT_TTL_MS,
    fsMod = rawFs,
  } = {},
) {
  const initialJob = readJobSafe(jobPath, fsMod);
  const pidFile = typeof initialJob?.pidFile === 'string' ? initialJob.pidFile : '';
  if (pidFile) {
    try {
      fsMod.mkdirSync(path.dirname(pidFile), { recursive: true });
      fsMod.writeFileSync(pidFile, String(process.pid), 'utf8');
    } catch {
      // ignore
    }
  }

  const verifiedCache = { key: '' };
  const startedAt = Date.now();
  let lastResult = { status: 'timeout' };

  try {
    while (Date.now() - startedAt <= maxWaitMs) {
      if (!fsMod.existsSync(jobPath)) {
        lastResult = { status: 'cancelled' };
        break;
      }

      if (watchPid > 0 && isPidAlive(watchPid)) {
        await sleep(Math.max(500, pollMs));
        continue;
      }

      const res = applyPendingAsarJobOnce(jobPath, { fsMod, verifiedCache });
      lastResult = res;
      if (res.status !== 'locked') {
        break;
      }
      await sleep(pollMs);
    }
  } finally {
    if (pidFile) {
      try {
        if (fsMod.existsSync(pidFile) && fsMod.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) {
          fsMod.rmSync(pidFile, { force: true });
        }
      } catch {
        // ignore
      }
    }
  }

  return lastResult;
}

function isSameEntrypoint(argvPath, modulePath) {
  if (typeof argvPath !== 'string' || !argvPath) return false;
  try {
    const a = nodeFs.realpathSync(path.resolve(argvPath));
    const b = nodeFs.realpathSync(modulePath);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    const a = path.resolve(argvPath);
    return process.platform === 'win32' ? a.toLowerCase() === modulePath.toLowerCase() : a === modulePath;
  }
}

if (isSameEntrypoint(process.argv[1], __filename)) {
  const args = process.argv.slice(2);
  let jobPath = '';
  let watchPid = 0;
  let pollMs = 1000;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--job' && args[i + 1]) {
      jobPath = args[++i];
    } else if (args[i] === '--watch-pid' && args[i + 1]) {
      watchPid = Number(args[++i]) || 0;
    } else if (args[i] === '--poll-ms' && args[i + 1]) {
      pollMs = Math.max(100, Number(args[++i]) || 1000);
    }
  }
  if (!jobPath) {
    process.exit(1);
  }
  runPendingAsarWorker(jobPath, { watchPid, pollMs })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
