import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import nodeFs from 'node:fs';
import nodeFsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteJson, atomicWriteText } from './paths.mjs';
import {
  buildHostI18nRestoreExpr,
  buildHostI18nSelfContainedScript,
  clearHostI18nCache,
  HOST_I18N_VERSION,
} from './host_i18n.mjs';
import { detectWindowsHostEnv, resolveWindowsHostDirs } from './wsl_bridge.mjs';

const _require = createRequire(import.meta.url);
const __hudDirname = path.dirname(fileURLToPath(import.meta.url));
const ASAR_APPLY_WORKER_PATH = path.resolve(__hudDirname, 'asar_apply_worker.mjs');

// Inside Electron's ELECTRON_RUN_AS_NODE sidecar runtime, standard `node:fs` intercepts
// `.asar` paths as virtual directories and throws `ENOENT, not found in .../app.asar`.
// Use Electron's built-in `original-fs` so real disk `.asar` reads/writes/renames bypass ASAR hooks cleanly.
function loadRawFs() {
  if (process.versions && process.versions.electron) {
    try {
      const ofs = _require('original-fs');
      if (ofs && typeof ofs.readFileSync === 'function' && ofs.promises) {
        return { fs: ofs, fsp: ofs.promises };
      }
    } catch {
      // Fallback to standard node:fs
    }
  }
  return { fs: nodeFs, fsp: nodeFsp };
}

const { fs, fsp } = loadRawFs();

export const NATIVE_HUD_VERSION = '2.3.0';
export const NATIVE_HUD_HEARTBEAT_TTL_MS = 14_000;
export const HOST_WALLPAPER_STYLE_ID = 'agy-monitor-cdp-theme';

const MAIN_HOOK_MARKER = 'require("./agy-monitor-hud-main")';
const MAIN_HOOK_LINE = 'try { require("./agy-monitor-hud-main"); } catch {}';
const ASAR_MAIN_REL = 'dist/agy-monitor-hud-main.js';
const ASAR_RENDERER_REL = 'dist/agy-monitor-hud.js';
const ASAR_WALLPAPER_REL = 'dist/agy-monitor-wallpaper.js';
const ASAR_META_REL = 'dist/agy-monitor-hud.meta.json';
const ASAR_BLOCK_SIZE = 4 * 1024 * 1024;

const WP_EXT_TO_MIME = new Map([
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
]);

const ASAR_INSPECT_CACHE_MAX = 16;
const STAGED_SIGNATURE_CACHE_MAX = 64;
const EMPTY_CONTENT_SIG = crypto.createHash('sha256').update('', 'utf8').digest('hex');

let cachedGuidePath = '';
let cachedGuideMtime = -1;
let cachedGuideSize = -1;
let cachedGuideDataUri = null;
let cachedResolvedAsarPosix = '';
let cachedResolvedDevToolsPosix = '';
let cachedStagedWpPath = '';
let cachedStagedWpMtime = -1;
let cachedStagedWpSize = -1;
let cachedStagedWpUri = '';
const asarInspectCache = new Map();
const stagedFileSignatures = new Map();

function setBoundedMap(map, key, value, maxSize) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function clearWallpaperBase64Cache() {
  cachedStagedWpPath = '';
  cachedStagedWpMtime = -1;
  cachedStagedWpSize = -1;
  cachedStagedWpUri = '';
}

export function clearHudInjectorCaches() {
  clearWallpaperBase64Cache();
  clearHostI18nCache();
  cachedGuidePath = '';
  cachedGuideMtime = -1;
  cachedGuideSize = -1;
  cachedGuideDataUri = null;
  cachedResolvedAsarPosix = '';
  cachedResolvedDevToolsPosix = '';
  asarInspectCache.clear();
  stagedFileSignatures.clear();
}

// ============================================================================
// Pure Node.js Surgical In-Memory ASAR Parser & Repacker
// ============================================================================

export function computeAsarIntegrity(buffer, blockSize = ASAR_BLOCK_SIZE) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const fullHash = crypto.createHash('sha256').update(buf).digest('hex');
  const blocks = [];
  if (buf.length === 0) {
    blocks.push(fullHash);
  } else {
    for (let offset = 0; offset < buf.length; offset += blockSize) {
      const end = Math.min(buf.length, offset + blockSize);
      blocks.push(crypto.createHash('sha256').update(buf.subarray(offset, end)).digest('hex'));
    }
  }
  return {
    algorithm: 'SHA256',
    hash: fullHash,
    blockSize,
    blocks,
  };
}

export function parseAsar(raw) {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (buf.length < 16) {
    throw new Error('ASAR 文件过小或已损坏');
  }
  const pickleSize = buf.readUInt32LE(0);
  const headerSize = buf.readUInt32LE(4);
  const headerBodySize = buf.readUInt32LE(8);
  const jsonLen = buf.readUInt32LE(12);
  if (pickleSize !== 4 || headerSize < 8 || headerBodySize < 4) {
    throw new Error('ASAR 头部结构非法');
  }
  const baseOffset = 8 + headerSize;
  if (16 + jsonLen > buf.length || baseOffset > buf.length) {
    throw new Error('ASAR 头部长度越界');
  }
  let root;
  try {
    root = JSON.parse(buf.subarray(16, 16 + jsonLen).toString('utf8'));
  } catch (err) {
    throw new Error(`解析 ASAR JSON 目录树失败: ${err?.message || err}`);
  }
  return {
    root,
    baseOffset,
    payload: buf.subarray(baseOffset),
  };
}

export function lookupAsarNode(root, relPath) {
  if (!root || typeof relPath !== 'string') return null;
  const segs = relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  let cur = root;
  for (const seg of segs) {
    if (!cur || typeof cur !== 'object' || !cur.files || !Object.prototype.hasOwnProperty.call(cur.files, seg)) {
      return null;
    }
    cur = cur.files[seg];
  }
  return cur;
}

export function extractAsarFile(parsed, relPath) {
  const node = lookupAsarNode(parsed.root, relPath);
  if (!node) {
    throw new Error(`ASAR 内未找到文件: ${relPath}`);
  }
  if (node.unpacked === true) {
    throw new Error(`文件 ${relPath} 标记为 unpacked，不在 ASAR 载荷中`);
  }
  const offset = Number(node.offset);
  const size = Number(node.size);
  if (!Number.isFinite(offset) || !Number.isFinite(size) || offset < 0 || size < 0) {
    throw new Error(`文件 ${relPath} offset/size 非法`);
  }
  if (offset + size > parsed.payload.length) {
    throw new Error(`文件 ${relPath} 载荷越界`);
  }
  return Buffer.from(parsed.payload.subarray(offset, offset + size));
}

async function readExactAt(fh, position, length) {
  if (length === 0) return Buffer.alloc(0);
  const buf = Buffer.allocUnsafe(length);
  let totalRead = 0;
  while (totalRead < length) {
    const { bytesRead } = await fh.read(buf, totalRead, length - totalRead, position + totalRead);
    if (!bytesRead || bytesRead <= 0) {
      throw new Error('ASAR 文件读取提前结束');
    }
    totalRead += bytesRead;
  }
  return buf;
}

async function readAsarHeaderFromHandle(fh, fileSize) {
  if (!Number.isFinite(fileSize) || fileSize < 16) {
    throw new Error('ASAR 文件过小或已损坏');
  }
  const preamble = await readExactAt(fh, 0, 16);
  const pickleSize = preamble.readUInt32LE(0);
  const headerSize = preamble.readUInt32LE(4);
  const headerBodySize = preamble.readUInt32LE(8);
  const jsonLen = preamble.readUInt32LE(12);
  if (pickleSize !== 4 || headerSize < 8 || headerBodySize < 4) {
    throw new Error('ASAR 头部结构非法');
  }
  const baseOffset = 8 + headerSize;
  if (16 + jsonLen > fileSize || baseOffset > fileSize) {
    throw new Error('ASAR 头部长度越界');
  }
  const jsonBuf = await readExactAt(fh, 16, jsonLen);
  let root;
  try {
    root = JSON.parse(jsonBuf.toString('utf8'));
  } catch (err) {
    throw new Error(`解析 ASAR JSON 目录树失败: ${err?.message || err}`);
  }
  return { root, baseOffset };
}

async function extractAsarFileFromHandle(fh, root, baseOffset, fileSize, relPath) {
  const node = lookupAsarNode(root, relPath);
  if (!node) {
    throw new Error(`ASAR 内未找到文件: ${relPath}`);
  }
  if (node.unpacked === true) {
    throw new Error(`文件 ${relPath} 标记为 unpacked，不在 ASAR 载荷中`);
  }
  const offset = Number(node.offset);
  const size = Number(node.size);
  if (!Number.isFinite(offset) || !Number.isFinite(size) || offset < 0 || size < 0) {
    throw new Error(`文件 ${relPath} offset/size 非法`);
  }
  const absStart = baseOffset + offset;
  if (absStart + size > fileSize) {
    throw new Error(`文件 ${relPath} 载荷越界`);
  }
  return await readExactAt(fh, absStart, size);
}

async function resolveEntryRelPathFromHandle(fh, root, baseOffset, fileSize) {
  try {
    const pkgBuf = await extractAsarFileFromHandle(fh, root, baseOffset, fileSize, 'package.json');
    const pkg = JSON.parse(pkgBuf.toString('utf8'));
    const mainField = String(pkg?.main || 'dist/main.js').replace(/\\/g, '/').replace(/^\.\//, '');
    if (lookupAsarNode(root, mainField)) {
      return { entryRel: mainField, appVersion: String(pkg?.version || 'unknown') };
    }
    return { entryRel: 'dist/main.js', appVersion: String(pkg?.version || 'unknown') };
  } catch {
    return { entryRel: 'dist/main.js', appVersion: 'unknown' };
  }
}

async function inspectAsarMetadataBySlices(asarPath, fileSize) {
  let fh = null;
  try {
    fh = await fsp.open(asarPath, 'r');
    const { root, baseOffset } = await readAsarHeaderFromHandle(fh, fileSize);
    const { entryRel, appVersion } = await resolveEntryRelPathFromHandle(fh, root, baseOffset, fileSize);
    const hasMain = Boolean(lookupAsarNode(root, ASAR_MAIN_REL));
    const hasRenderer = Boolean(lookupAsarNode(root, ASAR_RENDERER_REL));
    const hasWallpaper = Boolean(lookupAsarNode(root, ASAR_WALLPAPER_REL));
    let hasEntryHook = false;
    if (lookupAsarNode(root, entryRel)) {
      const entryText = (await extractAsarFileFromHandle(fh, root, baseOffset, fileSize, entryRel)).toString('utf8');
      hasEntryHook = entryText.includes(MAIN_HOOK_MARKER);
    }
    let installedVersion = '';
    if (lookupAsarNode(root, ASAR_META_REL)) {
      try {
        const metaText = (await extractAsarFileFromHandle(fh, root, baseOffset, fileSize, ASAR_META_REL)).toString('utf8');
        const meta = JSON.parse(metaText);
        installedVersion = String(meta?.version || '');
      } catch {
        installedVersion = '';
      }
    }

    let state = 'stock';
    if (hasMain && hasRenderer && hasWallpaper && hasEntryHook) {
      state = installedVersion === NATIVE_HUD_VERSION ? 'installed' : 'outdated';
    } else if (hasMain || hasRenderer || hasWallpaper || hasEntryHook) {
      state = 'outdated';
    }
    return { appVersion, state, installedVersion };
  } finally {
    if (fh) {
      await fh.close().catch(() => {});
    }
  }
}

function removeAsarNode(root, relPath) {
  const segs = relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (segs.length === 0) return;
  let cur = root;
  for (let i = 0; i < segs.length - 1; i += 1) {
    if (!cur?.files?.[segs[i]]) return;
    cur = cur.files[segs[i]];
  }
  if (cur?.files && Object.prototype.hasOwnProperty.call(cur.files, segs[segs.length - 1])) {
    delete cur.files[segs[segs.length - 1]];
  }
}

function ensureAsarFileNode(root, relPath) {
  const segs = relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (segs.length === 0) {
    throw new Error('非法空 ASAR 路径');
  }
  let cur = root;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const seg = segs[i];
    if (!cur.files || typeof cur.files !== 'object') {
      throw new Error(`路径 ${relPath} 中间节点不是目录`);
    }
    if (!cur.files[seg]) {
      cur.files[seg] = { files: {} };
    }
    cur = cur.files[seg];
  }
  if (!cur.files || typeof cur.files !== 'object') {
    throw new Error(`路径 ${relPath} 父节点不是目录`);
  }
  const leaf = segs[segs.length - 1];
  if (!cur.files[leaf]) {
    cur.files[leaf] = { size: 0, offset: '0' };
  }
}

export function repackAsarInMemory(sourceRaw, overrides = new Map(), removals = new Set()) {
  const parsed = parseAsar(sourceRaw);
  const root = JSON.parse(JSON.stringify(parsed.root));
  const sourcePayload = parsed.payload;

  const overrideMap = overrides instanceof Map ? overrides : new Map(Object.entries(overrides || {}));
  const removalSet = removals instanceof Set ? removals : new Set(removals || []);

  for (const rem of removalSet) {
    removeAsarNode(root, rem);
  }
  for (const rel of overrideMap.keys()) {
    ensureAsarFileNode(root, rel);
  }

  const chunks = [];
  let payloadLen = 0;

  const walk = (node, curPath) => {
    if (node && typeof node === 'object' && node.files && typeof node.files === 'object') {
      for (const key of Object.keys(node.files)) {
        const nextPath = curPath ? `${curPath}/${key}` : key;
        walk(node.files[key], nextPath);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.link !== undefined || node.unpacked === true) {
      return;
    }

    if (overrideMap.has(curPath)) {
      const val = overrideMap.get(curPath);
      const dataBuf = Buffer.isBuffer(val) ? val : Buffer.from(String(val ?? ''), 'utf8');
      node.size = dataBuf.length;
      node.offset = String(payloadLen);
      node.integrity = computeAsarIntegrity(dataBuf);
      chunks.push(dataBuf);
      payloadLen += dataBuf.length;
      return;
    }

    const oldOffset = Number(node.offset);
    const size = Number(node.size);
    if (!Number.isFinite(oldOffset) || !Number.isFinite(size) || oldOffset < 0 || size < 0) {
      throw new Error(`节点 ${curPath} offset/size 非法`);
    }
    if (oldOffset + size > sourcePayload.length) {
      throw new Error(`原文件 ${curPath} 偏移越界`);
    }
    node.offset = String(payloadLen);
    const slice = sourcePayload.subarray(oldOffset, oldOffset + size);
    chunks.push(slice);
    payloadLen += size;
  };

  walk(root, '');

  const jsonBuf = Buffer.from(JSON.stringify(root), 'utf8');
  const alignedLen = (jsonBuf.length + 3) & ~3;
  const headerBodySize = alignedLen + 4;
  const headerSize = alignedLen + 8;

  const headerBuf = Buffer.alloc(16 + alignedLen);
  headerBuf.writeUInt32LE(4, 0);
  headerBuf.writeUInt32LE(headerSize, 4);
  headerBuf.writeUInt32LE(headerBodySize, 8);
  headerBuf.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(headerBuf, 16);

  return Buffer.concat([headerBuf, ...chunks], headerBuf.length + payloadLen);
}

// ============================================================================
// Host Path Resolution & DevToolsActivePort Discovery
// ============================================================================

export function resolveHostAsarPathSync(paths = {}) {
  if (typeof paths?.hostAsarPath === 'string') {
    return paths.hostAsarPath;
  }
  const hostInfo = detectWindowsHostEnv();
  if (!hostInfo.hasWindowsHost) {
    return '';
  }
  if (hostInfo.isNativeWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const candidates = [
      path.join(localAppData, 'Programs', 'antigravity', 'resources', 'app.asar'),
      path.join(localAppData, 'Programs', 'Antigravity', 'resources', 'app.asar'),
      path.join(programFiles, 'Antigravity', 'resources', 'app.asar'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {
        // ignore
      }
    }
    return candidates[0];
  }
  if (cachedResolvedAsarPosix && fs.existsSync(cachedResolvedAsarPosix)) {
    return cachedResolvedAsarPosix;
  }
  return '';
}

export async function resolveHostAsarPath(paths = {}) {
  if (typeof paths?.hostAsarPath === 'string') {
    return paths.hostAsarPath;
  }
  const hostInfo = detectWindowsHostEnv();
  if (!hostInfo.hasWindowsHost) {
    return '';
  }
  if (hostInfo.isNativeWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const candidates = [
      path.join(localAppData, 'Programs', 'antigravity', 'resources', 'app.asar'),
      path.join(localAppData, 'Programs', 'Antigravity', 'resources', 'app.asar'),
      path.join(programFiles, 'Antigravity', 'resources', 'app.asar'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {
        // ignore
      }
    }
    return candidates[0];
  }

  if (cachedResolvedAsarPosix && fs.existsSync(cachedResolvedAsarPosix)) {
    return cachedResolvedAsarPosix;
  }
  const dirs = await resolveWindowsHostDirs(hostInfo);
  const candidates = [];
  if (dirs.localAppDataPosix) {
    candidates.push(
      `${dirs.localAppDataPosix}/Programs/antigravity/resources/app.asar`,
      `${dirs.localAppDataPosix}/Programs/Antigravity/resources/app.asar`,
    );
  }
  if (dirs.programFilesPosix) {
    candidates.push(`${dirs.programFilesPosix}/Antigravity/resources/app.asar`);
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        cachedResolvedAsarPosix = c;
        return c;
      }
    } catch {
      // ignore
    }
  }
  return candidates[0] || '';
}

export async function resolveDevToolsActivePortPath(paths = {}) {
  if (typeof paths?.devToolsActivePortFile === 'string') {
    return paths.devToolsActivePortFile;
  }
  const hostInfo = detectWindowsHostEnv();
  if (!hostInfo.hasWindowsHost) {
    return '';
  }
  if (hostInfo.isNativeWindows) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Antigravity', 'DevToolsActivePort');
  }
  if (cachedResolvedDevToolsPosix && fs.existsSync(cachedResolvedDevToolsPosix)) {
    return cachedResolvedDevToolsPosix;
  }
  const dirs = await resolveWindowsHostDirs(hostInfo);
  if (dirs.userProfilePosix) {
    const p = `${dirs.userProfilePosix}/AppData/Roaming/Antigravity/DevToolsActivePort`;
    if (fs.existsSync(p)) {
      cachedResolvedDevToolsPosix = p;
    }
    return p;
  }
  return '';
}

export async function readDevToolsActivePort(paths = {}) {
  try {
    const portFile = await resolveDevToolsActivePortPath(paths);
    if (!portFile || !fs.existsSync(portFile)) return 0;
    const raw = await fsp.readFile(portFile, 'utf8');
    const firstLine = String(raw || '').split(/\r?\n/)[0]?.trim() || '';
    const port = Number(firstLine);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      return port;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function readNativeHudHeartbeat(paths = {}, nowMs = Date.now()) {
  const emptyHeartbeat = {
    alive: false,
    hookAlive: false,
    wallpaperAlive: false,
    i18nAlive: false,
    mountedCount: 0,
    wallpaperCount: 0,
    i18nCount: 0,
    version: '',
    pid: 0,
    activeConvId: '',
    proxyActive: false,
    proxyEnabled: true,
    proxyDisplayUrl: '',
    proxySpecKey: '',
    proxyStartupSpecKey: '',
    proxyForceHttp1: false,
    updatedAtMs: 0,
    ageMs: Infinity,
  };
  const file = paths?.nativeHudStatusFile;
  if (!file) {
    return emptyHeartbeat;
  }
  try {
    if (!fs.existsSync(file)) {
      return emptyHeartbeat;
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const updatedAtMs = Number(raw?.updatedAtMs || 0);
    const ageMs = updatedAtMs > 0 ? Math.max(0, nowMs - updatedAtMs) : Infinity;
    const mountedCount = Math.max(0, Number(raw?.mountedCount || 0));
    const wallpaperCount = Math.max(0, Number(raw?.wallpaperCount || 0));
    const i18nCount = Math.max(0, Number(raw?.i18nCount || 0));
    const hookAlive = ageMs <= NATIVE_HUD_HEARTBEAT_TTL_MS;
    const alive = hookAlive && mountedCount > 0;
    const wallpaperAlive = hookAlive && wallpaperCount > 0;
    const i18nAlive = hookAlive && i18nCount > 0;
    return {
      alive,
      hookAlive,
      wallpaperAlive,
      i18nAlive,
      mountedCount,
      wallpaperCount,
      i18nCount,
      version: String(raw?.version || ''),
      pid: Number(raw?.pid || 0),
      activeConvId: String(raw?.activeConvId || ''),
      proxyActive: Boolean(hookAlive && raw?.proxyActive),
      proxyEnabled: typeof raw?.proxyEnabled === 'boolean' ? raw.proxyEnabled : true,
      proxyDisplayUrl: String(raw?.proxyDisplayUrl || ''),
      proxySpecKey: String(raw?.proxySpecKey || ''),
      proxyStartupSpecKey: String(raw?.proxyStartupSpecKey || ''),
      proxyForceHttp1: Boolean(raw?.proxyForceHttp1),
      updatedAtMs,
      ageMs,
    };
  } catch {
    return emptyHeartbeat;
  }
}

function clampWpInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseWpHexRgb(hex, fallback = [7, 7, 9]) {
  if (typeof hex !== 'string') return fallback;
  const s = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return fallback;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/**
 * Shared pure-CSS wallpaper & palette styling for Antigravity's Electron shell
 * (used by both Scheme 2 CDP and Scheme 3 app.asar Persistent Injection).
 */
export function buildHostWallpaperCss(themes = {}, wallpaperDataUri = '', options = {}) {
  const liteMode = Boolean(options?.liteMode ?? themes?.liteMode);
  const opacity = clampWpInt(themes.opacity, 0, 100, 32);
  const blur = clampWpInt(themes.blur, 0, 24, 4);
  const dim = clampWpInt(themes.dim, 0, 85, 52);
  const hostBlendPct = clampWpInt(themes.hostBlendPct, 5, 42, 18);
  const fit = themes.fit === 'contain' ? 'contain' : 'cover';

  const colors = themes.colors && typeof themes.colors === 'object' ? themes.colors : {};
  const [cr, cg, cb] = parseWpHexRgb(colors.canvas, [7, 7, 9]);
  const [chr, chg, chb] = parseWpHexRgb(colors.chrome, [17, 16, 21]);
  const [br, bg, bb] = parseWpHexRgb(colors.bubble, [19, 19, 23]);
  const accent =
    typeof colors.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(colors.accent)
      ? colors.accent
      : '#3570e4';

  const wpOpacity = (opacity / 100).toFixed(3);
  const dimFrac = dim / 100;
  const blendFrac = hostBlendPct / 100;
  const totalVeilAlpha = Math.max(0.28, Math.min(0.96, 1 - (1 - dimFrac) * blendFrac)).toFixed(3);
  const sidebarTintAlpha = Math.max(0.06, Math.min(0.18, 0.16 - blendFrac * 0.22)).toFixed(3);
  const softSurfaceAlpha = Math.max(0.18, Math.min(0.44, 0.36 - blendFrac * 0.30)).toFixed(3);
  const composerGlassAlpha = Math.max(0.30, Math.min(0.46, 0.44 - blendFrac * 0.35)).toFixed(3);
  const bubbleGlassAlpha = Math.max(0.46, Math.min(0.66, 0.62 - blendFrac * 0.28)).toFixed(3);
  const popupGlassAlpha = Math.max(0.64, Math.min(0.84, 1 - blendFrac * 0.92)).toFixed(3);
  const safeUrl = wallpaperDataUri ? `url("${wallpaperDataUri}")` : 'none';

  const canvasLum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
  const isLightPalette = canvasLum > 0.55;
  const liteCardAlpha = Math.max(0.84, Math.min(0.94, 0.90 - blendFrac * 0.14)).toFixed(3);
  const liteBubbleAlpha = Math.max(0.86, Math.min(0.95, 0.92 - blendFrac * 0.12)).toFixed(3);
  const litePopupAlpha = Math.max(0.91, Math.min(0.95, 0.95 - blendFrac * 0.06)).toFixed(3);
  const liteStickyAlpha = Math.max(0.88, Math.min(0.95, 0.93 - blendFrac * 0.08)).toFixed(3);

  const liteVarsBlock = liteMode
    ? `
:root {
  --agy-wp-url: ${safeUrl};
  --agy-host-canvas-bg: rgb(${cr}, ${cg}, ${cb});
  --agy-host-veil-bg: rgba(${cr}, ${cg}, ${cb}, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(${chr}, ${chg}, ${chb}, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(${br}, ${bg}, ${bb}, ${softSurfaceAlpha});
  --agy-lite-card-bg: rgba(${br}, ${bg}, ${bb}, ${liteCardAlpha});
  --agy-lite-bubble-bg: rgba(${br}, ${bg}, ${bb}, ${liteBubbleAlpha});
  --agy-lite-popup-bg: rgba(${chr}, ${chg}, ${chb}, ${litePopupAlpha});
  --agy-lite-sticky-bg: rgba(${cr}, ${cg}, ${cb}, ${liteStickyAlpha});
  --agy-lite-sticky-sidebar-bg: rgba(${chr}, ${chg}, ${chb}, ${liteStickyAlpha});
  --agy-lite-border: ${isLightPalette ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.12)'};
  --agy-lite-highlight: ${isLightPalette ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.10)'};
}

${
  isLightPalette
    ? `html.dark,
html[data-theme="dark"],
body.dark,
body[data-theme="dark"],
body[data-agy-theme].dark {
  --agy-host-canvas-bg: rgb(16, 18, 24);
  --agy-host-veil-bg: rgba(16, 18, 24, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(20, 22, 29, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(30, 33, 44, ${softSurfaceAlpha});
  --agy-lite-card-bg: rgba(24, 26, 34, 0.90);
  --agy-lite-bubble-bg: rgba(30, 33, 44, 0.92);
  --agy-lite-popup-bg: rgba(20, 22, 29, 0.95);
  --agy-lite-sticky-bg: rgba(16, 18, 24, 0.93);
  --agy-lite-sticky-sidebar-bg: rgba(20, 22, 29, 0.93);
  --agy-lite-border: rgba(255, 255, 255, 0.12);
  --agy-lite-highlight: rgba(255, 255, 255, 0.10);
}`
    : `html.light,
html[data-theme="light"],
body.light,
body[data-theme="light"],
body[data-agy-theme="light"] {
  --agy-host-canvas-bg: rgb(248, 250, 252);
  --agy-host-veil-bg: rgba(248, 250, 252, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(241, 245, 249, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(226, 232, 240, ${softSurfaceAlpha});
  --agy-lite-card-bg: rgba(248, 250, 252, 0.92);
  --agy-lite-bubble-bg: rgba(241, 245, 249, 0.94);
  --agy-lite-popup-bg: rgba(255, 255, 255, 0.95);
  --agy-lite-sticky-bg: rgba(248, 250, 252, 0.94);
  --agy-lite-sticky-sidebar-bg: rgba(241, 245, 249, 0.94);
  --agy-lite-border: rgba(15, 23, 42, 0.14);
  --agy-lite-highlight: rgba(255, 255, 255, 0.72);
}`
}
`
    : `
:root {
  --agy-wp-url: ${safeUrl};
  --agy-host-canvas-bg: rgb(${cr}, ${cg}, ${cb});
  --agy-host-veil-bg: rgba(${cr}, ${cg}, ${cb}, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(${chr}, ${chg}, ${chb}, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(${br}, ${bg}, ${bb}, ${softSurfaceAlpha});
  --agy-host-card-bg: rgba(${br}, ${bg}, ${bb}, ${composerGlassAlpha});
  --agy-host-bubble-bg: rgba(${br}, ${bg}, ${bb}, ${bubbleGlassAlpha});
  --agy-host-popup-bg: rgba(${chr}, ${chg}, ${chb}, ${popupGlassAlpha});
  --agy-host-sticky-sidebar-veil: linear-gradient(rgba(${chr}, ${chg}, ${chb}, ${sidebarTintAlpha}), rgba(${chr}, ${chg}, ${chb}, ${sidebarTintAlpha})), rgba(${cr}, ${cg}, ${cb}, ${totalVeilAlpha});
}

${
  isLightPalette
    ? `html.dark,
html[data-theme="dark"],
body.dark,
body[data-theme="dark"],
body[data-agy-theme].dark {
  --agy-host-canvas-bg: rgb(16, 18, 24);
  --agy-host-veil-bg: rgba(16, 18, 24, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(20, 22, 29, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(30, 33, 44, ${softSurfaceAlpha});
  --agy-host-card-bg: rgba(24, 26, 34, ${composerGlassAlpha});
  --agy-host-bubble-bg: rgba(30, 33, 44, ${bubbleGlassAlpha});
  --agy-host-popup-bg: rgba(20, 22, 29, ${popupGlassAlpha});
  --agy-host-sticky-sidebar-veil: linear-gradient(rgba(20, 22, 29, ${sidebarTintAlpha}), rgba(20, 22, 29, ${sidebarTintAlpha})), rgba(16, 18, 24, ${totalVeilAlpha});
}`
    : `html.light,
html[data-theme="light"],
body.light,
body[data-theme="light"],
body[data-agy-theme="light"] {
  --agy-host-canvas-bg: rgb(248, 250, 252);
  --agy-host-veil-bg: rgba(248, 250, 252, ${totalVeilAlpha});
  --agy-host-sidebar-bg: rgba(241, 245, 249, ${sidebarTintAlpha});
  --agy-host-soft-bg: rgba(226, 232, 240, ${softSurfaceAlpha});
  --agy-host-card-bg: rgba(248, 250, 252, ${composerGlassAlpha});
  --agy-host-bubble-bg: rgba(241, 245, 249, ${bubbleGlassAlpha});
  --agy-host-popup-bg: rgba(255, 255, 255, ${popupGlassAlpha});
  --agy-host-sticky-sidebar-veil: linear-gradient(rgba(241, 245, 249, ${sidebarTintAlpha}), rgba(241, 245, 249, ${sidebarTintAlpha})), rgba(248, 250, 252, ${totalVeilAlpha});
}`
}
`;

  const cardSurfaceBg = liteMode ? 'var(--agy-lite-card-bg)' : 'var(--agy-host-card-bg)';
  const bubbleSurfaceBg = liteMode ? 'var(--agy-lite-bubble-bg)' : 'var(--agy-host-bubble-bg)';
  const popupSurfaceBg = liteMode ? 'var(--agy-lite-popup-bg)' : 'var(--agy-host-popup-bg)';

  const composerSurfaceBlock = liteMode
    ? `.surface-composer-card,
[data-agy-mon-layer="composer"] {
  background-color: ${cardSurfaceBg} !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: inset 0 1px 0 var(--agy-lite-highlight), 0 0 0 1px var(--agy-lite-border) !important;
}

.agy-user-bubble {
  background-color: ${bubbleSurfaceBg} !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: inset 0 1px 0 var(--agy-lite-highlight), 0 0 0 1px var(--agy-lite-border) !important;
}

/* Crisp High-Contrast Cards (Lite Mode — zero backdrop-filter blur) */
.bg-card,
.surface-opaque,
.surface-glass,
[role="region"][aria-label="Queued messages"] {
  background-color: ${cardSurfaceBg} !important;
  background-image: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: inset 0 1px 0 var(--agy-lite-highlight), 0 0 0 1px var(--agy-lite-border) !important;
}`
    : `.surface-composer-card,
[data-agy-mon-layer="composer"] {
  background-color: ${cardSurfaceBg} !important;
  background-image: none !important;
  backdrop-filter: blur(20px) saturate(145%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(145%) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
}

.agy-user-bubble {
  background-color: ${bubbleSurfaceBg} !important;
  backdrop-filter: blur(12px) saturate(125%) !important;
  -webkit-backdrop-filter: blur(12px) saturate(125%) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
}

/* Frosted-Glass Cards: Queued Messages, Approval/Permission Cards, Settings Cards & Inline Panels */
.bg-card,
.surface-opaque,
.surface-glass,
[role="region"][aria-label="Queued messages"] {
  background-color: ${cardSurfaceBg} !important;
  background-image: none !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
}`;

  const stickyHeadersBlock = liteMode
    ? `/* Clean solid/semi-transparent sticky header occlusion (Lite Mode — zero fixed-attachment wallpaper blur) */
.sticky.bg-background:not(.pointer-events-none),
.sticky.bg-shell:not(.pointer-events-none),
div.sticky.bg-secondary:not(.pointer-events-none),
.bg-background[style*="sticky"]:not(.pointer-events-none),
[data-agy-mon-layer="sticky-main"] {
  background-color: var(--agy-lite-sticky-bg) !important;
  background-image: none !important;
  filter: none !important;
  isolation: isolate !important;
}

[role="navigation"] .bg-sidebar[style*="sticky"],
[role="navigation"] .sticky.bg-sidebar,
[role="navigation"] .sticky.bg-background,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"] {
  background-color: var(--agy-lite-sticky-sidebar-bg) !important;
  background-image: none !important;
  filter: none !important;
  isolation: isolate !important;
}

.sticky.bg-background:not(.pointer-events-none)::before,
.sticky.bg-shell:not(.pointer-events-none)::before,
div.sticky.bg-secondary:not(.pointer-events-none)::before,
.bg-background[style*="sticky"]:not(.pointer-events-none)::before,
[data-agy-mon-layer="sticky-main"]::before,
[role="navigation"] .bg-sidebar[style*="sticky"]::before,
[role="navigation"] .sticky.bg-sidebar::before,
[role="navigation"] .sticky.bg-background::before,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"]::before {
  content: none !important;
  background-image: none !important;
  filter: none !important;
}

.sticky.bg-background:not(.pointer-events-none)::after,
.sticky.bg-shell:not(.pointer-events-none)::after,
div.sticky.bg-secondary:not(.pointer-events-none)::after,
.bg-background[style*="sticky"]:not(.pointer-events-none)::after,
[data-agy-mon-layer="sticky-main"]::after,
[role="navigation"] .bg-sidebar[style*="sticky"]::after,
[role="navigation"] .sticky.bg-sidebar::after,
[role="navigation"] .sticky.bg-background::after,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"]::after {
  content: none !important;
  background-image: none !important;
  filter: none !important;
}`
    : `/* Seamless viewport-aligned wallpaper occlusion for ALL sticky headers (Projects sidebar, Customizations, Automations, Settings, Diff):
   completely blocks scrolled items underneath while aligning 1:1 pixel-for-pixel with the continuous full-window wallpaper
   without clipping host containers (blur bleed is trimmed strictly on ::before via clip-path)! */
.sticky.bg-background:not(.pointer-events-none),
.sticky.bg-shell:not(.pointer-events-none),
div.sticky.bg-secondary:not(.pointer-events-none),
.bg-background[style*="sticky"]:not(.pointer-events-none),
[data-agy-mon-layer="sticky-main"],
[role="navigation"] .bg-sidebar[style*="sticky"],
[role="navigation"] .sticky.bg-sidebar,
[role="navigation"] .sticky.bg-background,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"] {
  background-color: var(--agy-host-canvas-bg) !important;
  isolation: isolate !important;
}

.sticky.bg-background:not(.pointer-events-none)::before,
.sticky.bg-shell:not(.pointer-events-none)::before,
div.sticky.bg-secondary:not(.pointer-events-none)::before,
.bg-background[style*="sticky"]:not(.pointer-events-none)::before,
[data-agy-mon-layer="sticky-main"]::before,
[role="navigation"] .bg-sidebar[style*="sticky"]::before,
[role="navigation"] .sticky.bg-sidebar::before,
[role="navigation"] .sticky.bg-background::before,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"]::before {
  content: "" !important;
  position: absolute !important;
  inset: ${blur > 0 ? '-16px' : '0'} !important;
  ${blur > 0 ? 'clip-path: inset(16px) !important;' : ''}
  z-index: -2 !important;
  pointer-events: none !important;
  background-image: var(--agy-wp-url) !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: ${fit} !important;
  background-attachment: fixed !important;
  opacity: ${wpOpacity} !important;
  filter: ${blur > 0 ? `blur(${blur}px)` : 'none'} !important;
}

.sticky.bg-background:not(.pointer-events-none)::after,
.sticky.bg-shell:not(.pointer-events-none)::after,
div.sticky.bg-secondary:not(.pointer-events-none)::after,
.bg-background[style*="sticky"]:not(.pointer-events-none)::after,
[data-agy-mon-layer="sticky-main"]::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background: var(--agy-host-veil-bg) !important;
}

[role="navigation"] .bg-sidebar[style*="sticky"]::after,
[role="navigation"] .sticky.bg-sidebar::after,
[role="navigation"] .sticky.bg-background::after,
[role="navigation"] [data-agy-mon-layer="sticky-sidebar"]::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background: var(--agy-host-sticky-sidebar-veil) !important;
}`;

  const popupSurfaceBlock = liteMode
    ? `/* Crisp high-contrast popups, dropdowns, dialogs, menus, hover widgets, and tooltips (Lite Mode — zero backdrop-filter blur) */
[role="dialog"],
[role="alertdialog"],
[role="menu"],
[role="listbox"],
[role="tooltip"],
[data-radix-popper-content-wrapper] > *,
[data-sonner-toast],
.monaco-hover,
.suggest-widget,
.quick-input-widget,
.agy-fastpick,
.context-view .monaco-menu {
  background-color: ${popupSurfaceBg} !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: inset 0 1px 0 var(--agy-lite-highlight), 0 0 0 1px var(--agy-lite-border), 0 10px 28px rgba(0, 0, 0, 0.30) !important;
}`
    : `/* Translucent frosted-glass popups, dropdowns, dialogs, menus, hover widgets, and tooltips (matches Scheme 1 depth with 100% crisp text) */
[role="dialog"],
[role="alertdialog"],
[role="menu"],
[role="listbox"],
[role="tooltip"],
[data-radix-popper-content-wrapper] > *,
[data-sonner-toast],
.monaco-hover,
.suggest-widget,
.quick-input-widget,
.agy-fastpick,
.context-view .monaco-menu {
  background-color: ${popupSurfaceBg} !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.38) !important;
}`;

  return `
/* Antigravity Monitor · Crisp Pure-CSS Wallpaper (Scheme 2 CDP / Scheme 3 Persistent Inject${liteMode ? ' · Lite Mode' : ''}) */
${liteVarsBlock.trim()}

:root,
body,
body[data-agy-theme],
body[data-agy-theme].dark,
.dark .agy-inset-shell,
body[data-agy-theme] .agy-inset-shell {
  --background: transparent !important;
  --color-background: transparent !important;
  --shell: transparent !important;
  --color-shell: transparent !important;
  --shell-canvas: transparent !important;
  --sidebar: transparent !important;
  --color-sidebar: transparent !important;
  --onyx-frame: transparent !important;
  --card: ${cardSurfaceBg} !important;
  --color-card: ${cardSurfaceBg} !important;
  --glass: ${cardSurfaceBg} !important;
  --onyx-raised: ${cardSurfaceBg} !important;
  --onyx-selected: var(--agy-host-soft-bg) !important;
  --popover: ${popupSurfaceBg} !important;
  --color-popover: ${popupSurfaceBg} !important;
}

html {
  background-color: var(--agy-host-canvas-bg) !important;
  --agy-mon-accent: ${accent};
}

html::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  background-image: var(--agy-wp-url) !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: ${fit} !important;
  opacity: ${wpOpacity} !important;
  filter: ${blur > 0 ? `blur(${blur}px)` : 'none'} !important;
  transform: ${blur > 0 ? 'scale(1.04)' : 'none'} !important;
  ${liteMode ? '' : 'will-change: opacity, filter !important;'}
}

html::after {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  background: var(--agy-host-veil-bg) !important;
}

body {
  position: relative !important;
  z-index: 1 !important;
  background: transparent !important;
  background-color: transparent !important;
}

body > #root,
body > #app,
body > div:first-of-type {
  background-color: transparent !important;
}

/* Workbench & WSL Remote shell surfaces (clears stubborn opaque light/dark chrome panels) */
.monaco-workbench,
.monaco-workbench .part,
.monaco-workbench .part > .content,
.monaco-workbench .part.titlebar,
.monaco-workbench .part.statusbar,
.monaco-workbench .part.activitybar,
.monaco-workbench .part.panel,
.monaco-workbench .part.editor > .content .editor-group-container,
.monaco-workbench .part.editor > .content .editor-group-container > .title,
.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-and-actions-container,
.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container,
.monaco-workbench .part.editor > .content .editor-group-container > .title .editor-actions,
.monaco-workbench .part.editor > .content .editor-group-container > .editor-container,
.monaco-editor,
.monaco-editor-background,
.monaco-editor .margin,
.monaco-editor .inputarea.ime-input,
.monaco-pane-view .pane > .pane-header,
.monaco-list .monaco-list-rows,
.breadcrumbs-control {
  background-color: transparent !important;
  background-image: none !important;
}

.monaco-workbench .part.sidebar,
.monaco-workbench .part.auxiliarybar {
  background-color: var(--agy-host-sidebar-bg) !important;
}

.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active {
  background-color: var(--agy-host-soft-bg) !important;
}

/* Antigravity 2.0 Sidebar, Top Bar, File Tree & Project List Rows (zero opaque black panels/items) */
.bg-background,
.bg-sidebar,
[role="navigation"].bg-sidebar,
[role="navigation"] .bg-sidebar {
  background-color: transparent !important;
  background-image: none !important;
}

[role="navigation"].bg-sidebar {
  background-color: var(--agy-host-sidebar-bg) !important;
}

[role="navigation"] .bg-sidebar button,
[role="navigation"] button.bg-sidebar {
  background-color: transparent !important;
  background-image: none !important;
}

[role="navigation"] .bg-sidebar button:hover,
[role="navigation"] button.bg-sidebar:hover {
  background-color: rgba(255, 255, 255, 0.06) !important;
}

/* Frosted-Glass Composer Input (毛玻璃输入框) & User Chat Bubbles */
.surface-composer,
#antigravity\\.agentSidePanelInputBox {
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12), 0 10px 30px rgba(0, 0, 0, 0.28) !important;
}

${composerSurfaceBlock}

/* Clear bottom/top scroll fade gradient scrims above composer & lists */
.pointer-events-none[style*="linear-gradient"],
[data-agy-mon-layer="scrim-clear"] {
  background-image: none !important;
  background-color: transparent !important;
}

/* Seamless transparent pass-through for AGY Console sidecar iframe */
iframe[src*="agy-monitor"],
div:has(> iframe[src*="agy-monitor"]),
div:has(> div > iframe[src*="agy-monitor"]),
div:has(> div > div > iframe[src*="agy-monitor"]) {
  background-color: transparent !important;
  background: transparent !important;
}

/* Auto-discovered opaque structural shell containers (zero stacked double veils) */
[data-agy-mon-layer="transparent"] {
  background-color: transparent !important;
  background-image: none !important;
}

[data-agy-mon-layer="sidebar"] {
  background-color: var(--agy-host-sidebar-bg) !important;
  background-image: none !important;
}

[data-agy-mon-layer="surface-soft"] {
  background-color: var(--agy-host-soft-bg) !important;
  background-image: none !important;
}

${stickyHeadersBlock}

thead.sticky,
thead.sticky th,
th.sticky {
  background-color: ${popupSurfaceBg} !important;
}

${popupSurfaceBlock}
`.trim();
}

export { buildHostWallpaperCss as buildWallpaperCss };

export function buildNativeWallpaperEngineScript() {
  return `(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var VERSION = ${JSON.stringify(NATIVE_HUD_VERSION)};
  var STYLE_ID = ${JSON.stringify(HOST_WALLPAPER_STYLE_ID)};
  if (window.__agyMonitorWallpaper && window.__agyMonitorWallpaper.version === VERSION) {
    return;
  }

  function ensureLayerEngine() {
    if (window.__agyMonLayerEngine && window.__agyMonLayerEngine.version !== 6) {
      try { window.__agyMonLayerEngine.stop(); } catch (e) {}
    }
    if (!window.__agyMonLayerEngine) {
      var probeCtx = null;
      function parseBgRgba(raw) {
        if (!raw || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return null;
        var m = /^rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:\\s*[,/]\\s*([\\d.]+%?))?\\s*\\)$/i.exec(raw);
        if (m) {
          var a = 1;
          if (m[4] !== undefined) {
            a = m[4].indexOf('%') >= 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
          }
          return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: a };
        }
        var cs = /^color\\(\\s*srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+%?))?\\s*\\)$/i.exec(raw);
        if (cs) {
          var ca = 1;
          if (cs[4] !== undefined) {
            ca = cs[4].indexOf('%') >= 0 ? parseFloat(cs[4]) / 100 : parseFloat(cs[4]);
          }
          return {
            r: Math.round(parseFloat(cs[1]) * 255),
            g: Math.round(parseFloat(cs[2]) * 255),
            b: Math.round(parseFloat(cs[3]) * 255),
            a: ca
          };
        }
        try {
          if (!probeCtx) {
            var cv = document.createElement('canvas');
            cv.width = 1;
            cv.height = 1;
            probeCtx = cv.getContext('2d', { willReadFrequently: true });
          }
          if (probeCtx) {
            probeCtx.clearRect(0, 0, 1, 1);
            probeCtx.fillStyle = raw;
            probeCtx.fillRect(0, 0, 1, 1);
            var px = probeCtx.getImageData(0, 0, 1, 1).data;
            return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
          }
        } catch (e) {}
        return null;
      }

      var SKIP_TAGS = {
        HTML: 1, BODY: 1, SCRIPT: 1, STYLE: 1, LINK: 1, META: 1,
        SVG: 1, IMG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1,
        IFRAME: 1, WEBVIEW: 1, PRE: 1, CODE: 1, TABLE: 1,
        BUTTON: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, A: 1
      };
      var PROTECT_SEL = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"],[data-radix-popper-content-wrapper],[data-sonner-toast],.monaco-hover,.suggest-widget,.quick-input-widget,.context-view,.surface-composer,.surface-composer-card,.agy-user-bubble,pre,code,#agy-monitor-native-hud,#agy-monitor-native-hud-portal,#agy-monitor-cdp-hud';
      var LANDMARK_SEL = 'header,nav,aside,main,footer,[role="main"],[role="navigation"],[role="complementary"],[role="banner"],[role="contentinfo"],.part,.pane-body,.editor-group-container,.tabs-and-actions-container,.breadcrumbs-control,.pointer-events-none,.sticky,[style*="sticky"]';

      function evaluateNode(node, vw, vh) {
        if (!node || node.nodeType !== 1) return 0;
        if (SKIP_TAGS[node.tagName]) return 0;
        if (node.getAttribute('data-agy-mon-layer')) return 0;
        if (node.closest && node.closest(PROTECT_SEL)) return 0;

        var rect = node.getBoundingClientRect();
        if (!rect || rect.width < 44 || rect.height < 10) return 0;

        var st = window.getComputedStyle(node);
        // Protect sticky headers from being turned transparent & auto-apply viewport-aligned wallpaper mask
        if (st.position === 'sticky') {
          var inSidebarNav = Boolean(node.closest && node.closest('[role="navigation"]'));
          var maxStickyH = inSidebarNav ? 96 : 260;
          if (st.pointerEvents === 'none' || rect.width < 100 || rect.height < 18 || rect.height > maxStickyH) return 0;
          if (node.tagName === 'THEAD' || node.tagName === 'TH' || node.tagName === 'TR') return 0;
          if (inSidebarNav && node.querySelector && node.querySelector('[data-testid="project-header"], [role="tree"], [role="list"]')) return 0;
          if (node.parentElement && node.parentElement.closest('[data-agy-mon-layer="sticky-main"], [data-agy-mon-layer="sticky-sidebar"]')) return 0;
          node.setAttribute('data-agy-mon-layer', inSidebarNav ? 'sticky-sidebar' : 'sticky-main');
          return 1;
        }
        var bg = parseBgRgba(st.backgroundColor);
        var hasGradientBg = Boolean(st.backgroundImage && st.backgroundImage.indexOf('gradient(') >= 0);

        // Strip neutral dark/light scroll fade-out scrim overlays (e.g. dark shadow band above composer)
        if (st.pointerEvents === 'none' && hasGradientBg && rect.width >= 100 && rect.height <= 200) {
          node.setAttribute('data-agy-mon-layer', 'scrim-clear');
          return 1;
        }

        if (rect.height < 20) return 0;
        if ((!bg || bg.a < 0.35) && !hasGradientBg) return 0;

        if (bg && bg.a >= 0.35) {
          var chroma = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
          if (chroma > 52) return 0;
        }

        var isLeftSidebar =
          rect.left <= 56 &&
          rect.width >= 44 &&
          rect.width <= Math.min(440, vw * 0.40) &&
          rect.height >= vh * 0.34;
        var isRightSidebar =
          rect.right >= vw - 56 &&
          rect.width >= 44 &&
          rect.width <= Math.min(460, vw * 0.42) &&
          rect.height >= vh * 0.34;
        var isTopBar =
          rect.top <= 130 &&
          rect.height <= 116 &&
          rect.width >= Math.min(180, vw * 0.22);
        var isBottomBar =
          rect.bottom >= vh - 48 &&
          rect.height <= Math.max(120, vh * 0.42) &&
          rect.width >= Math.min(180, vw * 0.22);
        var isMainPane =
          rect.width >= Math.min(180, vw * 0.16) &&
          rect.height >= Math.min(120, vh * 0.16);

        if (isLeftSidebar || isRightSidebar) {
          var hasSidebarAnc = node.parentElement && node.parentElement.closest('[data-agy-mon-layer="sidebar"]');
          if (hasSidebarAnc) {
            node.setAttribute('data-agy-mon-layer', 'transparent');
          } else {
            node.setAttribute('data-agy-mon-layer', 'sidebar');
            try {
              var nestedSidebars = node.querySelectorAll('[data-agy-mon-layer="sidebar"]');
              for (var nsi = 0; nsi < nestedSidebars.length; nsi++) {
                nestedSidebars[nsi].setAttribute('data-agy-mon-layer', 'transparent');
              }
            } catch (e) {}
          }
          return 1;
        }
        if (isTopBar || isBottomBar || isMainPane) {
          node.setAttribute('data-agy-mon-layer', 'transparent');
          return 1;
        }
        return 0;
      }

      var isWpComposing = false;
      var onWpCompStart = function () { isWpComposing = true; };
      var onWpCompEnd = function () {
        if (!isWpComposing) return;
        isWpComposing = false;
        if (mutPending) scheduleMutScan();
      };
      window.addEventListener('compositionstart', onWpCompStart, true);
      window.addEventListener('compositionend', onWpCompEnd, true);
      window.addEventListener('blur', onWpCompEnd);

      function scanLayers() {
        if (document.hidden || isWpComposing) return 0;
        var vw = window.innerWidth || 0;
        var vh = window.innerHeight || 0;
        if (vw < 300 || vh < 200) return 0;
        var xs = [
          12, Math.floor(vw * 0.14), Math.floor(vw * 0.34),
          Math.floor(vw * 0.56), Math.floor(vw * 0.78), Math.max(0, vw - 16)
        ];
        var ys = [
          16, 64, Math.floor(vh * 0.28), Math.floor(vh * 0.52),
          Math.floor(vh * 0.76), Math.max(0, vh - 16)
        ];
        var seen = new Set();
        var tagged = 0;
        for (var xi = 0; xi < xs.length; xi++) {
          for (var yi = 0; yi < ys.length; yi++) {
            var stack = document.elementsFromPoint(xs[xi], ys[yi]);
            for (var si = stack.length - 1; si >= 0; si--) {
              var node = stack[si];
              if (!node || seen.has(node)) continue;
              seen.add(node);
              tagged += evaluateNode(node, vw, vh);
            }
          }
        }
        try {
          var landmarks = document.querySelectorAll(LANDMARK_SEL);
          for (var li = 0; li < landmarks.length; li++) {
            var lm = landmarks[li];
            if (!lm || seen.has(lm)) continue;
            seen.add(lm);
            tagged += evaluateNode(lm, vw, vh);
          }
        } catch (e) {}
        try {
          var agyFrames = document.querySelectorAll('iframe[src*="agy-monitor"]');
          for (var fi = 0; fi < agyFrames.length; fi++) {
            var cur = agyFrames[fi].parentElement;
            for (var depth = 0; depth < 4 && cur && cur !== document.body; depth++) {
              if (!cur.getAttribute('data-agy-mon-layer')) {
                cur.setAttribute('data-agy-mon-layer', 'transparent');
                tagged += 1;
              }
              cur = cur.parentElement;
            }
          }
        } catch (e) {}
        return tagged;
      }

      var MUT_THROTTLE_MS = 350;
      var timer = setInterval(scanLayers, 3000);
      var resizeTimer = null;
      var onResize = function () {
        if (document.hidden) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          resizeTimer = null;
          scanLayers();
        }, 120);
      };
      window.addEventListener('resize', onResize, { passive: true });

      var mutTimer = null;
      var mutIdleId = 0;
      var mutPending = false;
      var lastMutScanAt = 0;
      function runDeferredMutScan() {
        mutIdleId = 0;
        if (document.hidden || isWpComposing) {
          mutPending = true;
          return;
        }
        mutPending = false;
        lastMutScanAt = Date.now();
        scanLayers();
        if (mutPending && !mutTimer && !mutIdleId) {
          mutTimer = setTimeout(flushMutScan, MUT_THROTTLE_MS);
        }
      }
      function flushMutScan() {
        mutTimer = null;
        if (document.hidden || isWpComposing) {
          mutPending = true;
          return;
        }
        if (typeof requestIdleCallback === 'function') {
          if (!mutIdleId) {
            mutIdleId = requestIdleCallback(runDeferredMutScan, { timeout: 600 });
          }
          return;
        }
        runDeferredMutScan();
      }
      function scheduleMutScan() {
        if (document.hidden || isWpComposing) {
          mutPending = true;
          return;
        }
        mutPending = true;
        if (mutTimer || mutIdleId) return;
        var elapsed = Date.now() - lastMutScanAt;
        var wait = elapsed >= MUT_THROTTLE_MS ? MUT_THROTTLE_MS : Math.max(50, MUT_THROTTLE_MS - elapsed);
        mutTimer = setTimeout(flushMutScan, wait);
      }

      var onVisibilityChange = function () {
        if (document.hidden) {
          if (mutTimer) {
            clearTimeout(mutTimer);
            mutTimer = null;
            mutPending = true;
          }
          if (mutIdleId && typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(mutIdleId);
            mutIdleId = 0;
            mutPending = true;
          }
          if (resizeTimer) {
            clearTimeout(resizeTimer);
            resizeTimer = null;
          }
          return;
        }
        mutPending = false;
        lastMutScanAt = Date.now();
        scanLayers();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      var layerObserver = null;
      var COMPOSER_SKIP_SEL = 'textarea,input,[contenteditable="true"],.surface-composer,.surface-composer-card';
      if (typeof MutationObserver === 'function' && document.body) {
        layerObserver = new MutationObserver(function (muts) {
          if (isWpComposing) return;
          if (Array.isArray(muts) && muts.length > 0) {
            var hasOuterMutation = false;
            for (var mi = 0; mi < muts.length; mi++) {
              var tgt = muts[mi] && muts[mi].target;
              var el = tgt && tgt.nodeType === 1 ? tgt : (tgt && tgt.parentElement);
              if (!el || !el.closest || !el.closest(COMPOSER_SKIP_SEL)) {
                hasOuterMutation = true;
                break;
              }
            }
            if (!hasOuterMutation) return;
          }
          scheduleMutScan();
        });
        layerObserver.observe(document.body, { childList: true, subtree: true });
      }

      window.__agyMonLayerEngine = {
        version: 6,
        throttleMs: MUT_THROTTLE_MS,
        scan: scanLayers,
        stop: function () {
          clearInterval(timer);
          if (mutTimer) { clearTimeout(mutTimer); mutTimer = null; }
          if (mutIdleId && typeof cancelIdleCallback === 'function') { cancelIdleCallback(mutIdleId); mutIdleId = 0; }
          if (resizeTimer) { clearTimeout(resizeTimer); resizeTimer = null; }
          mutPending = false;
          if (layerObserver) { layerObserver.disconnect(); layerObserver = null; }
          window.removeEventListener('compositionstart', onWpCompStart, true);
          window.removeEventListener('compositionend', onWpCompEnd, true);
          window.removeEventListener('blur', onWpCompEnd);
          window.removeEventListener('resize', onResize);
          document.removeEventListener('visibilitychange', onVisibilityChange);
          var nodes = document.querySelectorAll('[data-agy-mon-layer]');
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].removeAttribute('data-agy-mon-layer');
          }
          delete window.__agyMonLayerEngine;
        }
      };
    }
    window.__agyMonLayerEngine.scan();
  }

  window.__agyMonitorWallpaper = {
    version: VERSION,
    apply: function (cssText) {
      if (!cssText) return this.remove();
      var el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        (document.head || document.documentElement).appendChild(el);
      }
      if (el.textContent !== cssText) {
        el.textContent = cssText;
      }
      ensureLayerEngine();
      return true;
    },
    remove: function () {
      if (window.__agyMonLayerEngine && typeof window.__agyMonLayerEngine.stop === 'function') {
        try { window.__agyMonLayerEngine.stop(); } catch (e) {}
      }
      var el = document.getElementById(STYLE_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return true;
    },
    isApplied: function () {
      var el = document.getElementById(STYLE_ID);
      return Boolean(el && el.textContent && el.textContent.length > 0);
    }
  };
})();`;
}

function resolveWallpaperFilePathForThemes(paths = {}, themes = {}) {
  const wpId = typeof themes?.activeWallpaperId === 'string' ? themes.activeWallpaperId.trim() : '';
  if (!wpId) return '';
  if (/^wp-\d+$/i.test(wpId) && paths?.wallpapersDir) {
    return path.join(paths.wallpapersDir, `${path.basename(wpId)}.webp`);
  }
  if (Array.isArray(themes?.customWallpapers) && paths?.customWallpapersDir) {
    const match = themes.customWallpapers.find((w) => w && w.id === wpId && w.filename);
    if (match) {
      return path.join(paths.customWallpapersDir, path.basename(match.filename));
    }
  }
  return '';
}

async function writeTextIfChanged(filePath, content, { sig = '', inputSig = '' } = {}) {
  const text = String(content ?? '');
  const expectedBytes = Buffer.byteLength(text, 'utf8');
  const effectiveSig = sig || sha256Text(text);
  const prev = stagedFileSignatures.get(filePath);
  if (prev && prev.sig === effectiveSig && prev.size === expectedBytes) {
    const st = await fsp.stat(filePath).catch(() => null);
    if (st && st.isFile() && st.size === expectedBytes) {
      if (inputSig && prev.inputSig !== inputSig) {
        setBoundedMap(stagedFileSignatures, filePath, { ...prev, inputSig }, STAGED_SIGNATURE_CACHE_MAX);
      }
      return { written: false, bytes: expectedBytes };
    }
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
  await atomicWriteText(filePath, text);
  setBoundedMap(
    stagedFileSignatures,
    filePath,
    { sig: effectiveSig, size: expectedBytes, inputSig: inputSig || '' },
    STAGED_SIGNATURE_CACHE_MAX,
  );
  return { written: true, bytes: expectedBytes };
}

function buildWallpaperCssInputSignature(themes = {}, filePath = '', st = null, liteMode = false) {
  const colors = themes?.colors && typeof themes.colors === 'object' ? themes.colors : {};
  return sha256Text(
    JSON.stringify({
      v: NATIVE_HUD_VERSION,
      liteMode: Boolean(liteMode),
      filePath,
      mtimeMs: st ? st.mtimeMs : 0,
      size: st ? st.size : 0,
      opacity: clampWpInt(themes?.opacity, 0, 100, 32),
      blur: clampWpInt(themes?.blur, 0, 24, 4),
      dim: clampWpInt(themes?.dim, 0, 85, 52),
      hostBlendPct: clampWpInt(themes?.hostBlendPct, 5, 42, 18),
      fit: themes?.fit === 'contain' ? 'contain' : 'cover',
      canvas: typeof colors.canvas === 'string' ? colors.canvas : '',
      chrome: typeof colors.chrome === 'string' ? colors.chrome : '',
      bubble: typeof colors.bubble === 'string' ? colors.bubble : '',
      accent: typeof colors.accent === 'string' ? colors.accent : '',
    }),
  );
}

export async function resolveWallpaperDataUriForThemes(paths = {}, themes = {}) {
  const filePath = resolveWallpaperFilePathForThemes(paths, themes);
  if (!filePath) {
    clearWallpaperBase64Cache();
    return '';
  }

  try {
    const st = await fsp.stat(filePath);
    if (
      filePath === cachedStagedWpPath &&
      st.mtimeMs === cachedStagedWpMtime &&
      st.size === cachedStagedWpSize &&
      cachedStagedWpUri
    ) {
      return cachedStagedWpUri;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = WP_EXT_TO_MIME.get(ext) || 'image/webp';
    const buf = await fsp.readFile(filePath);
    cachedStagedWpPath = filePath;
    cachedStagedWpMtime = st.mtimeMs;
    cachedStagedWpSize = st.size;
    cachedStagedWpUri = `data:${mime};base64,${buf.toString('base64')}`;
    return cachedStagedWpUri;
  } catch {
    clearWallpaperBase64Cache();
    return '';
  }
}

export async function stageLiveWallpaperCss(paths = {}, themes = {}, options = {}) {
  if (!paths?.pluginDataDir) return { staged: false, hasCss: false, skipped: false };
  const liteMode = Boolean(options?.liteMode ?? themes?.liteMode);
  const cssFile = paths.nativeWallpaperCssFile || path.join(paths.pluginDataDir, 'native_wallpaper.css');
  const engineFile = paths.nativeWallpaperEngineFile || path.join(paths.pluginDataDir, 'native_wallpaper_engine.js');
  const engineSrc = buildNativeWallpaperEngineScript();
  await writeTextIfChanged(engineFile, engineSrc, { sig: sha256Text(engineSrc) }).catch(() => {});

  const mode = themes?.hostThemeMode === 'cdp' || themes?.hostThemeMode === 'backdrop' ? themes.hostThemeMode : 'inject';
  const wantInjectCss = mode === 'inject' && themes?.backdropEnabled !== false && Boolean(themes?.activeWallpaperId);
  if (!wantInjectCss) {
    clearWallpaperBase64Cache();
    const res = await writeTextIfChanged(cssFile, '', { sig: EMPTY_CONTENT_SIG, inputSig: 'empty' }).catch(() => ({
      written: false,
      bytes: 0,
    }));
    return { staged: true, hasCss: false, skipped: !res.written };
  }

  const wpFilePath = resolveWallpaperFilePathForThemes(paths, themes);
  if (!wpFilePath) {
    clearWallpaperBase64Cache();
    const res = await writeTextIfChanged(cssFile, '', { sig: EMPTY_CONTENT_SIG, inputSig: 'empty' }).catch(() => ({
      written: false,
      bytes: 0,
    }));
    return { staged: true, hasCss: false, skipped: !res.written };
  }

  const wpStat = await fsp.stat(wpFilePath).catch(() => null);
  if (!wpStat || !wpStat.isFile()) {
    clearWallpaperBase64Cache();
    const res = await writeTextIfChanged(cssFile, '', { sig: EMPTY_CONTENT_SIG, inputSig: 'empty' }).catch(() => ({
      written: false,
      bytes: 0,
    }));
    return { staged: true, hasCss: false, skipped: !res.written };
  }

  const wpInputSig = buildWallpaperCssInputSignature(themes, wpFilePath, wpStat, liteMode);
  const prevCss = stagedFileSignatures.get(cssFile);
  if (prevCss && prevCss.inputSig === wpInputSig) {
    const cssStat = await fsp.stat(cssFile).catch(() => null);
    if (cssStat && cssStat.isFile() && cssStat.size === prevCss.size) {
      return { staged: true, hasCss: true, bytes: prevCss.size, skipped: true };
    }
  }

  const dataUri = await resolveWallpaperDataUriForThemes(paths, themes);
  if (!dataUri) {
    clearWallpaperBase64Cache();
    const res = await writeTextIfChanged(cssFile, '', { sig: EMPTY_CONTENT_SIG, inputSig: 'empty' }).catch(() => ({
      written: false,
      bytes: 0,
    }));
    return { staged: true, hasCss: false, skipped: !res.written };
  }
  const css = buildHostWallpaperCss(themes, dataUri, { liteMode });
  const res = await writeTextIfChanged(cssFile, css, {
    sig: sha256Text(css),
    inputSig: wpInputSig,
  }).catch(() => ({ written: false, bytes: Buffer.byteLength(css, 'utf8') }));
  return { staged: true, hasCss: true, bytes: res.bytes, skipped: !res.written };
}

async function resolveGuideImageDataUri(paths) {
  const p = paths?.assetsDir ? path.join(paths.assetsDir, 'open_console_guide.jpg') : '';
  if (!p) {
    cachedGuidePath = '';
    cachedGuideMtime = -1;
    cachedGuideSize = -1;
    cachedGuideDataUri = '';
    return '';
  }
  try {
    const st = await fsp.stat(p);
    if (
      cachedGuideDataUri !== null &&
      p === cachedGuidePath &&
      st.mtimeMs === cachedGuideMtime &&
      st.size === cachedGuideSize
    ) {
      return cachedGuideDataUri;
    }
    const buf = await fsp.readFile(p);
    cachedGuidePath = p;
    cachedGuideMtime = st.mtimeMs;
    cachedGuideSize = st.size;
    cachedGuideDataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    return cachedGuideDataUri;
  } catch {
    cachedGuidePath = '';
    cachedGuideMtime = -1;
    cachedGuideSize = -1;
    cachedGuideDataUri = null;
    return '';
  }
}

// ============================================================================
// Unified Shadow DOM Native Composer HUD Renderer (shared by app.asar & CDP)
// ============================================================================

export function buildNativeHudRendererScript() {
  return `(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var VERSION = ${JSON.stringify(NATIVE_HUD_VERSION)};
  var HOST_ID = 'agy-monitor-native-hud';
  var PORTAL_ID = 'agy-monitor-native-hud-portal';
  var LEGACY_HUD_ID = 'agy-monitor-cdp-hud';
  var LEGACY_STYLE_ID = 'agy-monitor-cdp-hud-style';
  var LEGACY_POP_ID = 'agy-monitor-cdp-hud-popover';
  var LEGACY_GUIDE_ID = 'agy-monitor-cdp-hud-guide';

  // Clean up legacy light-DOM CDP HUD or older native HUD version cleanly
  if (window.__agyMonitorNativeHud && window.__agyMonitorNativeHud.version === VERSION) {
    return;
  }
  var GEN = (window.__agyMonitorNativeHudGen = (Number(window.__agyMonitorNativeHudGen) || 0) + 1);
  try {
    if (window.__agyMonitorNativeHud && typeof window.__agyMonitorNativeHud.dispose === 'function') {
      window.__agyMonitorNativeHud.dispose();
    }
  } catch (e) {}
  try {
    var staleNodes = document.querySelectorAll(
      '#' + HOST_ID + ', #' + PORTAL_ID + ', #' + LEGACY_HUD_ID + ', #' + LEGACY_STYLE_ID + ', #' + LEGACY_POP_ID + ', #' + LEGACY_GUIDE_ID
    );
    for (var si = 0; si < staleNodes.length; si++) {
      var sn = staleNodes[si];
      if (!sn) continue;
      if (typeof sn.__agyDispose === 'function') {
        try { sn.__agyDispose(); } catch (e) {}
        if (sn.parentNode) sn.parentNode.removeChild(sn);
      } else if (sn.id === HOST_ID || sn.id === PORTAL_ID) {
        sn.setAttribute('data-agy-zombie', '1');
        if (sn.shadowRoot && !sn.shadowRoot.getElementById('agy-mon-zombie-kill')) {
          var kz0 = document.createElement('style');
          kz0.id = 'agy-mon-zombie-kill';
          kz0.textContent = ':host{display:none!important;position:fixed!important;width:0!important;height:0!important;margin:0!important;pointer-events:none!important;}';
          sn.shadowRoot.appendChild(kz0);
        }
      } else if (sn.parentNode) {
        sn.parentNode.removeChild(sn);
      }
    }
  } catch (e) {}

  var RING_R = 6;
  var RING_C = 2 * Math.PI * RING_R;
  var QRING_R = 5.5;
  var QRING_C = 2 * Math.PI * QRING_R;
  var MODE_RE = /turbo|planning|fast|permission|极速|规划|快速/i;
  var MIC_RE = /microphone|voice|dictate|speech|audio|麦克风|语音/i;
  var SEND_RE = /send|stop|发送|停止/i;

  var state = {
    disposed: false,
    popoverOpen: false,
    guidePinned: false,
    guideVisible: false,
    hoverRing: false,
    hoverQuota: false,
    lastCardWidth: 0,
    data: null,
    display: { showSpeed: true, showCacheHit: true, showModel: true, showContext: true, showQuota: true, updatedAtMs: 0 },
    dirtyDisplayPatch: null
  };

  function fmtTokK(n) {
    var v = Math.max(0, Number(n) || 0);
    if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\\.0$/, '') + 'M';
    if (v >= 1000) return Math.round(v / 1000) + 'k';
    return String(Math.round(v));
  }

  function parseHexColorRgb(hex, fb) {
    if (typeof hex !== 'string') return fb;
    var s = hex.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return fb;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function fmtQuotaReset(resetMs, isFull, nowMs) {
    if (isFull) return '';
    var t = Number(resetMs) || 0;
    if (t <= 0) return '';
    var diff = t - nowMs;
    if (diff <= 0) return '即将重置';
    var mins = Math.ceil(diff / 60000);
    if (mins < 60) return mins + 'm';
    var hours = diff / 3600000;
    if (hours < 24) {
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      return m > 0 ? (h + 'h' + m + 'm') : (h + 'h');
    }
    var days = diff / 86400000;
    return days.toFixed(1).replace(/\\.0$/, '') + 'd';
  }

  function pickQuotaColor(pct) {
    if (typeof pct !== 'number' || !isFinite(pct)) return 'var(--hud-muted)';
    if (pct <= 15) return '#ef5350';
    if (pct <= 35) return '#e5a84b';
    return '#3dc2a7';
  }

  function detectRouteConvId() {
    try {
      var m = String(location.pathname || '').match(/^\\/c\\/([a-f0-9-]{36})(?:\\/|$)/i);
      return m ? m[1] : '';
    } catch (e) {
      return '';
    }
  }

  function isBadHeaderTitle(txt) {
    if (!txt || txt.length < 2 || txt.length > 120) return true;
    if (txt.indexOf('[AGY_PROGRESS') >= 0) return true;
    var low = txt.toLowerCase();
    if (low === 'antigravity' || low === 'workspace' || low === 'view' || low === 'window' || low === 'swarm' || low === 'agy 控制台') return true;
    return false;
  }

  function readActiveView() {
    var routeId = detectRouteConvId();
    var vh = window.innerHeight || 0;
    var vw = window.innerWidth || 0;
    var view = { convId: routeId, workspace: '', title: '', isNewConversation: false };
    if (vh < 240 || vw < 320) return routeId ? view : null;
    try {
      var nodes = document.querySelectorAll('header *, nav *, [role="banner"] *, button, span, div');
      var parts = [];
      for (var i = 0; i < nodes.length && parts.length < 28; i++) {
        var el = nodes[i];
        if (el.children && el.children.length > 0) continue;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length > 140) continue;
        var r = el.getBoundingClientRect();
        if (!r || r.top < 14 || r.bottom > 86 || r.left < 140 || r.right > vw - 80 || r.height > 40) continue;
        parts.push({ x: r.left, text: txt });
      }
      parts.sort(function (a, b) { return a.x - b.x; });
      for (var p = 0; p < parts.length; p++) {
        var s = parts[p].text;
        var low = s.toLowerCase();
        if (!routeId && (low === 'new conversation' || low === '新建对话')) {
          view.title = s;
          view.isNewConversation = true;
          return view;
        }
        var idx = s.indexOf(' / ');
        if (idx > 0 && idx < s.length - 3) {
          var t1 = s.slice(idx + 3).trim();
          if (!isBadHeaderTitle(t1)) {
            view.workspace = s.slice(0, idx).trim();
            view.title = t1;
            return view;
          }
        }
        if (s === '/' && p + 1 < parts.length) {
          var t2 = parts[p + 1].text;
          if (!isBadHeaderTitle(t2)) {
            view.workspace = p > 0 ? parts[p - 1].text : '';
            view.title = t2;
            return view;
          }
        }
      }
    } catch (e) {}
    return routeId ? view : null;
  }

  function findComposerAnchor() {
    try {
      // Priority 1: Native Antigravity 2.35+ .agy-composer-footer & permissions-selector-trigger
      var footers = Array.prototype.slice.call(document.querySelectorAll('.agy-composer-footer'));
      if (footers.length > 0) {
        var bestFooter = null;
        var bestBottom = -1;
        for (var fi = 0; fi < footers.length; fi++) {
          var f = footers[fi];
          if (!f || f.offsetParent === null) continue;
          var fr = f.getBoundingClientRect();
          if (!fr || fr.width < 160 || fr.height < 14) continue;
          if (fr.bottom > bestBottom) {
            bestBottom = fr.bottom;
            bestFooter = f;
          }
        }
        if (bestFooter) {
          var fRect = bestFooter.getBoundingClientRect();
          var permBtn = bestFooter.querySelector('[data-testid="permissions-selector-trigger"]');
          if (permBtn && permBtn.parentElement) {
            return { container: permBtn.parentElement, before: permBtn, footer: bestFooter, cardWidth: fRect.width };
          }
          var rightCluster = bestFooter.querySelector(':scope > div.shrink-0') || bestFooter.lastElementChild;
          if (rightCluster && rightCluster !== bestFooter.firstElementChild) {
            return { container: rightCluster, before: rightCluster.firstChild, footer: bestFooter, cardWidth: fRect.width };
          }
          return { container: bestFooter, before: null, footer: bestFooter, cardWidth: fRect.width };
        }
      }

      // Priority 2: Resilient semantic composer anchor fallback
      var vh = window.innerHeight || 0;
      var vw = window.innerWidth || 0;
      if (vh < 240 || vw < 320) return null;
      var inputs = document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]');
      var bestInput = null;
      var bestInputBottom = -1;
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].offsetParent === null) continue;
        var ir = inputs[i].getBoundingClientRect();
        if (!ir || ir.width < 160 || ir.height < 16) continue;
        if (ir.bottom < vh - 280 || ir.top > vh - 12) continue;
        if (ir.bottom > bestInputBottom) {
          bestInputBottom = ir.bottom;
          bestInput = inputs[i];
        }
      }
      if (!bestInput) return null;

      var card = bestInput;
      for (var up = 0; up < 6 && card && card.parentElement && card.parentElement !== document.body; up++) {
        card = card.parentElement;
        var cr = card.getBoundingClientRect();
        if (cr.height < 52 || cr.height > 360 || cr.width < 200) continue;
        var btns = card.querySelectorAll('button');
        if (btns.length < 3) continue;

        var modeBtn = null, micBtn = null, sendBtn = null;
        var rightRowBtns = [];
        for (var bi = 0; bi < btns.length; bi++) {
          var b = btns[bi];
          if (b.id === HOST_ID || (b.closest && b.closest('#' + HOST_ID))) continue;
          var br = b.getBoundingClientRect();
          if (!br || br.width < 14 || br.height < 14 || br.top < cr.top + cr.height * 0.35) continue;
          rightRowBtns.push({ el: b, r: br });
          var label = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim();
          if (!modeBtn && MODE_RE.test(label) && br.width <= 170) modeBtn = b;
          else if (!micBtn && MIC_RE.test(label) && br.width <= 56) micBtn = b;
          else if (!sendBtn && SEND_RE.test(label) && br.width <= 56) sendBtn = b;
        }
        if (!modeBtn && micBtn) {
          var mr = micBtn.getBoundingClientRect();
          var mcy = (mr.top + mr.bottom) / 2;
          for (var ri = 0; ri < rightRowBtns.length; ri++) {
            var cand = rightRowBtns[ri];
            if (cand.el === micBtn) continue;
            var ccy = (cand.r.top + cand.r.bottom) / 2;
            if (Math.abs(ccy - mcy) <= 12 && cand.r.right <= mr.left + 2 && mr.left - cand.r.right <= 24 && cand.r.width <= 52) {
              modeBtn = cand.el;
              break;
            }
          }
        }
        var chosenBtn = modeBtn || micBtn || sendBtn;
        if (chosenBtn && chosenBtn.parentElement) {
          return { container: chosenBtn.parentElement, before: chosenBtn, footer: card, cardWidth: cr.width };
        }
      }
    } catch (e) {}
    return null;
  }

  // Create docked Shadow DOM host (pills inside composer footer) + top-level portal Shadow DOM host
  // (popover & tooltips mounted directly on <html> so composer backdrop-filter NEVER breaks position:fixed!)
  var host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-no-drag', '');
  var shadow = host.attachShadow({ mode: 'open' });

  var portalHost = document.createElement('div');
  portalHost.id = PORTAL_ID;
  portalHost.setAttribute('data-no-drag', '');
  portalHost.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483640;';
  var portalShadow = portalHost.attachShadow({ mode: 'open' });
  try {
    (document.documentElement || document.body).appendChild(portalHost);
  } catch (e) {}

  shadow.innerHTML = [
    '<style>',
    ':host { display: inline-flex; align-items: center; gap: 4px; flex: 0 1 auto; min-width: 0; max-width: 580px; margin-right: 4px; position: relative; height: 24px; user-select: none; -webkit-app-region: no-drag; font-family: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif; color: #e4e4ec; --hud-dur: 0.44s; --hud-ease: cubic-bezier(0.32, 0.04, 0.20, 1); --hud-fade: 0.28s; --hud-accent: #5b8cff; --hud-bg: rgba(33, 37, 51, 0.30); --hud-bg-hover: rgba(33, 37, 51, 0.44); --hud-border: rgba(255, 255, 255, 0.13); --hud-border-hover: rgba(255, 255, 255, 0.24); --hud-track: rgba(255, 255, 255, 0.22); --hud-text: #e8e7ef; --hud-muted: #b8b8c4; --hud-cache: #b8dfcf; --hud-dot: rgba(255, 255, 255, 0.40); }',
    ':host([data-qhover="1"]) { --hud-dur: 0.48s; --hud-ease: cubic-bezier(0.32, 0.04, 0.20, 1); --hud-fade: 0.34s; }',
    ':host([data-theme="light"]) { color: #1d1c22; --hud-bg: rgba(255, 255, 255, 0.46); --hud-bg-hover: rgba(255, 255, 255, 0.70); --hud-border: rgba(15, 23, 42, 0.14); --hud-border-hover: rgba(15, 23, 42, 0.26); --hud-track: rgba(15, 23, 42, 0.18); --hud-text: #1e293b; --hud-muted: #475569; --hud-cache: #0f766e; --hud-dot: rgba(15, 23, 42, 0.32); }',
    ':host([data-lite="1"]) { --hud-bg: rgba(24, 27, 38, 0.90); --hud-bg-hover: rgba(32, 36, 50, 0.95); }',
    ':host([data-lite="1"][data-theme="light"]) { --hud-bg: rgba(248, 250, 252, 0.94); --hud-bg-hover: rgba(255, 255, 255, 0.98); }',
    ':host([data-lite="1"]) .ring-pill:hover, :host([data-lite="1"]) .meta-pill, :host([data-lite="1"]) .quota-pill, :host([data-lite="1"]) .empty-pill { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    '* { box-sizing: border-box; }',
    '.ring-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 3px; border-radius: 999px; border: 1px solid transparent; background: transparent; cursor: pointer; flex-shrink: 0; color: inherit; transition: background 0.24s ease, border-color 0.24s ease, padding 0.30s cubic-bezier(0.22, 1, 0.36, 1); }',
    '.ring-pill:hover { background: var(--hud-bg-hover); border-color: var(--hud-border-hover); padding: 0 7px 0 5px; backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); }',
    '.ring-pct { display: inline-grid; grid-template-columns: 0fr; align-items: center; opacity: 0; margin-left: 0; transition: grid-template-columns 0.30s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, margin-left 0.30s cubic-bezier(0.22, 1, 0.36, 1); }',
    '.ring-pct-in { overflow: hidden; min-width: 0; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--hud-text); font-variant-numeric: tabular-nums; }',
    '.ring-pill:hover .ring-pct { grid-template-columns: 1fr; opacity: 1; margin-left: 5px; }',
    ':host([data-compact-ring="1"]) .ring-pill:hover { padding: 0 3px; }',
    ':host([data-compact-ring="1"]) .ring-pill:hover .ring-pct { grid-template-columns: 0fr; opacity: 0; margin-left: 0; }',
    '.meta-pill, .quota-pill { display: inline-flex; align-items: center; height: 22px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--hud-border); background: var(--hud-bg); backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08); cursor: pointer; color: inherit; }',
    '.meta-pill { flex: 0 0 auto; min-width: 0; gap: 0; overflow: hidden; transition: padding var(--hud-dur) var(--hud-ease), margin var(--hud-dur) var(--hud-ease), opacity var(--hud-fade) ease, background 0.28s ease, border-color 0.28s ease; }',
    '.meta-pill[data-collapsed="1"] { padding-left: 0 !important; padding-right: 0 !important; border-left-width: 0 !important; border-right-width: 0 !important; border-color: transparent !important; opacity: 0 !important; pointer-events: none !important; }',
    '.m-seg { display: inline-grid; grid-template-columns: 1fr; align-items: center; opacity: 1; margin-left: 0; transition: grid-template-columns var(--hud-dur) var(--hud-ease), opacity var(--hud-fade) ease, margin-left var(--hud-dur) var(--hud-ease); }',
    '.m-seg[data-pad="1"] { margin-left: 3px; }',
    '.m-seg[data-off="1"] { grid-template-columns: 0fr; opacity: 0; margin-left: 0; }',
    '.m-seg-in { display: inline-flex; align-items: center; gap: 3px; overflow: hidden; min-width: 0; white-space: nowrap; }',
    '.quota-pill { flex-shrink: 0; padding: 0 5px; gap: 4px; transition: background 0.30s ease, border-color 0.30s ease, padding var(--hud-dur) var(--hud-ease); }',
    ':host([data-qhover="1"]) .quota-pill { background: var(--hud-bg-hover); border-color: var(--hud-border-hover); padding: 0 7px; }',
    '.meta-pill:hover { background: var(--hud-bg-hover); border-color: var(--hud-border-hover); }',
    '.q-item { display: inline-flex; align-items: center; flex-shrink: 0; }',
    '.q-sep { width: 1px; height: 10px; background: var(--hud-border); flex-shrink: 0; opacity: 0.7; }',
    '.q-detail { display: inline-grid; grid-template-columns: 0fr; align-items: center; opacity: 0; margin-left: 0; transition: grid-template-columns var(--hud-dur) var(--hud-ease), opacity var(--hud-fade) ease, margin-left var(--hud-dur) var(--hud-ease); }',
    '.q-detail-in { overflow: hidden; min-width: 0; white-space: nowrap; font-size: 10.5px; font-weight: 500; line-height: 1; color: var(--hud-text); font-variant-numeric: tabular-nums; }',
    ':host([data-qhover="1"]) .q-detail { grid-template-columns: 1fr; opacity: 1; margin-left: 4px; }',
    '.m-speed, .m-cache { font-size: 11px; font-weight: 400; line-height: 1; color: var(--hud-text); white-space: nowrap; flex-shrink: 0; font-variant-numeric: tabular-nums; }',
    '.m-cache { font-size: 10.5px; color: var(--hud-cache); }',
    '.m-dot { font-size: 11px; color: var(--hud-dot); flex-shrink: 0; }',
    '.m-model { font-size: 11px; color: var(--hud-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 112px; }',
    '.empty-pill { display: none; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; border: 1px solid var(--hud-border); background: var(--hud-bg); backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); color: var(--hud-muted); font-size: 12px; cursor: pointer; flex-shrink: 0; }',
    '.empty-pill:hover { background: var(--hud-bg-hover); border-color: var(--hud-border-hover); color: var(--hud-text); }',
    '</style>',
    '<button type="button" class="ring-pill" id="ringPill" aria-label="点击选择底部显示项">',
      '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">',
        '<circle cx="8" cy="8" r="6" fill="none" stroke="var(--hud-track)" stroke-width="2"></circle>',
        '<circle id="ringArc" cx="8" cy="8" r="6" fill="none" stroke="var(--hud-accent)" stroke-width="2" stroke-linecap="round" transform="rotate(-90 8 8)" stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + RING_C.toFixed(2) + '" style="opacity:0;transition:stroke-dashoffset 0.2s ease"></circle>',
      '</svg>',
      '<span class="ring-pct"><span class="ring-pct-in" id="ringPct">0%</span></span>',
    '</button>',
    '<button type="button" class="meta-pill" id="metaPill" aria-label="点击选择底部显示项">',
      '<span class="m-seg" id="mSpeedSeg"><span class="m-seg-in"><span class="m-speed" id="mSpeed">-- tok/s</span></span></span>',
      '<span class="m-seg" id="mCacheSeg"><span class="m-seg-in"><span class="m-dot" id="mDot1">·</span><span class="m-cache" id="mCache">缓存 --</span></span></span>',
      '<span class="m-seg" id="mModelSeg"><span class="m-seg-in"><span class="m-dot" id="mDot2">·</span><span class="m-model" id="mModel">--</span></span></span>',
    '</button>',
    '<button type="button" class="quota-pill" id="quotaPill" aria-label="点击选择底部显示项">',
      '<span class="q-item" id="q5hItem">',
        '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">',
          '<circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--hud-track)" stroke-width="2"></circle>',
          '<circle id="q5hArc" cx="8" cy="8" r="5.5" fill="none" stroke="#3dc2a7" stroke-width="2" stroke-linecap="round" transform="rotate(-90 8 8)" stroke-dasharray="' + QRING_C.toFixed(2) + '" stroke-dashoffset="' + QRING_C.toFixed(2) + '" style="opacity:0;transition:stroke-dashoffset 0.2s ease"></circle>',
        '</svg>',
        '<span class="q-detail"><span class="q-detail-in" id="q5hTxt">--</span></span>',
      '</span>',
      '<span class="q-sep" id="qSep"></span>',
      '<span class="q-item" id="qWkItem">',
        '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">',
          '<circle cx="8" cy="8" r="5.5" fill="none" stroke="var(--hud-track)" stroke-width="2"></circle>',
          '<circle id="qWkArc" cx="8" cy="8" r="5.5" fill="none" stroke="#3dc2a7" stroke-width="2" stroke-linecap="round" transform="rotate(-90 8 8)" stroke-dasharray="' + QRING_C.toFixed(2) + '" stroke-dashoffset="' + QRING_C.toFixed(2) + '" style="opacity:0;transition:stroke-dashoffset 0.2s ease"></circle>',
        '</svg>',
        '<span class="q-detail"><span class="q-detail-in" id="qWkTxt">--</span></span>',
      '</span>',
    '</button>',
    '<button type="button" class="empty-pill" id="emptyPill" aria-label="点击选择底部显示项">···</button>'
  ].join('');

  portalShadow.innerHTML = [
    '<style>',
    ':host { font-family: "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif; color: #e4e4ec; --hud-accent: #5b8cff; --hud-border-hover: rgba(255, 255, 255, 0.26); --hud-text: #e8e7ef; --hud-muted: #b6b5c0; --pop-bg: rgba(22, 24, 33, 0.78); --pop-border: rgba(255, 255, 255, 0.14); --pop-row-hover: rgba(255, 255, 255, 0.08); --pop-shadow: 0 12px 32px rgba(0, 0, 0, 0.42); }',
    ':host([data-theme="light"]) { color: #1d1c22; --hud-border-hover: rgba(15, 23, 42, 0.24); --hud-text: #1e293b; --hud-muted: #475569; --pop-bg: rgba(250, 251, 254, 0.86); --pop-border: rgba(15, 23, 42, 0.12); --pop-row-hover: rgba(15, 23, 42, 0.06); --pop-shadow: 0 10px 28px rgba(15, 23, 42, 0.14); }',
    ':host([data-lite="1"]) { --pop-bg: rgba(22, 24, 33, 0.95); }',
    ':host([data-lite="1"][data-theme="light"]) { --pop-bg: rgba(252, 253, 255, 0.96); }',
    ':host([data-lite="1"]) .ring-tip, :host([data-lite="1"]) .pop, :host([data-lite="1"]) .guide-card { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    '* { box-sizing: border-box; }',
    '.ring-tip { position: fixed; z-index: 2147483635; pointer-events: none; padding: 3px 8px; border-radius: 7px; border: 1px solid var(--pop-border); background: var(--pop-bg); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); color: var(--hud-text); font-size: 10.5px; font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: var(--pop-shadow); opacity: 0; transform: translateY(5px); transition: opacity 0.36s cubic-bezier(0.37, 0.04, 0.22, 1), transform 0.36s cubic-bezier(0.37, 0.04, 0.22, 1); }',
    '.ring-tip[data-open="1"] { opacity: 1; transform: translateY(0); }',
    '.pop { position: fixed; z-index: 2147483640; pointer-events: auto; width: 248px; padding: 8px; border-radius: 12px; border: 1px solid var(--pop-border); background: var(--pop-bg); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), var(--pop-shadow); color: var(--hud-text); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); display: none; }',
    '.pop[data-open="1"] { display: block; }',
    '.pop-head { display: flex; align-items: center; justify-content: space-between; padding: 3px 6px 7px; border-bottom: 1px solid var(--pop-border); margin-bottom: 4px; gap: 6px; }',
    '.pop-title { font-size: 11.5px; font-weight: 600; color: var(--hud-text); display: inline-flex; align-items: center; gap: 5px; }',
    '.pop-tag { font-size: 9.5px; font-weight: 600; padding: 1px 5px; border-radius: 999px; background: rgba(91, 140, 255, 0.18); color: var(--hud-accent); }',
    '.pop-badge { font-size: 11px; font-weight: 600; color: var(--hud-accent); font-variant-numeric: tabular-nums; }',
    '.pop-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 6px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }',
    '.pop-row:hover { background: var(--pop-row-hover); }',
    '.pop-left { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex-shrink: 0; }',
    '.pop-box { width: 15px; height: 15px; border-radius: 4px; border: 1px solid var(--hud-border-hover); background: transparent; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 10px; font-weight: 700; color: #fff; }',
    '.pop-row[data-checked="1"] .pop-box { border-color: transparent; background: var(--hud-accent); }',
    '.pop-lbl { font-size: 12px; color: var(--hud-text); }',
    '.pop-val { font-size: 11px; color: var(--hud-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 112px; font-variant-numeric: tabular-nums; }',
    '.pop-foot { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--pop-border); }',
    '.pop-guide-row { display: flex; align-items: center; justify-content: space-between; width: 100%; height: 26px; padding: 0 7px 0 6px; border: 0; border-radius: 7px; background: var(--pop-row-hover); color: var(--hud-muted); font: inherit; font-size: 11.5px; cursor: pointer; }',
    '.pop-guide-row:hover, .pop-guide-row[data-pinned="1"] { color: var(--hud-text); }',
    '.pop-q { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 999px; background: var(--pop-border); font-size: 10px; font-weight: 700; color: var(--hud-accent); }',
    '.guide-card { position: fixed; z-index: 2147483641; width: 306px; padding: 8px; border-radius: 12px; border: 1px solid var(--pop-border); background: var(--pop-bg); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); box-shadow: var(--pop-shadow); pointer-events: none; display: none; }',
    '.guide-card[data-open="1"] { display: block; }',
    '.guide-cap { font-size: 11px; font-weight: 600; color: var(--hud-text); margin: 0 2px 7px; }',
    '.guide-img { display: block; width: 100%; aspect-ratio: 784 / 439; object-fit: cover; border-radius: 8px; border: 1px solid var(--pop-border); }',
    '</style>',
    '<div class="ring-tip" id="ringTip">0 / 512k (0%)</div>',
    '<div class="ring-tip" id="quotaTip">账号剩余额度</div>',
    '<div class="pop" id="popEl">',
      '<div class="pop-head"><span class="pop-title">底部状态栏 <span class="pop-tag">原生 DOM</span></span><span class="pop-badge" id="popBadge">0%</span></div>',
      '<button type="button" class="pop-row" data-key="showSpeed"><span class="pop-left"><span class="pop-box"></span><span class="pop-lbl">生成速率</span></span><span class="pop-val">--</span></button>',
      '<button type="button" class="pop-row" data-key="showCacheHit"><span class="pop-left"><span class="pop-box"></span><span class="pop-lbl">缓存命中</span></span><span class="pop-val">--</span></button>',
      '<button type="button" class="pop-row" data-key="showModel"><span class="pop-left"><span class="pop-box"></span><span class="pop-lbl">上游模型</span></span><span class="pop-val">--</span></button>',
      '<button type="button" class="pop-row" data-key="showContext"><span class="pop-left"><span class="pop-box"></span><span class="pop-lbl">上下文占用</span></span><span class="pop-val">0%</span></button>',
      '<button type="button" class="pop-row" data-key="showQuota"><span class="pop-left"><span class="pop-box"></span><span class="pop-lbl">账号剩余额度</span></span><span class="pop-val">--</span></button>',
      '<div class="pop-foot"><button type="button" class="pop-guide-row" id="guideBtn" data-pinned="0"><span class="pop-left"><span class="pop-q">?</span><span>如何打开 AGY 控制台</span></span><span>▸</span></button></div>',
    '</div>',
    '<div class="guide-card" id="guideCard"><div class="guide-cap">打开方式：右上角 Plugins → AGY 控制台</div><img class="guide-img" id="guideImg" alt="AGY 控制台打开指引" /></div>'
  ].join('');

  var $ = function (id) { return shadow.getElementById(id); };
  var $p = function (id) { return portalShadow.getElementById(id); };
  var ringPill = $('ringPill');
  var ringArc = $('ringArc');
  var ringPct = $('ringPct');
  var metaPill = $('metaPill');
  var mSpeedSeg = $('mSpeedSeg');
  var mCacheSeg = $('mCacheSeg');
  var mModelSeg = $('mModelSeg');
  var mSpeed = $('mSpeed');
  var mDot1 = $('mDot1');
  var mCache = $('mCache');
  var mDot2 = $('mDot2');
  var mModel = $('mModel');
  var quotaPill = $('quotaPill');
  var q5hArc = $('q5hArc');
  var q5hTxt = $('q5hTxt');
  var qWkArc = $('qWkArc');
  var qWkTxt = $('qWkTxt');
  var emptyPill = $('emptyPill');
  var ringTip = $p('ringTip');
  var quotaTip = $p('quotaTip');
  var popEl = $p('popEl');
  var popBadge = $p('popBadge');
  var guideBtn = $p('guideBtn');
  var guideCard = $p('guideCard');
  var guideImg = $p('guideImg');

  function applyThemeAttr(themeName) {
    host.setAttribute('data-theme', themeName);
    portalHost.setAttribute('data-theme', themeName);
  }

  function syncTheme() {
    try {
      var root = document.documentElement;
      var cls = String(root.className || '').toLowerCase();
      var attr = String(root.getAttribute('data-theme') || '').toLowerCase();
      if (attr === 'light' || cls.indexOf('light') >= 0) {
        applyThemeAttr('light');
        return;
      }
      if (attr === 'dark' || cls.indexOf('dark') >= 0) {
        applyThemeAttr('dark');
        return;
      }
      var probe = document.querySelector('.surface-composer-card') || document.body || root;
      var bg = getComputedStyle(probe).backgroundColor || '';
      var m = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/i);
      if (m) {
        var a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (a > 0.2) {
          var lum = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255;
          applyThemeAttr(lum > 0.55 ? 'light' : 'dark');
          return;
        }
      }
      applyThemeAttr('dark');
    } catch (e) {
      applyThemeAttr('dark');
    }
  }

  function resolveActiveQuotaPair(quotaObj, modelId) {
    if (!quotaObj || typeof quotaObj !== 'object') {
      return { label: '账号', fiveHour: null, weekly: null };
    }
    var lowModel = String(modelId || '').toLowerCase();
    var wantClaude = lowModel.indexOf('claude') >= 0 || lowModel.indexOf('gpt') >= 0 || lowModel.indexOf('opus') >= 0 || lowModel.indexOf('sonnet') >= 0;
    var gem = quotaObj.gemini || null;
    var cl = quotaObj.gpt_claude || null;
    var hasGem = Boolean(gem && (typeof gem.fiveHour?.pct === 'number' || typeof gem.weekly?.pct === 'number'));
    var hasCl = Boolean(cl && (typeof cl.fiveHour?.pct === 'number' || typeof cl.weekly?.pct === 'number'));
    if (wantClaude && hasCl) {
      return { label: 'Claude/GPT', fiveHour: cl.fiveHour || null, weekly: cl.weekly || null };
    }
    if (hasGem) {
      return { label: 'Gemini', fiveHour: gem.fiveHour || null, weekly: gem.weekly || null };
    }
    if (hasCl) {
      return { label: 'Claude/GPT', fiveHour: cl.fiveHour || null, weekly: cl.weekly || null };
    }
    return { label: '账号', fiveHour: null, weekly: null };
  }

  function resolveEffectiveMetrics() {
    var d = state.data || {};
    var routeId = detectRouteConvId();
    if (routeId && Array.isArray(d.sessions) && d.sessions.length > 0) {
      for (var i = 0; i < d.sessions.length; i++) {
        var s = d.sessions[i];
        if (s && s.id === routeId) {
          return {
            percent: Number(s.percent) || 0,
            totalUsed: Number(s.totalUsed) || 0,
            windowCap: Number(s.windowCap) || Number(d.windowCap) || 512000,
            tokPerSec: typeof s.tokPerSec === 'number' ? s.tokPerSec : null,
            cacheHitPct: typeof s.cacheHitPct === 'number' ? s.cacheHitPct : null,
            upstreamModelId: s.upstreamModelId || '',
            quota: d.quota || null,
            quotaQueryEnabled: d.quotaQueryEnabled !== false,
            accent: d.accent || '#5b8cff',
            bubbleColor: d.bubbleColor || '#212533',
            hostBlendPct: Number(d.hostBlendPct) || 25,
            liteMode: Boolean(d.liteMode),
            guideImageDataUri: d.guideImageDataUri || ''
          };
        }
      }
    }
    return {
      percent: Number(d.percent) || 0,
      totalUsed: Number(d.totalUsed) || 0,
      windowCap: Number(d.windowCap) || 512000,
      tokPerSec: typeof d.tokPerSec === 'number' ? d.tokPerSec : null,
      cacheHitPct: typeof d.cacheHitPct === 'number' ? d.cacheHitPct : null,
      upstreamModelId: d.upstreamModelId || '',
      quota: d.quota || null,
      quotaQueryEnabled: d.quotaQueryEnabled !== false,
      accent: d.accent || '#5b8cff',
      bubbleColor: d.bubbleColor || '#212533',
      hostBlendPct: Number(d.hostBlendPct) || 25,
      liteMode: Boolean(d.liteMode),
      guideImageDataUri: d.guideImageDataUri || ''
    };
  }

  function positionFloatingTip(anchorEl, tipEl, visible) {
    if (!visible || state.popoverOpen) {
      tipEl.setAttribute('data-open', '0');
      return;
    }
    var r = anchorEl.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) {
      tipEl.setAttribute('data-open', '0');
      return;
    }
    tipEl.setAttribute('data-open', '1');
    var tr = tipEl.getBoundingClientRect();
    var vw = window.innerWidth || 1200;
    var w = tr.width || 120;
    var h = tr.height || 22;
    var top = Math.max(8, Math.round(r.top - h - 6));
    var left = Math.max(8, Math.min(vw - w - 8, Math.round(r.left + r.width / 2 - w / 2)));
    tipEl.style.top = top + 'px';
    tipEl.style.left = left + 'px';
  }

  function positionTip() {
    positionFloatingTip(ringPill, ringTip, state.hoverRing);
  }

  function positionQuotaTip() {
    positionFloatingTip(quotaPill, quotaTip, state.hoverQuota);
  }

  function positionGuide() {
    var m = resolveEffectiveMetrics();
    if (!state.guideVisible || !state.popoverOpen || !m.guideImageDataUri) {
      guideCard.setAttribute('data-open', '0');
      return;
    }
    if (guideImg.src !== m.guideImageDataUri) {
      guideImg.src = m.guideImageDataUri;
    }
    guideCard.setAttribute('data-open', '1');
    var pr = popEl.getBoundingClientRect();
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var gw = guideCard.offsetWidth || 306;
    var gh = guideCard.offsetHeight || 202;
    var left = Math.round(pr.right + 6);
    if (left + gw > vw - 8) left = Math.max(8, Math.round(pr.left - gw - 6));
    var top = Math.max(8, Math.min(vh - gh - 8, Math.round(pr.bottom - gh)));
    guideCard.style.left = left + 'px';
    guideCard.style.top = top + 'px';
  }

  function positionPopover() {
    if (!state.popoverOpen) return;
    var r = host.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return;
    var vw = window.innerWidth || 1200;
    var vh = window.innerHeight || 800;
    var pw = popEl.offsetWidth || 248;
    var ph = popEl.offsetHeight || 236;
    var left = Math.max(10, Math.min(vw - pw - 10, Math.round(r.left + r.width / 2 - pw / 2)));
    var top = Math.round(r.top - ph - 8);
    if (top < 10) top = Math.min(vh - ph - 10, Math.round(r.bottom + 8));
    popEl.style.left = left + 'px';
    popEl.style.top = top + 'px';
    if (state.guideVisible) positionGuide();
  }

  function setPopoverOpen(open) {
    state.popoverOpen = Boolean(open);
    if (!state.popoverOpen) {
      state.guidePinned = false;
      state.guideVisible = false;
      guideBtn.setAttribute('data-pinned', '0');
      guideCard.setAttribute('data-open', '0');
    } else {
      state.hoverRing = false;
      state.hoverQuota = false;
      ringTip.setAttribute('data-open', '0');
      quotaTip.setAttribute('data-open', '0');
    }
    popEl.setAttribute('data-open', state.popoverOpen ? '1' : '0');
    if (state.popoverOpen) {
      render();
      requestAnimationFrame(positionPopover);
    }
  }

  function computeHudBudget(effectiveWidth, isHoverExpanding) {
    var fw = Number(effectiveWidth) || 0;
    if (fw <= 0) return 380;
    // Deterministic left reserve (zero feedback loop with flex-1 left cluster) + exact right sibling width measurement
    var leftReserve;
    if (fw >= 620) {
      leftReserve = isHoverExpanding ? 152 : 168;
    } else if (fw >= 480) {
      leftReserve = isHoverExpanding ? 114 : 132;
    } else {
      leftReserve = Math.max(66, Math.round(fw * (isHoverExpanding ? 0.21 : 0.25)));
    }
    var rightSiblingsW = 158;
    try {
      if (host.parentElement) {
        var cs = getComputedStyle(host.parentElement);
        var gapPx = parseFloat(cs.columnGap || cs.gap || '2');
        if (!isFinite(gapPx) || gapPx < 0) gapPx = 2;
        var sibs = host.parentElement.children;
        var sum = 0;
        var count = 0;
        for (var i = 0; i < sibs.length; i++) {
          if (sibs[i] === host) continue;
          var sr = sibs[i].getBoundingClientRect();
          if (sr && sr.width > 0) {
            sum += sr.width;
            count += 1;
          }
        }
        if (sum > 0) {
          rightSiblingsW = Math.ceil(sum) + Math.ceil(count * gapPx) + 6;
        }
      }
    } catch (e) {}
    return Math.max(72, Math.floor(fw - leftReserve - rightSiblingsW - 6));
  }

  function applyLayout(effectiveWidth) {
    var disp = state.display;
    var fw = Number(effectiveWidth) || 0;
    try {
      if (observedFooter && observedFooter.isConnected) {
        var liveRect = observedFooter.getBoundingClientRect();
        if (liveRect && liveRect.width > 0) {
          fw = liveRect.width;
          state.lastCardWidth = fw;
        }
      }
    } catch (e) {}

    var isQuotaHover = Boolean(state.hoverQuota);
    var isCompactRing = fw > 0 && fw < 380;
    host.setAttribute('data-compact-ring', isCompactRing ? '1' : '0');
    host.setAttribute('data-qhover', isQuotaHover ? '1' : '0');

    // CRITICAL ANTI-OSCILLATION & COUPLED CURTAIN INVARIANT:
    // 1) On ringPill hover, discrete metaPill visibility is NEVER reduced (ring expands leftward, right edge pinned).
    // 2) On quotaPill hover, both quotaPill (.q-detail 0fr->1fr) and metaPill segments (.m-seg 1fr->0fr) are driven
    //    synchronously on the EXACT SAME tick with the IDENTICAL var(--hud-dur) / var(--hud-ease) curve, so total HUD
    //    width stays rock-steady throughout the entire glide — zero teleport, zero double-bounce, zero reverse smash!
    var hudBudget = computeHudBudget(fw, isQuotaHover);
    var hostMaxW = state.hoverRing && !isQuotaHover && !isCompactRing ? (hudBudget + 40) : hudBudget;
    host.style.maxWidth = hostMaxW + 'px';

    var showContext = Boolean(disp.showContext);
    var quotaGloballyEnabled = !(state.data && state.data.quotaQueryEnabled === false);
    var showQuota = quotaGloballyEnabled && Boolean(disp.showQuota) && !(fw > 0 && fw < 290);
    var wantMeta = Boolean(disp.showSpeed || disp.showCacheHit || disp.showModel);

    var ringW = showContext ? 23 : 0;
    var quotaW = 0;
    if (showQuota) {
      if (isQuotaHover) {
        var t5Len = (q5hTxt.textContent || '').length;
        var tWkLen = (qWkTxt.textContent || '').length;
        quotaW = Math.min(228, Math.max(176, 62 + (t5Len + tWkLen) * 6.4));
      } else {
        quotaW = 48;
      }
    }
    var gapBudget = (showContext ? 4 : 0) + (showQuota ? 4 : 0);
    var metaBudget = Math.max(0, Math.floor(hudBudget - ringW - quotaW - gapBudget));

    // Progressively fold ONLY the middle metaPill segments via smooth 1fr <-> 0fr grid transitions!
    var collapseMeta = !wantMeta || metaBudget < 74;
    var showSpeed = !collapseMeta && Boolean(disp.showSpeed);
    var showCache = !collapseMeta && Boolean(disp.showCacheHit) && (!showSpeed || metaBudget >= 126);
    var showModel = !collapseMeta && Boolean(disp.showModel) && (
      (!showSpeed && !showCache) ? metaBudget >= 74 :
      (showSpeed && showCache) ? metaBudget >= 186 :
      metaBudget >= 132
    );
    var anyVisibleMeta = showSpeed || showCache || showModel;

    ringPill.style.display = showContext ? 'inline-flex' : 'none';
    quotaPill.style.display = showQuota ? 'inline-flex' : 'none';
    emptyPill.style.display = (showContext || wantMeta || showQuota) ? 'none' : 'inline-flex';

    // Permanently disabled items (unchecked in popover) are display:none; enabled items animate smoothly via data-off!
    mSpeedSeg.style.display = disp.showSpeed ? 'inline-grid' : 'none';
    mCacheSeg.style.display = disp.showCacheHit ? 'inline-grid' : 'none';
    mModelSeg.style.display = disp.showModel ? 'inline-grid' : 'none';

    mSpeedSeg.setAttribute('data-off', showSpeed ? '0' : '1');
    mCacheSeg.setAttribute('data-off', showCache ? '0' : '1');
    mModelSeg.setAttribute('data-off', showModel ? '0' : '1');

    var cacheHasLead = Boolean(disp.showSpeed);
    var modelHasLead = Boolean(disp.showSpeed || disp.showCacheHit);
    mDot1.style.display = cacheHasLead ? 'inline' : 'none';
    mDot2.style.display = modelHasLead ? 'inline' : 'none';
    mCacheSeg.setAttribute('data-pad', (showCache && showSpeed) ? '1' : '0');
    mModelSeg.setAttribute('data-pad', (showModel && (showSpeed || showCache)) ? '1' : '0');

    if (showModel) {
      var fixedMetaW = 16 + (showSpeed ? 60 : 0) + (showCache ? 58 : 0);
      mModel.style.maxWidth = Math.max(54, Math.min(126, metaBudget - fixedMetaW)) + 'px';
    }

    if (!wantMeta) {
      metaPill.style.display = 'none';
      metaPill.setAttribute('data-collapsed', '0');
      metaPill.style.marginLeft = '';
      metaPill.style.marginRight = '';
    } else if (!anyVisibleMeta) {
      metaPill.style.display = 'inline-flex';
      metaPill.setAttribute('data-collapsed', '1');
      metaPill.style.marginLeft = showContext ? '-4px' : '';
      metaPill.style.marginRight = (!showContext && showQuota) ? '-4px' : '';
    } else {
      metaPill.style.display = 'inline-flex';
      metaPill.setAttribute('data-collapsed', '0');
      metaPill.style.marginLeft = '';
      metaPill.style.marginRight = '';
    }

    host.style.display = (fw > 0 && fw < 240) ? 'none' : 'inline-flex';
  }

  function applyQuotaArc(arcEl, txtEl, bucket, nowMs) {
    var pct = bucket && typeof bucket.pct === 'number' && isFinite(bucket.pct)
      ? Math.max(0, Math.min(100, Math.round(bucket.pct)))
      : null;
    if (pct === null) {
      arcEl.setAttribute('stroke-dashoffset', QRING_C.toFixed(2));
      arcEl.style.opacity = '0';
      txtEl.textContent = '--';
      return '--';
    }
    var offset = QRING_C * (1 - pct / 100);
    arcEl.setAttribute('stroke', pickQuotaColor(pct));
    arcEl.setAttribute('stroke-dashoffset', offset.toFixed(2));
    arcEl.style.opacity = pct > 0 ? '1' : '0';
    var resetStr = fmtQuotaReset(bucket.resetTimeMs, bucket.isFull, nowMs);
    var label = resetStr ? (pct + '% · ' + resetStr) : (pct + '%');
    txtEl.textContent = label;
    return label;
  }

  function render() {
    if (state.disposed) return;
    var m = resolveEffectiveMetrics();
    var accent = m.accent || '#5b8cff';
    host.style.setProperty('--hud-accent', accent);
    portalHost.style.setProperty('--hud-accent', accent);

    // Sync translucent pill & popover colors dynamically with composer bubble & blend settings
    var isLight = host.getAttribute('data-theme') === 'light';
    var isLite = Boolean(m.liteMode);
    host.setAttribute('data-lite', isLite ? '1' : '0');
    portalHost.setAttribute('data-lite', isLite ? '1' : '0');
    if (!isLight) {
      var rgb = parseHexColorRgb(m.bubbleColor, [33, 37, 51]);
      var blendFrac = Math.max(5, Math.min(42, Number(m.hostBlendPct) || 25)) / 100;
      var pillAlpha = isLite ? 0.90 : Math.max(0.24, Math.min(0.42, 0.38 - blendFrac * 0.32));
      var hoverAlpha = isLite ? 0.95 : Math.max(0.36, Math.min(0.56, pillAlpha + 0.12));
      var popAlpha = isLite ? 0.95 : Math.max(0.68, Math.min(0.84, 0.86 - blendFrac * 0.42));
      host.style.setProperty('--hud-bg', 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + pillAlpha.toFixed(3) + ')');
      host.style.setProperty('--hud-bg-hover', 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + hoverAlpha.toFixed(3) + ')');
      portalHost.style.setProperty('--pop-bg', 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + popAlpha.toFixed(3) + ')');
    } else {
      host.style.removeProperty('--hud-bg');
      host.style.removeProperty('--hud-bg-hover');
      portalHost.style.removeProperty('--pop-bg');
    }

    var rawPct = Math.max(0, Math.min(999, Math.round(m.percent || 0)));
    var clampedPct = Math.min(100, rawPct);
    var arcColor = rawPct >= 90 ? '#ef5350' : (rawPct >= 75 ? '#e99315' : accent);
    var offset = RING_C * (1 - clampedPct / 100);
    ringArc.setAttribute('stroke', arcColor);
    ringArc.setAttribute('stroke-dashoffset', offset.toFixed(2));
    ringArc.style.opacity = rawPct > 0 ? '1' : '0';
    ringPct.textContent = rawPct + '%';
    ringTip.textContent = fmtTokK(m.totalUsed) + ' / ' + fmtTokK(m.windowCap) + ' (' + rawPct + '%)';

    if (typeof m.tokPerSec === 'number' && m.tokPerSec > 0) {
      mSpeed.textContent = (m.tokPerSec >= 100 ? Math.round(m.tokPerSec) : m.tokPerSec.toFixed(1)) + ' tok/s';
    } else {
      mSpeed.textContent = '-- tok/s';
    }
    mCache.textContent = typeof m.cacheHitPct === 'number' ? ('缓存 ' + m.cacheHitPct + '%') : '缓存 --';
    mModel.textContent = m.upstreamModelId || '--';

    // Dual-ring quota pill (left: 5h, right: weekly)
    var nowMs = Date.now();
    var qp = resolveActiveQuotaPair(m.quota, m.upstreamModelId);
    var txt5h = applyQuotaArc(q5hArc, q5hTxt, qp.fiveHour, nowMs);
    var txtWk = applyQuotaArc(qWkArc, qWkTxt, qp.weekly, nowMs);
    quotaTip.textContent = qp.label + ' 剩余额度（左 5h · 右周）';
    var qPopVal = (qp.fiveHour && typeof qp.fiveHour.pct === 'number' ? (Math.round(qp.fiveHour.pct) + '%') : '--') +
      ' / ' + (qp.weekly && typeof qp.weekly.pct === 'number' ? (Math.round(qp.weekly.pct) + '%') : '--');

    popBadge.textContent = rawPct + '%';
    var valMap = {
      showSpeed: (typeof m.tokPerSec === 'number' && m.tokPerSec > 0)
        ? ((m.tokPerSec >= 100 ? Math.round(m.tokPerSec) : m.tokPerSec.toFixed(1)) + ' tok/s')
        : '--',
      showCacheHit: typeof m.cacheHitPct === 'number' ? (m.cacheHitPct + '%') : '--',
      showModel: m.upstreamModelId || '--',
      showContext: m.totalUsed > 0 ? (fmtTokK(m.totalUsed) + ' / ' + fmtTokK(m.windowCap)) : '0%',
      showQuota: qPopVal
    };
    var quotaGloballyEnabled = m.quotaQueryEnabled !== false;
    var rows = popEl.querySelectorAll('.pop-row');
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].getAttribute('data-key');
      if (key === 'showQuota') {
        rows[i].style.display = quotaGloballyEnabled ? '' : 'none';
      }
      var checked = Boolean(state.display[key]);
      rows[i].setAttribute('data-checked', checked ? '1' : '0');
      var box = rows[i].querySelector('.pop-box');
      if (box) box.textContent = checked ? '✓' : '';
      var val = rows[i].querySelector('.pop-val');
      if (val && Object.prototype.hasOwnProperty.call(valMap, key)) val.textContent = valMap[key];
    }
    applyLayout(state.lastCardWidth);
  }

  var observedFooter = null;
  var footerResizeObs = null;

  function isStaleInstance() {
    return state.disposed || window.__agyMonitorNativeHudGen !== GEN;
  }

  function ensureDocked() {
    if (isStaleInstance()) {
      if (!state.disposed && window.__agyMonitorNativeHud && typeof host.__agyDispose === 'function') {
        try { host.__agyDispose(); } catch (e) {}
      }
      return false;
    }
    try {
      var dupHosts = document.querySelectorAll('#' + HOST_ID + ', #' + LEGACY_HUD_ID);
      for (var dhi = 0; dhi < dupHosts.length; dhi++) {
        var dh = dupHosts[dhi];
        if (dh === host || dh.getAttribute('data-agy-zombie') === '1') continue;
        if (typeof dh.__agyDispose === 'function') {
          try { dh.__agyDispose(); } catch (e) {}
          if (dh.parentNode) dh.parentNode.removeChild(dh);
        } else {
          dh.setAttribute('data-agy-zombie', '1');
          if (dh.shadowRoot && !dh.shadowRoot.getElementById('agy-mon-zombie-kill')) {
            var kz = document.createElement('style');
            kz.id = 'agy-mon-zombie-kill';
            kz.textContent = ':host{display:none!important;position:fixed!important;width:0!important;height:0!important;margin:0!important;pointer-events:none!important;}';
            dh.shadowRoot.appendChild(kz);
          }
        }
      }
      var dupPortals = document.querySelectorAll('#' + PORTAL_ID);
      for (var dpi = 0; dpi < dupPortals.length; dpi++) {
        var dp = dupPortals[dpi];
        if (dp === portalHost || dp.getAttribute('data-agy-zombie') === '1') continue;
        if (typeof dp.__agyDispose === 'function') {
          if (dp.parentNode) dp.parentNode.removeChild(dp);
        } else {
          dp.setAttribute('data-agy-zombie', '1');
          if (dp.shadowRoot && !dp.shadowRoot.getElementById('agy-mon-zombie-kill')) {
            var kp = document.createElement('style');
            kp.id = 'agy-mon-zombie-kill';
            kp.textContent = ':host{display:none!important;pointer-events:none!important;}';
            dp.shadowRoot.appendChild(kp);
          }
        }
      }
    } catch (e) {}
    if (!portalHost.isConnected) {
      try { (document.documentElement || document.body).appendChild(portalHost); } catch (e) {}
    }
    var anchor = findComposerAnchor();
    if (!anchor || !anchor.container) {
      if (host.parentNode) host.parentNode.removeChild(host);
      if (state.popoverOpen) setPopoverOpen(false);
      return false;
    }
    if (anchor.before) {
      if (host.parentElement !== anchor.container || host.nextSibling !== anchor.before) {
        anchor.container.insertBefore(host, anchor.before);
      }
    } else if (host.parentElement !== anchor.container) {
      anchor.container.appendChild(host);
    }
    state.lastCardWidth = anchor.cardWidth || (anchor.footer && anchor.footer.getBoundingClientRect ? anchor.footer.getBoundingClientRect().width : 0);
    if (observedFooter !== anchor.footer) {
      observedFooter = anchor.footer;
      try {
        if (footerResizeObs) footerResizeObs.disconnect();
        if (typeof ResizeObserver !== 'undefined' && anchor.footer) {
          footerResizeObs = new ResizeObserver(function () {
            if (state.disposed) return;
            var fr = anchor.footer.getBoundingClientRect();
            state.lastCardWidth = fr ? fr.width : state.lastCardWidth;
            applyLayout(state.lastCardWidth);
            if (state.popoverOpen) positionPopover();
          });
          footerResizeObs.observe(anchor.footer);
        }
      } catch (e) {}
    }
    applyLayout(state.lastCardWidth);
    return true;
  }

  // Event wiring
  var hoverTipRaf = 0;
  function stopTipTrack() {
    if (hoverTipRaf) {
      cancelAnimationFrame(hoverTipRaf);
      hoverTipRaf = 0;
    }
  }
  function trackHoverTip(posFn, durationMs) {
    stopTipTrack();
    posFn();
    var start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var step = function (now) {
      if (state.disposed) {
        hoverTipRaf = 0;
        return;
      }
      posFn();
      var elapsed = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - start;
      if (elapsed < durationMs) {
        hoverTipRaf = requestAnimationFrame(step);
      } else {
        hoverTipRaf = 0;
      }
    };
    hoverTipRaf = requestAnimationFrame(step);
  }
  ringPill.addEventListener('mouseenter', function () {
    state.hoverRing = true;
    applyLayout(state.lastCardWidth);
    trackHoverTip(positionTip, 340);
  });
  ringPill.addEventListener('mouseleave', function () {
    state.hoverRing = false;
    stopTipTrack();
    ringTip.setAttribute('data-open', '0');
    applyLayout(state.lastCardWidth);
  });
  quotaPill.addEventListener('mouseenter', function () {
    state.hoverQuota = true;
    applyLayout(state.lastCardWidth);
    trackHoverTip(positionQuotaTip, 540);
  });
  quotaPill.addEventListener('mouseleave', function () {
    state.hoverQuota = false;
    stopTipTrack();
    quotaTip.setAttribute('data-open', '0');
    applyLayout(state.lastCardWidth);
  });
  var onPillMouseDown = function (e) {
    e.stopPropagation();
  };
  var onToggleClick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    setPopoverOpen(!state.popoverOpen);
  };
  ringPill.addEventListener('mousedown', onPillMouseDown);
  metaPill.addEventListener('mousedown', onPillMouseDown);
  quotaPill.addEventListener('mousedown', onPillMouseDown);
  emptyPill.addEventListener('mousedown', onPillMouseDown);
  ringPill.addEventListener('click', onToggleClick);
  metaPill.addEventListener('click', onToggleClick);
  quotaPill.addEventListener('click', onToggleClick);
  emptyPill.addEventListener('click', onToggleClick);

  popEl.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  popEl.addEventListener('click', function (e) {
    e.stopPropagation();
    var row = e.target && e.target.closest ? e.target.closest('.pop-row') : null;
    if (row) {
      var key = row.getAttribute('data-key');
      state.display[key] = !state.display[key];
      state.display.updatedAtMs = Date.now();
      state.dirtyDisplayPatch = {
        showSpeed: state.display.showSpeed,
        showCacheHit: state.display.showCacheHit,
        showModel: state.display.showModel,
        showContext: state.display.showContext,
        showQuota: state.display.showQuota,
        updatedAtMs: state.display.updatedAtMs
      };
      render();
    }
  });

  guideBtn.addEventListener('mouseenter', function () {
    state.guideVisible = true;
    positionGuide();
  });
  guideBtn.addEventListener('mouseleave', function () {
    if (!state.guidePinned) {
      state.guideVisible = false;
      guideCard.setAttribute('data-open', '0');
    }
  });
  guideBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    state.guidePinned = !state.guidePinned;
    state.guideVisible = state.guidePinned;
    guideBtn.setAttribute('data-pinned', state.guidePinned ? '1' : '0');
    positionGuide();
  });

  var onDocClick = function (e) {
    if (!state.popoverOpen) return;
    var p = e.composedPath ? e.composedPath() : [];
    if (p.indexOf(host) < 0 && p.indexOf(portalHost) < 0) setPopoverOpen(false);
  };
  var onKeyDown = function (e) {
    if (e.key === 'Escape' && state.popoverOpen) setPopoverOpen(false);
  };
  var onResize = function () {
    if (state.popoverOpen) positionPopover();
    if (state.hoverRing) positionTip();
    if (state.hoverQuota) positionQuotaTip();
  };
  document.addEventListener('mousedown', onDocClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);

  var isHudComposing = false;
  var onHudCompStart = function () { isHudComposing = true; };
  var onHudCompEnd = function () { isHudComposing = false; };
  window.addEventListener('compositionstart', onHudCompStart, true);
  window.addEventListener('compositionend', onHudCompEnd, true);
  window.addEventListener('blur', onHudCompEnd);

  // Self-healing DOM & theme observers
  var rafId = 0;
  var domObs = null;
  if (typeof MutationObserver === 'function' && document.body) {
    domObs = new MutationObserver(function () {
      if (state.disposed || isHudComposing) return;
      if (!host.isConnected) {
        if (!rafId) {
          rafId = requestAnimationFrame(function () {
            rafId = 0;
            ensureDocked();
            render();
          });
        }
      }
    });
    domObs.observe(document.body, { childList: true, subtree: true });
  }

  var themeObs = null;
  if (typeof MutationObserver === 'function' && document.documentElement) {
    themeObs = new MutationObserver(function () { syncTheme(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }

  var lastRoutePath = String(location.pathname || '');
  var selfHealTimer = setInterval(function () {
    if (isStaleInstance()) {
      if (typeof host.__agyDispose === 'function') host.__agyDispose();
      return;
    }
    var curPath = String(location.pathname || '');
    if (curPath !== lastRoutePath) {
      lastRoutePath = curPath;
      ensureDocked();
      render();
      return;
    }
    if (!host.isConnected) {
      if (ensureDocked()) render();
    }
  }, 2000);

  function disposeSelf() {
    if (state.disposed) return;
    state.disposed = true;
    clearInterval(selfHealTimer);
    stopTipTrack();
    if (rafId) cancelAnimationFrame(rafId);
    try { if (domObs) domObs.disconnect(); } catch (e) {}
    try { if (themeObs) themeObs.disconnect(); } catch (e) {}
    try { if (footerResizeObs) footerResizeObs.disconnect(); } catch (e) {}
    window.removeEventListener('compositionstart', onHudCompStart, true);
    window.removeEventListener('compositionend', onHudCompEnd, true);
    window.removeEventListener('blur', onHudCompEnd);
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    if (host.parentNode) host.parentNode.removeChild(host);
    if (portalHost.parentNode) portalHost.parentNode.removeChild(portalHost);
    if (window.__agyMonitorNativeHud && window.__agyMonitorNativeHud.version === VERSION) {
      delete window.__agyMonitorNativeHud;
    }
  }
  host.__agyDispose = disposeSelf;
  portalHost.__agyDispose = disposeSelf;

  syncTheme();
  ensureDocked();
  render();

  function syncHudPayload(payload) {
    if (isStaleInstance()) return { hudInjected: false };
    if (payload && typeof payload === 'object') {
      var prevGuideUri = (state.data && state.data.guideImageDataUri) || '';
      var nextData = payload;
      if (nextData.guideImageDataUri === undefined && prevGuideUri) {
        nextData = Object.assign({}, nextData, { guideImageDataUri: prevGuideUri });
      }
      state.data = nextData;
      var inc = nextData.display;
      if (inc && typeof inc === 'object' && !state.dirtyDisplayPatch) {
        if ((Number(inc.updatedAtMs) || 0) >= (Number(state.display.updatedAtMs) || 0)) {
          state.display = {
            showSpeed: inc.showSpeed !== false,
            showCacheHit: inc.showCacheHit !== false,
            showModel: inc.showModel !== false,
            showContext: inc.showContext !== false,
            showQuota: inc.showQuota !== false,
            updatedAtMs: Number(inc.updatedAtMs) || 0
          };
        }
      }
    }
    syncTheme();
    var docked = ensureDocked();
    if (docked) render();
    var patch = state.dirtyDisplayPatch;
    if (patch) state.dirtyDisplayPatch = null;
    return {
      hudInjected: Boolean(docked && host.isConnected),
      activeView: readActiveView(),
      focused: typeof document.hasFocus === 'function' ? Boolean(document.hasFocus()) : true,
      displayPatch: patch
    };
  }

  window.__agyMonitorNativeHud = {
    version: VERSION,
    scriptSig: '',
    sync: syncHudPayload,
    update: syncHudPayload,
    getSnapshot: function () {
      return {
        version: VERSION,
        docked: Boolean(host.isConnected),
        routeConvId: detectRouteConvId(),
        cardWidth: state.lastCardWidth
      };
    },
    dispose: disposeSelf
  };
})();`;
}

// ============================================================================
// Embedded Electron Main-Process Hook (dist/agy-monitor-hud-main.js)
// ============================================================================

export function buildMainHookScript() {
  return `'use strict';
if (globalThis.__AGY_MONITOR_HUD_MAIN_INSTALLED__) {
  module.exports = { version: ${JSON.stringify(NATIVE_HUD_VERSION)} };
} else {
  globalThis.__AGY_MONITOR_HUD_MAIN_INSTALLED__ = true;
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const VERSION = ${JSON.stringify(NATIVE_HUD_VERSION)};
  const PLUGIN_DATA_DIR =
    process.env.AGY_MONITOR_PLUGIN_DATA_DIR ||
    path.join(os.homedir(), '.gemini', 'antigravity', 'plugin_data', 'agy-monitor');
  const PLUGIN_ROOT_DIR =
    process.env.AGY_MONITOR_PLUGIN_ROOT ||
    path.join(os.homedir(), '.gemini', 'config', 'plugins', 'agy-monitor');
  const PLUGIN_MANIFEST_FILE = path.join(PLUGIN_ROOT_DIR, 'plugin.json');
  const TELEMETRY_FILE = path.join(PLUGIN_DATA_DIR, 'hud_telemetry.json');
  const DISPLAY_FILE = path.join(PLUGIN_DATA_DIR, 'hud_display.json');
  const THEMES_FILE = path.join(PLUGIN_DATA_DIR, 'themes.json');
  const USER_PREFS_FILE = path.join(PLUGIN_DATA_DIR, 'user_prefs.json');
  const ACTIVE_VIEW_FILE = path.join(PLUGIN_DATA_DIR, 'hud_active_view.json');
  const STATUS_FILE = path.join(PLUGIN_DATA_DIR, 'native_hud_status.json');
  const LIVE_RENDERER_FILE = path.join(PLUGIN_DATA_DIR, 'native_hud_renderer.js');
  const LIVE_WALLPAPER_ENGINE_FILE = path.join(PLUGIN_DATA_DIR, 'native_wallpaper_engine.js');
  const LIVE_WALLPAPER_CSS_FILE = path.join(PLUGIN_DATA_DIR, 'native_wallpaper.css');
  const LIVE_HOST_I18N_FILE = path.join(PLUGIN_DATA_DIR, 'native_host_i18n.js');
  const GUIDE_DATA_URI_FILE = path.join(PLUGIN_DATA_DIR, 'native_hud_guide.txt');
  const HOST_I18N_VER = ${JSON.stringify(HOST_I18N_VERSION)};

  function isPluginInstalled() {
    if (process.env.AGY_MONITOR_ALLOW_UNINSTALLED_HOOK === '1') return true;
    try {
      return fs.existsSync(PLUGIN_MANIFEST_FILE);
    } catch {
      return false;
    }
  }

  function cleanupStaleAsarFiles() {
    try {
      let rawFs = fs;
      try { rawFs = require('original-fs'); } catch {}
      const resDir = typeof process.resourcesPath === 'string' ? process.resourcesPath : '';
      if (!resDir || !rawFs.existsSync(resDir)) return;
      for (const name of rawFs.readdirSync(resDir)) {
        if (/^app\.asar\.agy_(?:stale|tmp)(?:\..+)?$/i.test(name)) {
          try { rawFs.unlinkSync(path.join(resDir, name)); } catch {}
        }
      }
    } catch {}
  }
  cleanupStaleAsarFiles();

  if (!isPluginInstalled()) {
    try {
      if (fs.existsSync(STATUS_FILE)) fs.unlinkSync(STATUS_FILE);
    } catch {}
    module.exports = { version: VERSION, dormant: true };
  } else {

  function readJsonSafe(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  // ---- Standalone TUN-Free Proxy Helpers (runs before app.whenReady & language_server spawn) ----
  const ALLOWED_PROXY_PROTOS = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);
  const UNSAFE_PROXY_RE = /[\\r\\n\\t\\0"'\\x60<>;|&\\s]/;

  function normalizeProxyUrlInline(raw) {
    const input = typeof raw === 'string' ? raw.trim() : '';
    if (!input || input.length > 512 || UNSAFE_PROXY_RE.test(input)) return null;
    let candidate = input;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(candidate)) {
      if (/^(?:\\[[0-9a-fA-F:]+\\]|[^/\\s:]+):\\d{1,5}$/.test(candidate)) {
        candidate = 'http://' + candidate;
      } else {
        return null;
      }
    }
    try {
      const u = new URL(candidate);
      const proto = String(u.protocol || '').toLowerCase();
      if (!ALLOWED_PROXY_PROTOS.has(proto) || !u.hostname) return null;
      if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return null;
      const defaultPort = proto === 'https:' ? 443 : proto === 'http:' ? 80 : 1080;
      const port = u.port ? Number(u.port) : defaultPort;
      if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
      const host = u.hostname.includes(':') && !u.hostname.startsWith('[')
        ? '[' + u.hostname + ']:' + port
        : u.hostname + ':' + port;
      const hasAuth = Boolean(u.username || u.password);
      const authPrefix = hasAuth ? u.username + (u.password ? ':' + u.password : '') + '@' : '';
      let username = '';
      let password = '';
      try {
        username = u.username ? decodeURIComponent(u.username) : '';
        password = u.password ? decodeURIComponent(u.password) : '';
      } catch {
        username = u.username || '';
        password = u.password || '';
      }
      const chromiumProto = proto === 'socks5h:' ? 'socks5:' : proto;
      return {
        url: proto + '//' + authPrefix + host,
        displayUrl: proto + '//' + (hasAuth ? '***@' : '') + host,
        chromiumServer: chromiumProto + '//' + host,
        username,
        password,
        hasAuth,
      };
    } catch {
      return null;
    }
  }

  function normalizeProxyBypassInline(raw) {
    const seen = new Set();
    const list = [];
    const push = (t) => {
      const c = String(t || '').trim().replace(/^\\[(::1)\\]$/, '$1');
      if (!c || c.length > 160 || UNSAFE_PROXY_RE.test(c)) return;
      const k = c.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      list.push(c);
    };
    push('localhost');
    push('127.0.0.1');
    push('::1');
    if (typeof raw === 'string' && raw.trim()) {
      for (const p of raw.split(/[,;\\s]+/)) push(p);
    }
    const bypassCsv = list.slice(0, 64).join(',');
    const chromiumBypass = list.slice(0, 64).map((e) => (e === '::1' ? '[::1]' : e)).join(';');
    return { bypassCsv, chromiumBypass };
  }

  let cachedSysProxy = '';
  let cachedSysProxyAt = 0;
  function detectSystemProxyInline(force) {
    const now = Date.now();
    if (!force && cachedSysProxyAt > 0 && now - cachedSysProxyAt < 10000) {
      return cachedSysProxy;
    }
    let found = '';
    const injectedSelf = String(process.env.AGY_MONITOR_INJECTED_PROXY || '').trim();
    const envKeys = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];
    for (const k of envKeys) {
      const v = typeof process.env[k] === 'string' ? process.env[k].trim() : '';
      if (!v || (injectedSelf && v === injectedSelf)) continue;
      const p = normalizeProxyUrlInline(v);
      if (p) { found = p.url; break; }
    }
    if (!found && process.platform === 'win32') {
      try {
        const out = execFileSync(
          'reg.exe',
          ['query', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Internet Settings'],
          { encoding: 'utf8', timeout: 1200, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
        );
        const en = /^\\s*ProxyEnable\\s+REG_DWORD\\s+0x([0-9a-fA-F]+)/m.exec(out);
        if (en && parseInt(en[1], 16) === 1) {
          const sv = /^\\s*ProxyServer\\s+REG_SZ\\s+(.+)$/m.exec(out);
          const rawVal = sv && sv[1] ? sv[1].trim() : '';
          if (rawVal) {
            if (!rawVal.includes('=')) {
              const p = normalizeProxyUrlInline(rawVal);
              if (p) found = p.url;
            } else {
              const map = new Map();
              for (const seg of rawVal.split(';')) {
                const idx = seg.indexOf('=');
                if (idx > 0) map.set(seg.slice(0, idx).trim().toLowerCase(), seg.slice(idx + 1).trim());
              }
              for (const pair of [['https', 'http://'], ['http', 'http://'], ['socks', 'socks5://'], ['socks5', 'socks5://']]) {
                const val = map.get(pair[0]);
                if (!val) continue;
                const cand = /^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//.test(val) ? val : pair[1] + val;
                const p = normalizeProxyUrlInline(cand);
                if (p) { found = p.url; break; }
              }
            }
          }
        }
      } catch {}
    } else if (!found && process.platform === 'darwin') {
      try {
        const out = execFileSync('scutil', ['--proxy'], {
          encoding: 'utf8',
          timeout: 1200,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const readVal = (k) => {
          const m = new RegExp('^\\\\s*' + k + '\\\\s*:\\\\s*(.+)$', 'm').exec(out);
          return m ? m[1].trim() : '';
        };
        if (readVal('HTTPSEnable') === '1' && readVal('HTTPSProxy') && readVal('HTTPSPort')) {
          const p = normalizeProxyUrlInline('http://' + readVal('HTTPSProxy') + ':' + readVal('HTTPSPort'));
          if (p) found = p.url;
        } else if (readVal('HTTPEnable') === '1' && readVal('HTTPProxy') && readVal('HTTPPort')) {
          const p = normalizeProxyUrlInline('http://' + readVal('HTTPProxy') + ':' + readVal('HTTPPort'));
          if (p) found = p.url;
        } else if (readVal('SOCKSEnable') === '1' && readVal('SOCKSProxy') && readVal('SOCKSPort')) {
          const p = normalizeProxyUrlInline('socks5://' + readVal('SOCKSProxy') + ':' + readVal('SOCKSPort'));
          if (p) found = p.url;
        }
      } catch {}
    }
    cachedSysProxy = found;
    cachedSysProxyAt = now;
    return found;
  }

  function resolveProxySpecInline(rawProxy, forceSysDetect) {
    const cfg = rawProxy && typeof rawProxy === 'object' ? rawProxy : {};
    const enabled = typeof cfg.enabled === 'boolean' ? cfg.enabled : true;
    const forceHttp1 = cfg.forceHttp1 === true;
    const { bypassCsv, chromiumBypass } = normalizeProxyBypassInline(cfg.bypass);
    let parsed = null;
    if (enabled) {
      if (typeof cfg.url === 'string' && cfg.url.trim()) {
        parsed = normalizeProxyUrlInline(cfg.url);
      } else {
        const sysUrl = detectSystemProxyInline(forceSysDetect);
        if (sysUrl) parsed = normalizeProxyUrlInline(sysUrl);
      }
    }
    const url = parsed ? parsed.url : '';
    const specKey = enabled && url ? url + '|' + bypassCsv + '|' + (forceHttp1 ? 'h1' : 'h2') : 'direct';
    return {
      enabled,
      url,
      displayUrl: parsed ? parsed.displayUrl : '',
      chromiumServer: parsed ? parsed.chromiumServer : '',
      username: parsed ? parsed.username : '',
      password: parsed ? parsed.password : '',
      bypassCsv,
      chromiumBypass,
      forceHttp1,
      specKey,
    };
  }

  const startupPrefs = readJsonSafe(USER_PREFS_FILE, {}) || {};
  const startupProxy = resolveProxySpecInline(startupPrefs.proxy, true);
  const STARTUP_PROXY_SPEC_KEY = startupProxy.specKey;
  let lastAppliedSessionProxyKey = STARTUP_PROXY_SPEC_KEY;
  let activeProxyAuth = { username: startupProxy.username || '', password: startupProxy.password || '' };

  if (startupProxy.enabled && startupProxy.url) {
    try {
      process.env.AGY_MONITOR_INJECTED_PROXY = startupProxy.url;
      process.env.HTTP_PROXY = startupProxy.url;
      process.env.HTTPS_PROXY = startupProxy.url;
      process.env.ALL_PROXY = startupProxy.url;
      process.env.http_proxy = startupProxy.url;
      process.env.https_proxy = startupProxy.url;
      process.env.all_proxy = startupProxy.url;
      process.env.NO_PROXY = startupProxy.bypassCsv;
      process.env.no_proxy = startupProxy.bypassCsv;
      if (startupProxy.forceHttp1) {
        const existingGodebug = String(process.env.GODEBUG || '').trim();
        if (!/(?:^|,)http2client=0(?:,|$)/.test(existingGodebug)) {
          process.env.GODEBUG = existingGodebug ? existingGodebug + ',http2client=0' : 'http2client=0';
        }
      }
    } catch {}
  }

  let electronMod = null;
  try {
    electronMod = require('electron');
    const { app } = electronMod;
    if (app && typeof app.isReady === 'function' && !app.isReady()) {
      if (app.commandLine && !app.commandLine.hasSwitch('remote-debugging-port')) {
        app.commandLine.appendSwitch('remote-debugging-port', '0');
      }
      if (startupProxy.enabled && startupProxy.chromiumServer && app.commandLine) {
        if (!app.commandLine.hasSwitch('proxy-server')) {
          app.commandLine.appendSwitch('proxy-server', startupProxy.chromiumServer);
        }
        if (!app.commandLine.hasSwitch('proxy-bypass-list')) {
          app.commandLine.appendSwitch('proxy-bypass-list', startupProxy.chromiumBypass);
        }
      }
    }
  } catch {}

  function atomicWriteJsonSafe(filePath, obj) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = filePath + '.tmp.' + process.pid + '.' + Date.now();
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      try {
        fs.renameSync(tmp, filePath);
      } catch {
        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
        try { fs.unlinkSync(tmp); } catch {}
      }
    } catch {}
  }

  let cachedRendererSrc = '';
  let cachedRendererMtime = 0;
  function getRendererSource() {
    try {
      if (fs.existsSync(LIVE_RENDERER_FILE)) {
        const st = fs.statSync(LIVE_RENDERER_FILE);
        if (st.mtimeMs !== cachedRendererMtime || !cachedRendererSrc) {
          cachedRendererSrc = fs.readFileSync(LIVE_RENDERER_FILE, 'utf8');
          cachedRendererMtime = st.mtimeMs;
        }
        if (cachedRendererSrc) return cachedRendererSrc;
      }
    } catch {}
    try {
      const embedded = path.join(__dirname, 'agy-monitor-hud.js');
      if (fs.existsSync(embedded)) return fs.readFileSync(embedded, 'utf8');
    } catch {}
    return '';
  }

  let cachedGuideUri = '';
  let cachedGuideMtime = 0;
  function getGuideDataUri() {
    try {
      if (!fs.existsSync(GUIDE_DATA_URI_FILE)) return '';
      const st = fs.statSync(GUIDE_DATA_URI_FILE);
      if (st.mtimeMs !== cachedGuideMtime) {
        cachedGuideUri = fs.readFileSync(GUIDE_DATA_URI_FILE, 'utf8').trim();
        cachedGuideMtime = st.mtimeMs;
      }
      return cachedGuideUri;
    } catch {
      return '';
    }
  }

  let cachedWpEngineSrc = '';
  let cachedWpEngineMtime = 0;
  function getWallpaperEngineSource() {
    try {
      if (fs.existsSync(LIVE_WALLPAPER_ENGINE_FILE)) {
        const st = fs.statSync(LIVE_WALLPAPER_ENGINE_FILE);
        if (st.mtimeMs !== cachedWpEngineMtime || !cachedWpEngineSrc) {
          cachedWpEngineSrc = fs.readFileSync(LIVE_WALLPAPER_ENGINE_FILE, 'utf8');
          cachedWpEngineMtime = st.mtimeMs;
        }
        if (cachedWpEngineSrc) return cachedWpEngineSrc;
      }
    } catch {}
    try {
      const embedded = path.join(__dirname, 'agy-monitor-wallpaper.js');
      if (fs.existsSync(embedded)) return fs.readFileSync(embedded, 'utf8');
    } catch {}
    return '';
  }

  let cachedWpCssText = '';
  let cachedWpCssTag = '';
  function getWallpaperCssInfo() {
    try {
      if (!fs.existsSync(LIVE_WALLPAPER_CSS_FILE)) {
        cachedWpCssText = '';
        cachedWpCssTag = '';
        return { cssText: '', cssTag: '' };
      }
      const st = fs.statSync(LIVE_WALLPAPER_CSS_FILE);
      const tag = st.mtimeMs + ':' + st.size;
      if (tag !== cachedWpCssTag) {
        cachedWpCssText = st.size > 0 ? fs.readFileSync(LIVE_WALLPAPER_CSS_FILE, 'utf8') : '';
        cachedWpCssTag = tag;
      }
      return { cssText: cachedWpCssText, cssTag: cachedWpCssTag };
    } catch {
      return { cssText: '', cssTag: '' };
    }
  }

  let cachedHostI18nSrc = '';
  let cachedHostI18nTag = '';
  function getHostI18nInfo() {
    try {
      if (!fs.existsSync(LIVE_HOST_I18N_FILE)) {
        cachedHostI18nSrc = '';
        cachedHostI18nTag = '';
        return { src: '', tag: '' };
      }
      const st = fs.statSync(LIVE_HOST_I18N_FILE);
      const tag = st.mtimeMs + ':' + st.size;
      if (tag !== cachedHostI18nTag) {
        cachedHostI18nSrc = st.size > 0 ? fs.readFileSync(LIVE_HOST_I18N_FILE, 'utf8') : '';
        cachedHostI18nTag = tag;
      }
      return { src: cachedHostI18nSrc, tag: cachedHostI18nTag };
    } catch {
      return { src: '', tag: '' };
    }
  }

  function isHubWebContents(wc) {
    if (!wc || typeof wc.isDestroyed !== 'function' || wc.isDestroyed()) return false;
    try {
      const t = typeof wc.getType === 'function' ? String(wc.getType() || '') : '';
      if (t === 'webview' || t === 'backgroundPage' || t === 'remote') return false;
      const url = typeof wc.getURL === 'function' ? String(wc.getURL() || '') : '';
      if (!/^https:\\/\\/(127\\.0\\.0\\.1|localhost):\\d+\\//i.test(url)) return false;
      const low = url.toLowerCase();
      const pathOnly = low.split(/[?#]/)[0];
      if (low.startsWith('plugin://') || pathOnly.includes('/sidecar') || pathOnly.includes('agy_monitor') || pathOnly.includes('agy-monitor')) return false;
      return true;
    } catch {
      return false;
    }
  }

  const trackedContents = new Set();
  const wcAppliedCssTag = new WeakMap();
  const wcOwnedWallpaper = new WeakSet();
  const wcAppliedI18nTag = new WeakMap();
  const wcOwnedI18n = new WeakSet();
  let lastViewSig = '';
  let lastStatusWriteAt = 0;
  let syncInFlight = false;
  let syncQueued = false;

  function buildPayload() {
    if (!isPluginInstalled()) {
      return {
        installed: false,
        wantNative: false,
        payload: null,
        hostThemeMode: 'backdrop',
        wantNativeWallpaper: false,
        wantHostI18n: false,
        liveProxy: {
          enabled: false,
          url: '',
          displayUrl: '',
          chromiumServer: '',
          username: '',
          password: '',
          bypassCsv: 'localhost,127.0.0.1,::1',
          chromiumBypass: 'localhost;127.0.0.1;[::1]',
          forceHttp1: false,
          specKey: 'direct',
        },
      };
    }
    const themes = readJsonSafe(THEMES_FILE, {}) || {};
    const prefs = readJsonSafe(USER_PREFS_FILE, {}) || {};
    const wantHostI18n = prefs.language !== 'en';
    const hudEnabled = themes.hudEnabled !== false;
    const mode = themes.hudInjectionMode || 'asar';
    const wantNative = hudEnabled && mode !== 'uia';
    const hostThemeMode =
      themes.hostThemeMode === 'cdp' || themes.hostThemeMode === 'backdrop'
        ? themes.hostThemeMode
        : 'inject';
    const wantNativeWallpaper =
      hostThemeMode === 'inject' &&
      themes.backdropEnabled !== false &&
      Boolean(themes.activeWallpaperId);

    let payload = null;
    if (wantNative) {
      const liteMode = Boolean(prefs.liteMode ?? themes.liteMode);
      const telemetry = readJsonSafe(TELEMETRY_FILE, {}) || {};
      const display = readJsonSafe(DISPLAY_FILE, {
        showSpeed: true,
        showCacheHit: true,
        showModel: true,
        showContext: true,
        showQuota: true,
        updatedAtMs: 0,
      });
      const accent = (themes && themes.colors && typeof themes.colors.accent === 'string')
        ? themes.colors.accent
        : '#5b8cff';
      const bubbleColor = (themes && themes.colors && typeof themes.colors.bubble === 'string')
        ? themes.colors.bubble
        : '#212533';
      const hostBlendPct = Number.isFinite(Number(themes.hostBlendPct))
        ? Math.max(5, Math.min(42, Math.round(Number(themes.hostBlendPct))))
        : 25;
      payload = {
        activeConvId: telemetry.activeConvId || '',
        percent: Number(telemetry.percent) || 0,
        totalUsed: Number(telemetry.totalUsed) || 0,
        windowCap: Number(telemetry.windowCap) || 512000,
        tokPerSec: typeof telemetry.tokPerSec === 'number' ? telemetry.tokPerSec : null,
        cacheHitPct: typeof telemetry.cacheHitPct === 'number' ? telemetry.cacheHitPct : null,
        upstreamModelId: telemetry.upstreamModelId || '',
        quotaQueryEnabled: telemetry.quotaQueryEnabled !== false,
        quota: telemetry.quotaQueryEnabled === false ? null : (telemetry.quota && typeof telemetry.quota === 'object' ? telemetry.quota : null),
        sessions: Array.isArray(telemetry.sessions) ? telemetry.sessions : [],
        accent,
        bubbleColor,
        hostBlendPct,
        liteMode,
        display,
        guideImageDataUri: getGuideDataUri(),
      };
    }

    const liveProxy = resolveProxySpecInline(prefs.proxy, false);

    return {
      installed: true,
      wantNative,
      payload,
      hostThemeMode,
      wantNativeWallpaper,
      wantHostI18n,
      liveProxy,
    };
  }

  async function syncAllContents(forceStatus) {
    if (syncInFlight) {
      syncQueued = true;
      return;
    }
    syncInFlight = true;
    try {
      const { installed, wantNative, payload, hostThemeMode, wantNativeWallpaper, wantHostI18n, liveProxy } = buildPayload();
      activeProxyAuth = { username: liveProxy.username || '', password: liveProxy.password || '' };
      if (
        liveProxy.specKey !== lastAppliedSessionProxyKey &&
        electronMod &&
        electronMod.session &&
        electronMod.session.defaultSession &&
        typeof electronMod.session.defaultSession.setProxy === 'function'
      ) {
        try {
          if (liveProxy.enabled && liveProxy.chromiumServer) {
            await electronMod.session.defaultSession.setProxy({
              proxyRules: liveProxy.chromiumServer,
              proxyBypassRules: liveProxy.chromiumBypass,
            });
          } else {
            await electronMod.session.defaultSession.setProxy({ mode: 'system' });
          }
          lastAppliedSessionProxyKey = liveProxy.specKey;
        } catch {}
      }
      const rendererSrc = wantNative ? getRendererSource() : '';
      const wpEngineSrc = wantNativeWallpaper ? getWallpaperEngineSource() : '';
      const wpCss = wantNativeWallpaper ? getWallpaperCssInfo() : { cssText: '', cssTag: '' };
      const hostI18n = wantHostI18n ? getHostI18nInfo() : { src: '', tag: '' };
      let mountedCount = 0;
      let wallpaperCount = 0;
      let i18nCount = 0;
      let focusedConvId = '';
      let latestPatch = null;

      for (const wc of Array.from(trackedContents)) {
        if (!wc || wc.isDestroyed()) {
          trackedContents.delete(wc);
          continue;
        }
        if (!isHubWebContents(wc)) continue;
        try {
          // 1. Native Shadow DOM Composer HUD
          if (!wantNative) {
            await wc.executeJavaScript('try { window.__agyMonitorNativeHud && window.__agyMonitorNativeHud.dispose(); } catch {}', false).catch(() => {});
          } else if (rendererSrc) {
            const expr =
              '(() => {' +
              ' if (!window.__agyMonitorNativeHud || window.__agyMonitorNativeHud.version !== ' + JSON.stringify(VERSION) + ') {' +
              '   try { (0, eval)(' + JSON.stringify(rendererSrc) + '); } catch (e) { return { hudInjected: false }; }' +
              ' }' +
              ' return window.__agyMonitorNativeHud ? window.__agyMonitorNativeHud.sync(' + JSON.stringify(payload) + ') : { hudInjected: false };' +
              '})()';
            const res = await wc.executeJavaScript(expr, false).catch(() => null);
            if (res && res.hudInjected) {
              mountedCount += 1;
            }
            if (res && res.activeView && res.focused !== false) {
              const av = res.activeView;
              if (av.convId) focusedConvId = av.convId;
              const sig = [av.convId || '', av.workspace || '', av.title || '', av.isNewConversation ? '1' : '0'].join('|');
              if (sig && sig !== '|||' && sig !== lastViewSig) {
                lastViewSig = sig;
                atomicWriteJsonSafe(ACTIVE_VIEW_FILE, {
                  convId: av.convId || '',
                  workspace: av.workspace || '',
                  title: av.title || '',
                  isNewConversation: Boolean(av.isNewConversation),
                  source: 'native_dom',
                  updatedAtMs: Date.now(),
                });
              }
            }
            if (res && res.displayPatch && typeof res.displayPatch === 'object') {
              if (!latestPatch || (Number(res.displayPatch.updatedAtMs) || 0) >= (Number(latestPatch.updatedAtMs) || 0)) {
                latestPatch = res.displayPatch;
              }
            }
          }

          // 2. Scheme 3 Persistent Pure-CSS Wallpaper (differential push by mtime:size tag)
          if (wantNativeWallpaper && wpEngineSrc && wpCss.cssText) {
            let needApply = wcAppliedCssTag.get(wc) !== wpCss.cssTag;
            if (!needApply) {
              const aliveRes = await wc
                .executeJavaScript(
                  'Boolean(window.__agyMonitorWallpaper && window.__agyMonitorWallpaper.version === ' +
                    JSON.stringify(VERSION) +
                    ' && window.__agyMonitorWallpaper.isApplied())',
                  false,
                )
                .catch(() => false);
              if (!aliveRes) needApply = true;
            }
            if (needApply) {
              const wpExpr =
                '(() => {' +
                ' if (!window.__agyMonitorWallpaper || window.__agyMonitorWallpaper.version !== ' + JSON.stringify(VERSION) + ') {' +
                '   try { (0, eval)(' + JSON.stringify(wpEngineSrc) + '); } catch (e) { return false; }' +
                ' }' +
                ' return Boolean(window.__agyMonitorWallpaper && window.__agyMonitorWallpaper.apply(' + JSON.stringify(wpCss.cssText) + '));' +
                '})()';
              const applied = await wc.executeJavaScript(wpExpr, false).catch(() => false);
              if (applied) {
                wcAppliedCssTag.set(wc, wpCss.cssTag);
                wcOwnedWallpaper.add(wc);
                wallpaperCount += 1;
              }
            } else {
              wallpaperCount += 1;
            }
          } else if (!installed || (hostThemeMode !== 'cdp' && (wcOwnedWallpaper.has(wc) || forceStatus))) {
            await wc
              .executeJavaScript(
                '(() => { try { if (window.__agyMonitorWallpaper) { window.__agyMonitorWallpaper.remove(); } else { if (window.__agyMonLayerEngine) window.__agyMonLayerEngine.stop(); const el = document.getElementById("agy-monitor-cdp-theme"); if (el && el.parentNode) el.parentNode.removeChild(el); } } catch {} })()',
                false,
              )
              .catch(() => {});
            wcAppliedCssTag.delete(wc);
            wcOwnedWallpaper.delete(wc);
          }

          // 3. Persistent Host UI Chinese Localization (differential push by mtime:size tag)
          if (wantHostI18n && hostI18n.src) {
            let needI18nApply = wcAppliedI18nTag.get(wc) !== hostI18n.tag;
            if (!needI18nApply) {
              const i18nAlive = await wc
                .executeJavaScript(
                  'Boolean(window.__agyHostI18nApplied && window.__agyMonitorHostI18n && window.__agyMonitorHostI18n.version === ' +
                    JSON.stringify(HOST_I18N_VER) +
                    ' && window.__agyMonitorHostI18n.isApplied())',
                  false,
                )
                .catch(() => false);
              if (!i18nAlive) needI18nApply = true;
            }
            if (needI18nApply) {
              const i18nExpr =
                '(() => {' +
                ' try { (0, eval)(' + JSON.stringify(hostI18n.src) + '); } catch (e) { return false; }' +
                ' return Boolean(window.__agyHostI18nApplied);' +
                '})()';
              const applied = await wc.executeJavaScript(i18nExpr, false).catch(() => false);
              if (applied) {
                wcAppliedI18nTag.set(wc, hostI18n.tag);
                wcOwnedI18n.add(wc);
                i18nCount += 1;
              }
            } else {
              i18nCount += 1;
            }
          } else if (!installed || wcOwnedI18n.has(wc) || forceStatus) {
            await wc
              .executeJavaScript(
                ${JSON.stringify(buildHostI18nRestoreExpr())},
                false,
              )
              .catch(() => {});
            wcAppliedI18nTag.delete(wc);
            wcOwnedI18n.delete(wc);
          }
        } catch {}
      }

      if (installed && latestPatch) {
        atomicWriteJsonSafe(DISPLAY_FILE, {
          showSpeed: latestPatch.showSpeed !== false,
          showCacheHit: latestPatch.showCacheHit !== false,
          showModel: latestPatch.showModel !== false,
          showContext: latestPatch.showContext !== false,
          updatedAtMs: Number(latestPatch.updatedAtMs) || Date.now(),
        });
      }

      const now = Date.now();
      if (!installed) {
        try {
          if (fs.existsSync(STATUS_FILE)) fs.unlinkSync(STATUS_FILE);
        } catch {}
      } else if (forceStatus || now - lastStatusWriteAt >= 2000) {
        lastStatusWriteAt = now;
        atomicWriteJsonSafe(STATUS_FILE, {
          version: VERSION,
          pid: process.pid,
          mountedCount,
          wallpaperCount,
          i18nCount,
          activeConvId: focusedConvId,
          wantNative,
          wantNativeWallpaper,
          wantHostI18n,
          proxyActive: Boolean(liveProxy.enabled && liveProxy.url),
          proxyEnabled: Boolean(liveProxy.enabled),
          proxyDisplayUrl: liveProxy.displayUrl || '',
          proxySpecKey: lastAppliedSessionProxyKey || liveProxy.specKey || '',
          proxyStartupSpecKey: STARTUP_PROXY_SPEC_KEY || '',
          proxyForceHttp1: Boolean(liveProxy.forceHttp1),
          updatedAtMs: now,
        });
      }
    } finally {
      syncInFlight = false;
      if (syncQueued) {
        syncQueued = false;
        setTimeout(() => { void syncAllContents(false); }, 60);
      }
    }
  }

  function attachWebContents(wc) {
    if (!wc || trackedContents.has(wc)) return;
    trackedContents.add(wc);
    const onLoad = () => {
      wcAppliedCssTag.delete(wc);
      wcAppliedI18nTag.delete(wc);
      if (isHubWebContents(wc)) {
        void syncAllContents(true);
      }
    };
    try {
      wc.on('did-finish-load', onLoad);
      wc.on('did-navigate-in-page', onLoad);
      wc.once('destroyed', () => {
        trackedContents.delete(wc);
        wcAppliedCssTag.delete(wc);
        wcOwnedWallpaper.delete(wc);
        wcAppliedI18nTag.delete(wc);
        wcOwnedI18n.delete(wc);
      });
    } catch {}
    if (isHubWebContents(wc)) {
      void syncAllContents(true);
    }
  }

  let debounceTimer = null;
  function scheduleSync() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncAllContents(false);
    }, 90);
  }

  if (electronMod && electronMod.app) {
    const { app, webContents } = electronMod;
    app.on('login', (event, _wc, _req, authInfo, callback) => {
      try {
        if (authInfo && authInfo.isProxy && activeProxyAuth.username) {
          event.preventDefault();
          callback(activeProxyAuth.username, activeProxyAuth.password);
        }
      } catch {}
    });
    app.on('web-contents-created', (_ev, wc) => attachWebContents(wc));
    app.whenReady().then(() => {
      try {
        if (webContents && typeof webContents.getAllWebContents === 'function') {
          for (const wc of webContents.getAllWebContents()) {
            attachWebContents(wc);
          }
        }
      } catch {}
      try {
        if (fs.existsSync(PLUGIN_DATA_DIR)) {
          const watcher = fs.watch(PLUGIN_DATA_DIR, (_evt, fname) => {
            const n = String(fname || '');
            if (
              n === 'hud_telemetry.json' ||
              n === 'hud_display.json' ||
              n === 'themes.json' ||
              n === 'user_prefs.json' ||
              n === 'native_hud_renderer.js' ||
              n === 'native_wallpaper.css' ||
              n === 'native_wallpaper_engine.js' ||
              n === 'native_host_i18n.js'
            ) {
              scheduleSync();
            }
          });
          if (typeof watcher.unref === 'function') watcher.unref();
        }
      } catch {}
      const timer = setInterval(() => {
        void syncAllContents(false);
      }, 2500);
      if (typeof timer.unref === 'function') timer.unref();
    }).catch(() => {});
  }

  module.exports = { version: VERSION, dormant: false };
  }
}
`;
}

// ============================================================================
// Hook Sanitization, Clean Backup & Safe Atomic Disk Replacement
// ============================================================================

function resolveEntryRelPath(parsed) {
  try {
    const pkg = JSON.parse(extractAsarFile(parsed, 'package.json').toString('utf8'));
    const mainField = String(pkg?.main || 'dist/main.js').replace(/\\/g, '/').replace(/^\.\//, '');
    if (lookupAsarNode(parsed.root, mainField)) {
      return { entryRel: mainField, appVersion: String(pkg?.version || 'unknown') };
    }
    return { entryRel: 'dist/main.js', appVersion: String(pkg?.version || 'unknown') };
  } catch {
    return { entryRel: 'dist/main.js', appVersion: 'unknown' };
  }
}

function stripOurMainHook(sourceText) {
  return String(sourceText || '')
    .replace(/^try\s*\{\s*require\(["']\.\/agy-monitor-hud-main["']\);\s*\}\s*catch\s*(?:\([^)]*\))?\s*\{\s*\}\r?\n/gm, '');
}

function injectOurMainHook(cleanText) {
  const stripped = stripOurMainHook(cleanText);
  if (/^["']use strict["'];\r?\n/.test(stripped)) {
    return stripped.replace(/^(["']use strict["'];\r?\n)/, `$1${MAIN_HOOK_LINE}\n`);
  }
  return `${MAIN_HOOK_LINE}\n${stripped}`;
}

function buildCleanStockAsar(sourceBuf) {
  const parsed = parseAsar(sourceBuf);
  const { entryRel } = resolveEntryRelPath(parsed);
  const overrides = new Map();
  if (lookupAsarNode(parsed.root, entryRel)) {
    const rawEntry = extractAsarFile(parsed, entryRel).toString('utf8');
    const cleaned = stripOurMainHook(rawEntry);
    if (cleaned !== rawEntry) {
      overrides.set(entryRel, Buffer.from(cleaned, 'utf8'));
    }
  }
  const removals = new Set([ASAR_MAIN_REL, ASAR_RENDERER_REL, ASAR_WALLPAPER_REL, ASAR_META_REL]);
  if (
    overrides.size === 0 &&
    !lookupAsarNode(parsed.root, ASAR_MAIN_REL) &&
    !lookupAsarNode(parsed.root, ASAR_RENDERER_REL) &&
    !lookupAsarNode(parsed.root, ASAR_WALLPAPER_REL) &&
    !lookupAsarNode(parsed.root, ASAR_META_REL)
  ) {
    return Buffer.from(sourceBuf);
  }
  return repackAsarInMemory(sourceBuf, overrides, removals);
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function isAsarLockError(err) {
  const code = String(err?.code || '').toUpperCase();
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ETXTBSY';
}

function escapeRegExpLiteral(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeStaleSiblingRegex(targetPath) {
  const base = escapeRegExpLiteral(path.basename(targetPath));
  return new RegExp(`^${base}\\.agy_(?:stale|tmp)(?:\\..+)?$`, 'i');
}

async function cleanupStaleAsarSiblings(targetPath, skipNames = new Set()) {
  try {
    const dir = path.dirname(targetPath);
    const re = makeStaleSiblingRegex(targetPath);
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      if (skipNames.has(name) || !re.test(name)) continue;
      await fsp.rm(path.join(dir, name), { force: true }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

function cleanupStaleAsarSiblingsSync(targetPath, skipNames = new Set()) {
  try {
    const dir = path.dirname(targetPath);
    const re = makeStaleSiblingRegex(targetPath);
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (skipNames.has(name) || !re.test(name)) continue;
      try {
        fs.rmSync(path.join(dir, name), { force: true });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

// Safely replace app.asar WITHOUT ever truncating/overwriting an open file in-place:
// 1. Always stage full verified bytes to a sibling temp file first.
// 2. Try direct atomic rename(tmp -> target) when target is unlocked / offline.
// 3. On Windows while Electron holds an open handle to app.asar (FILE_SHARE_DELETE),
//    direct rename(tmp -> target) fails with EPERM/EBUSY. Perform a zero-truncation
//    two-step atomic inode swap: rename(target -> stale) + rename(tmp -> target).
//    The running Electron process continues reading the untouched original inode safely,
//    while the next launch immediately loads the verified new app.asar and cleans stale files.
export async function writeAsarSafely(targetPath, dataBuf, { allowInodeSwap = true } = {}) {
  const stamp = `${process.pid}.${Date.now()}`;
  const tmpPath = `${targetPath}.agy_tmp.${stamp}`;
  try {
    await fsp.writeFile(tmpPath, dataBuf);
    const st = await fsp.stat(tmpPath);
    if (st.size !== dataBuf.length) {
      throw new Error(`临时 ASAR 写入不完整 (${st.size}/${dataBuf.length})`);
    }
  } catch (stageErr) {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    return {
      ok: false,
      locked: isAsarLockError(stageErr),
      error: stageErr?.message || String(stageErr),
    };
  }

  try {
    await fsp.rename(tmpPath, targetPath);
    await cleanupStaleAsarSiblings(targetPath);
    return { ok: true, method: 'atomic_replace' };
  } catch (replaceErr) {
    if (!allowInodeSwap || !isAsarLockError(replaceErr)) {
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      return {
        ok: false,
        locked: isAsarLockError(replaceErr),
        error: replaceErr?.message || String(replaceErr),
      };
    }

    const stalePath = `${targetPath}.agy_stale.${stamp}`;
    try {
      await fsp.rename(targetPath, stalePath);
    } catch (moveOldErr) {
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      return {
        ok: false,
        locked: isAsarLockError(moveOldErr) || isAsarLockError(replaceErr),
        error: moveOldErr?.message || replaceErr?.message || String(replaceErr),
      };
    }

    try {
      await fsp.rename(tmpPath, targetPath);
    } catch (moveNewErr) {
      await fsp.rename(stalePath, targetPath).catch(() => {});
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      return {
        ok: false,
        locked: isAsarLockError(moveNewErr),
        error: moveNewErr?.message || String(moveNewErr),
      };
    }

    await cleanupStaleAsarSiblings(targetPath);
    return { ok: true, method: 'atomic_inode_swap' };
  }
}

function writeAsarSafelySync(targetPath, dataBuf, { allowInodeSwap = true } = {}) {
  const stamp = `${process.pid}.${Date.now()}`;
  const tmpPath = `${targetPath}.agy_tmp.${stamp}`;
  try {
    fs.writeFileSync(tmpPath, dataBuf);
    const st = fs.statSync(tmpPath);
    if (st.size !== dataBuf.length) {
      throw new Error(`临时 ASAR 写入不完整 (${st.size}/${dataBuf.length})`);
    }
  } catch (stageErr) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
    return {
      ok: false,
      locked: isAsarLockError(stageErr),
      error: stageErr?.message || String(stageErr),
    };
  }

  try {
    fs.renameSync(tmpPath, targetPath);
    cleanupStaleAsarSiblingsSync(targetPath);
    return { ok: true, method: 'atomic_replace' };
  } catch (replaceErr) {
    if (!allowInodeSwap || !isAsarLockError(replaceErr)) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
      return {
        ok: false,
        locked: isAsarLockError(replaceErr),
        error: replaceErr?.message || String(replaceErr),
      };
    }

    const stalePath = `${targetPath}.agy_stale.${stamp}`;
    try {
      fs.renameSync(targetPath, stalePath);
    } catch (moveOldErr) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
      return {
        ok: false,
        locked: isAsarLockError(moveOldErr) || isAsarLockError(replaceErr),
        error: moveOldErr?.message || replaceErr?.message || String(replaceErr),
      };
    }

    try {
      fs.renameSync(tmpPath, targetPath);
    } catch (moveNewErr) {
      try {
        fs.renameSync(stalePath, targetPath);
      } catch {
        // ignore
      }
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
      return {
        ok: false,
        locked: isAsarLockError(moveNewErr),
        error: moveNewErr?.message || String(moveNewErr),
      };
    }

    cleanupStaleAsarSiblingsSync(targetPath);
    return { ok: true, method: 'atomic_inode_swap' };
  }
}

function resolveBackupPaths(paths) {
  const backupsDir = path.join(paths.pluginDataDir, 'backups');
  return {
    backupsDir,
    bakPath: path.join(backupsDir, 'app.asar.bak'),
    metaPath: path.join(backupsDir, 'app_asar_backup_meta.json'),
  };
}

function resolvePendingAsarPaths(paths) {
  if (!paths?.pluginDataDir) return { jobPath: '', pidFile: '' };
  return {
    jobPath: path.join(paths.pluginDataDir, 'pending_asar_job.json'),
    pidFile: path.join(paths.pluginDataDir, 'pending_asar_worker.pid'),
  };
}

function resolveDetachedNodeRuntime() {
  const curExec = process.execPath || 'node';
  const baseName = path.basename(curExec).toLowerCase();
  const isElectronHost = Boolean(process.versions?.electron) || !baseName.startsWith('node');
  if (!isElectronHost) {
    return { execPath: curExec, env: { ...process.env } };
  }
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'nodejs', 'node.exe'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          const cleanEnv = { ...process.env };
          delete cleanEnv.ELECTRON_RUN_AS_NODE;
          delete cleanEnv.ELECTRON_NO_ASAR;
          return { execPath: c, env: cleanEnv };
        }
      } catch {
        // ignore
      }
    }
  }
  return {
    execPath: curExec,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' },
  };
}

function samePathLoose(a, b) {
  if (!a || !b) return false;
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

export function readPendingAsarApply(paths = {}, targetPath = '', targetStat = null) {
  const { jobPath, pidFile } = resolvePendingAsarPaths(paths);
  if (!jobPath) return null;
  try {
    if (!fs.existsSync(jobPath)) return null;
    const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    if (!job || typeof job !== 'object') return null;
    if (targetPath && !samePathLoose(job.targetPath, targetPath)) return null;
    if (!job.stagedPath || !fs.existsSync(job.stagedPath)) return null;
    const ttlMs = Number(job.ttlMs) > 0 ? Number(job.ttlMs) : 24 * 60 * 60 * 1000;
    if (Number(job.createdAtMs) > 0 && Date.now() - Number(job.createdAtMs) > ttlMs) return null;
    if (targetStat && targetStat.isFile()) {
      if (Number(job.expectedTargetSize) > 0 && targetStat.size !== Number(job.expectedTargetSize)) return null;
      if (
        Number(job.expectedTargetMtimeMs) > 0 &&
        Math.abs(targetStat.mtimeMs - Number(job.expectedTargetMtimeMs)) > 2000
      ) {
        return null;
      }
    }
    let workerPid = 0;
    try {
      if (pidFile && fs.existsSync(pidFile)) {
        workerPid = Number(fs.readFileSync(pidFile, 'utf8').trim()) || 0;
      }
    } catch {
      workerPid = 0;
    }
    return {
      action: job.action || 'install',
      appVersion: job.appVersion || '',
      installedVersion: job.installedVersion || '',
      stagedPath: job.stagedPath,
      createdAtMs: Number(job.createdAtMs) || 0,
      workerPid,
      workerAlive: isPidAlive(workerPid),
    };
  } catch {
    return null;
  }
}

function clearPendingAsarApplySync(paths = {}, targetPath = '') {
  const { jobPath } = resolvePendingAsarPaths(paths);
  if (jobPath) {
    try {
      fs.rmSync(jobPath, { force: true });
    } catch {
      // ignore
    }
  }
  if (targetPath) {
    try {
      fs.rmSync(`${targetPath}.agy_pending`, { force: true });
    } catch {
      // ignore
    }
  }
}

export function scheduleDeferredAsarApplySync(
  paths = {},
  {
    targetPath = '',
    dataBuf = null,
    action = 'install',
    appVersion = '',
    installedVersion = '',
    watchPid = process.pid,
  } = {},
) {
  const { jobPath, pidFile } = resolvePendingAsarPaths(paths);
  if (!jobPath || !targetPath || !Buffer.isBuffer(dataBuf) || dataBuf.length === 0) {
    return { ok: false, error: '延迟落盘参数不完整' };
  }
  const stagedPath = `${targetPath}.agy_pending`;
  const tmpPath = `${targetPath}.agy_tmp.${process.pid}.${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(jobPath), { recursive: true });
    fs.writeFileSync(tmpPath, dataBuf);
    const tmpStat = fs.statSync(tmpPath);
    if (tmpStat.size !== dataBuf.length) {
      throw new Error(`暂存 ASAR 写入不完整 (${tmpStat.size}/${dataBuf.length})`);
    }
    try {
      fs.rmSync(stagedPath, { force: true });
    } catch {
      // ignore
    }
    fs.renameSync(tmpPath, stagedPath);

    let expectedTargetSize = 0;
    let expectedTargetMtimeMs = 0;
    try {
      const targetStat = fs.statSync(targetPath);
      expectedTargetSize = targetStat.size;
      expectedTargetMtimeMs = targetStat.mtimeMs;
    } catch {
      // ignore
    }

    const pendingSha256 = crypto.createHash('sha256').update(dataBuf).digest('hex');
    const jobObj = {
      version: 1,
      action,
      targetPath,
      stagedPath,
      pidFile,
      pendingSha256,
      pendingSize: dataBuf.length,
      expectedTargetSize,
      expectedTargetMtimeMs,
      appVersion,
      installedVersion,
      createdAtMs: Date.now(),
      ttlMs: 24 * 60 * 60 * 1000,
    };
    const jobTmp = `${jobPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(jobTmp, JSON.stringify(jobObj, null, 2), 'utf8');
    fs.renameSync(jobTmp, jobPath);

    let workerPid = 0;
    try {
      if (fs.existsSync(pidFile)) {
        const existingPid = Number(fs.readFileSync(pidFile, 'utf8').trim()) || 0;
        if (isPidAlive(existingPid)) {
          workerPid = existingPid;
        }
      }
    } catch {
      workerPid = 0;
    }

    const skipSpawn =
      paths?.disableDeferredWorker === true || process.env.AGY_MONITOR_DISABLE_DEFERRED_WORKER === '1';
    if (!workerPid && !skipSpawn && fs.existsSync(ASAR_APPLY_WORKER_PATH)) {
      const runtime = resolveDetachedNodeRuntime();
      const workerArgs = [ASAR_APPLY_WORKER_PATH, '--job', jobPath];
      if (Number.isInteger(watchPid) && watchPid > 0) {
        workerArgs.push('--watch-pid', String(watchPid));
      }
      const child = spawn(runtime.execPath, workerArgs, {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
        env: runtime.env,
      });
      if (child && child.pid) {
        workerPid = child.pid;
        try {
          fs.writeFileSync(pidFile, String(workerPid), 'utf8');
        } catch {
          // ignore
        }
      }
      if (child && typeof child.unref === 'function') {
        child.unref();
      }
    }

    return {
      ok: true,
      queued: true,
      stagedPath,
      jobPath,
      workerPid,
      workerAlive: workerPid > 0 ? isPidAlive(workerPid) : false,
    };
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

async function ensureCleanBackupForCurrentVersion(paths, curAsarBuf, appVersion) {
  const { backupsDir, bakPath, metaPath } = resolveBackupPaths(paths);
  await fsp.mkdir(backupsDir, { recursive: true }).catch(() => {});

  let meta = null;
  try {
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    }
  } catch {
    meta = null;
  }

  // Reuse existing backup ONLY if it belongs to the exact same Antigravity appVersion!
  // If Antigravity auto-updated to a newer version, regenerate clean stock backup from the new app.asar.
  if (fs.existsSync(bakPath) && meta?.appVersion === appVersion) {
    try {
      const bakRaw = await fsp.readFile(bakPath);
      const bakParsed = parseAsar(bakRaw);
      const { appVersion: bakVer } = resolveEntryRelPath(bakParsed);
      if (bakVer === appVersion) {
        const cleanBak = buildCleanStockAsar(bakRaw);
        if (cleanBak.length !== bakRaw.length) {
          await fsp.writeFile(bakPath, cleanBak);
        }
        return { cleanStockBuf: cleanBak, bakPath };
      }
    } catch {
      // Regenerate below
    }
  }

  const cleanStockBuf = buildCleanStockAsar(curAsarBuf);
  const stockSha256 = crypto.createHash('sha256').update(cleanStockBuf).digest('hex');
  await fsp.writeFile(bakPath, cleanStockBuf);
  await atomicWriteJson(metaPath, {
    appVersion,
    stockSha256,
    updatedAtMs: Date.now(),
  });
  return { cleanStockBuf, bakPath };
}

export async function stageLiveHudAssets(paths, themes = null, options = {}) {
  if (!paths?.pluginDataDir) return { staged: false, skipped: false, writtenFiles: 0 };
  const liteMode = Boolean(options?.liteMode ?? themes?.liteMode);
  const rendererFile = paths.nativeHudRendererFile || path.join(paths.pluginDataDir, 'native_hud_renderer.js');
  const wpEngineFile = paths.nativeWallpaperEngineFile || path.join(paths.pluginDataDir, 'native_wallpaper_engine.js');
  const hostI18nFile = paths.nativeHostI18nFile || path.join(paths.pluginDataDir, 'native_host_i18n.js');
  const guideFile = paths.nativeHudGuideFile || path.join(paths.pluginDataDir, 'native_hud_guide.txt');

  let writtenFiles = 0;
  const rendererSrc = buildNativeHudRendererScript();
  const rRes = await writeTextIfChanged(rendererFile, rendererSrc, { sig: sha256Text(rendererSrc) }).catch(() => ({
    written: false,
  }));
  if (rRes.written) writtenFiles += 1;

  const wpEngineSrc = buildNativeWallpaperEngineScript();
  const eRes = await writeTextIfChanged(wpEngineFile, wpEngineSrc, { sig: sha256Text(wpEngineSrc) }).catch(() => ({
    written: false,
  }));
  if (eRes.written) writtenFiles += 1;

  const hostI18nSrc = buildHostI18nSelfContainedScript();
  const iRes = await writeTextIfChanged(hostI18nFile, hostI18nSrc, { sig: sha256Text(hostI18nSrc) }).catch(() => ({
    written: false,
  }));
  if (iRes.written) writtenFiles += 1;

  const guideSrcPath = paths?.assetsDir ? path.join(paths.assetsDir, 'open_console_guide.jpg') : '';
  if (guideSrcPath) {
    const gSrcStat = await fsp.stat(guideSrcPath).catch(() => null);
    if (gSrcStat && gSrcStat.isFile()) {
      const guideInputSig = sha256Text(`${guideSrcPath}|${gSrcStat.mtimeMs}|${gSrcStat.size}`);
      const prevGuide = stagedFileSignatures.get(guideFile);
      let guideAlreadyCurrent = false;
      if (prevGuide && prevGuide.inputSig === guideInputSig) {
        const gOutStat = await fsp.stat(guideFile).catch(() => null);
        if (gOutStat && gOutStat.isFile() && gOutStat.size === prevGuide.size) {
          guideAlreadyCurrent = true;
        }
      }
      if (!guideAlreadyCurrent) {
        const guideUri = await resolveGuideImageDataUri(paths);
        if (guideUri) {
          const gRes = await writeTextIfChanged(guideFile, guideUri, {
            sig: sha256Text(guideUri),
            inputSig: guideInputSig,
          }).catch(() => ({ written: false }));
          if (gRes.written) writtenFiles += 1;
        }
      }
    }
  }

  let wallpaper = null;
  if (themes && typeof themes === 'object') {
    wallpaper = await stageLiveWallpaperCss(paths, themes, { liteMode }).catch(() => null);
    if (wallpaper && wallpaper.staged && wallpaper.skipped === false) {
      writtenFiles += 1;
    }
  }
  return { staged: true, skipped: writtenFiles === 0, writtenFiles, wallpaper };
}

export async function inspectNativeHudState(paths = {}) {
  const hostInfo = detectWindowsHostEnv();
  const asarPath = await resolveHostAsarPath(paths);
  const devToolsPort = await readDevToolsActivePort(paths);
  const heartbeat = readNativeHudHeartbeat(paths);
  const { bakPath } = paths?.pluginDataDir ? resolveBackupPaths(paths) : { bakPath: '' };
  const bakExists = Boolean(bakPath && fs.existsSync(bakPath));

  if (!hostInfo.hasWindowsHost && typeof paths?.hostAsarPath !== 'string') {
    return {
      supported: false,
      asarPath: '',
      asarExists: false,
      bakPath,
      bakExists,
      appVersion: '',
      state: 'unsupported',
      installedVersion: '',
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      error: '仅支持 Windows / WSL2 桌面端',
    };
  }

  if (!asarPath) {
    return {
      supported: true,
      asarPath,
      asarExists: false,
      bakPath,
      bakExists,
      appVersion: '',
      state: 'not_found',
      installedVersion: '',
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      error: '',
    };
  }

  const stat = await fsp.stat(asarPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    asarInspectCache.delete(asarPath);
    return {
      supported: true,
      asarPath,
      asarExists: false,
      bakPath,
      bakExists,
      appVersion: '',
      state: 'not_found',
      installedVersion: '',
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      error: '',
    };
  }

  const cached = asarInspectCache.get(asarPath);
  const pendingApply = readPendingAsarApply(paths, asarPath, stat);
  if (
    cached &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size &&
    cached.currentVersion === NATIVE_HUD_VERSION
  ) {
    return {
      supported: true,
      asarPath,
      asarExists: true,
      bakPath,
      bakExists,
      appVersion: cached.appVersion,
      state: cached.state,
      installedVersion: cached.installedVersion,
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      pendingApply,
      error: '',
    };
  }

  try {
    const inspected = await inspectAsarMetadataBySlices(asarPath, stat.size);
    setBoundedMap(
      asarInspectCache,
      asarPath,
      {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        currentVersion: NATIVE_HUD_VERSION,
        appVersion: inspected.appVersion,
        state: inspected.state,
        installedVersion: inspected.installedVersion,
      },
      ASAR_INSPECT_CACHE_MAX,
    );

    return {
      supported: true,
      asarPath,
      asarExists: true,
      bakPath,
      bakExists,
      appVersion: inspected.appVersion,
      state: inspected.state,
      installedVersion: inspected.installedVersion,
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      pendingApply,
      error: '',
    };
  } catch (err) {
    asarInspectCache.delete(asarPath);
    return {
      supported: true,
      asarPath,
      asarExists: true,
      bakPath,
      bakExists,
      appVersion: '',
      state: 'error',
      installedVersion: '',
      currentVersion: NATIVE_HUD_VERSION,
      devToolsPort,
      heartbeat,
      pendingApply,
      error: err?.message || '解析 app.asar 失败',
    };
  }
}

export async function installNativeHud(paths = {}, { force = false, liteMode, themes = null } = {}) {
  await stageLiveHudAssets(paths, themes, typeof liteMode === 'boolean' ? { liteMode } : {});
  const before = await inspectNativeHudState(paths);
  if (!before.supported) {
    return { ok: false, diskWritten: false, pendingRestart: false, error: before.error || '不支持当前系统', status: before };
  }
  if (!before.asarExists) {
    return { ok: false, diskWritten: false, pendingRestart: false, error: '未找到 Antigravity 的 resources/app.asar', status: before };
  }
  if (!force && before.state === 'installed') {
    clearPendingAsarApplySync(paths, before.asarPath);
    return {
      ok: true,
      alreadyUpToDate: true,
      diskWritten: true,
      pendingRestart: !before.heartbeat.alive,
      status: before,
    };
  }
  if (
    !force &&
    before.pendingApply?.action === 'install' &&
    before.pendingApply.workerAlive &&
    before.pendingApply.appVersion === before.appVersion &&
    before.pendingApply.installedVersion === NATIVE_HUD_VERSION
  ) {
    return {
      ok: true,
      alreadyQueued: true,
      queuedForExit: true,
      diskWritten: false,
      pendingRestart: true,
      status: before,
    };
  }
  if (
    !force &&
    before.state === 'outdated' &&
    before.heartbeat?.hookAlive &&
    isPidAlive(before.heartbeat.pid)
  ) {
    return {
      ok: false,
      diskWritten: false,
      pendingRestart: true,
      deferredWhileRunning: true,
      error: 'Antigravity 正在运行，已通过实时脚本热更新；关闭客户端后将自动完成 app.asar 持久化升级',
      status: before,
    };
  }

  try {
    const curRaw = await fsp.readFile(before.asarPath);
    const curParsed = parseAsar(curRaw);
    const { entryRel, appVersion } = resolveEntryRelPath(curParsed);
    const { cleanStockBuf, bakPath } = await ensureCleanBackupForCurrentVersion(paths, curRaw, appVersion);

    const stockParsed = parseAsar(cleanStockBuf);
    const cleanEntryText = extractAsarFile(stockParsed, entryRel).toString('utf8');
    const patchedEntryText = injectOurMainHook(cleanEntryText);

    const overrides = new Map([
      [entryRel, Buffer.from(patchedEntryText, 'utf8')],
      [ASAR_MAIN_REL, Buffer.from(buildMainHookScript(), 'utf8')],
      [ASAR_RENDERER_REL, Buffer.from(buildNativeHudRendererScript(), 'utf8')],
      [ASAR_WALLPAPER_REL, Buffer.from(buildNativeWallpaperEngineScript(), 'utf8')],
      [
        ASAR_META_REL,
        Buffer.from(
          JSON.stringify({ version: NATIVE_HUD_VERSION, appVersion, injectedAtMs: Date.now() }, null, 2),
          'utf8',
        ),
      ],
    ]);

    const newAsarBuf = repackAsarInMemory(cleanStockBuf, overrides, new Set());
    const writeRes = await writeAsarSafely(before.asarPath, newAsarBuf);
    asarInspectCache.delete(before.asarPath);

    if (!writeRes.ok) {
      if (writeRes.locked && paths?.pluginDataDir) {
        const deferRes = scheduleDeferredAsarApplySync(paths, {
          targetPath: before.asarPath,
          dataBuf: newAsarBuf,
          action: 'install',
          appVersion,
          installedVersion: NATIVE_HUD_VERSION,
        });
        const afterQueued = await inspectNativeHudState(paths);
        if (deferRes.ok) {
          return {
            ok: true,
            diskWritten: false,
            queuedForExit: true,
            pendingRestart: true,
            backupPath: bakPath,
            lockError: writeRes.error,
            message: '已为新版 Antigravity 备好补丁，关闭并重启 Antigravity 后将自动落盘生效',
            status: afterQueued,
          };
        }
      }
      const after = await inspectNativeHudState(paths);
      return {
        ok: false,
        diskWritten: false,
        pendingRestart: true,
        backupPath: bakPath,
        lockError: writeRes.error,
        error: `app.asar 当前被运行中的 Antigravity 占用（${writeRes.error}），已切换 CDP 实时热注入，关闭客户端后将自动完成持久化写入`,
        status: after,
      };
    }

    clearPendingAsarApplySync(paths, before.asarPath);
    const after = await inspectNativeHudState(paths);
    return {
      ok: true,
      alreadyUpToDate: false,
      diskWritten: true,
      writeMethod: writeRes.method,
      pendingRestart: !after.heartbeat.alive,
      backupPath: bakPath,
      status: after,
    };
  } catch (err) {
    asarInspectCache.delete(before.asarPath);
    const after = await inspectNativeHudState(paths).catch(() => before);
    return {
      ok: false,
      diskWritten: false,
      pendingRestart: false,
      error: err?.message || '持久化注入 app.asar 失败',
      status: after,
    };
  }
}

export async function restoreStockAsar(paths = {}) {
  const before = await inspectNativeHudState(paths);
  if (paths?.nativeHudStatusFile) {
    await fsp.rm(paths.nativeHudStatusFile, { force: true }).catch(() => {});
  }
  if (!before.supported || !before.asarExists) {
    return {
      ok: true,
      diskWritten: false,
      pendingRestart: false,
      status: before,
    };
  }

  try {
    const curRaw = await fsp.readFile(before.asarPath);
    const curParsed = parseAsar(curRaw);
    const { appVersion } = resolveEntryRelPath(curParsed);
    const { cleanStockBuf } = await ensureCleanBackupForCurrentVersion(paths, curRaw, appVersion);

    if (before.state === 'stock') {
      clearPendingAsarApplySync(paths, before.asarPath);
      await cleanupStaleAsarSiblings(before.asarPath);
      return {
        ok: true,
        alreadyStock: true,
        diskWritten: true,
        pendingRestart: false,
        status: before,
      };
    }

    const writeRes = await writeAsarSafely(before.asarPath, cleanStockBuf);
    asarInspectCache.delete(before.asarPath);
    if (!writeRes.ok) {
      if (writeRes.locked && paths?.pluginDataDir) {
        const deferRes = scheduleDeferredAsarApplySync(paths, {
          targetPath: before.asarPath,
          dataBuf: cleanStockBuf,
          action: 'restore',
          appVersion,
        });
        const afterQueued = await inspectNativeHudState(paths);
        if (deferRes.ok) {
          return {
            ok: true,
            diskWritten: false,
            queuedForExit: true,
            pendingRestart: true,
            message: '已备好原版 app.asar，关闭 Antigravity 后将自动完成还原',
            status: afterQueued,
          };
        }
      }
      const after = await inspectNativeHudState(paths);
      return {
        ok: false,
        diskWritten: false,
        pendingRestart: true,
        error: `app.asar 当前被占用（${writeRes.error}），请关闭 Antigravity 后再次点击还原`,
        status: after,
      };
    }
    clearPendingAsarApplySync(paths, before.asarPath);
    const after = await inspectNativeHudState(paths);
    return {
      ok: true,
      diskWritten: true,
      writeMethod: writeRes.method,
      pendingRestart: true,
      status: after,
    };
  } catch (err) {
    asarInspectCache.delete(before.asarPath);
    const after = await inspectNativeHudState(paths).catch(() => before);
    return {
      ok: false,
      diskWritten: false,
      pendingRestart: false,
      error: err?.message || '还原 app.asar 失败',
      status: after,
    };
  }
}

export function restoreStockAsarSync(paths = {}) {
  const statusFile =
    paths?.nativeHudStatusFile ||
    (paths?.pluginDataDir ? path.join(paths.pluginDataDir, 'native_hud_status.json') : '');
  if (statusFile) {
    try {
      fs.rmSync(statusFile, { force: true });
    } catch {
      // ignore
    }
  }
  const asarPath = resolveHostAsarPathSync(paths);
  if (!asarPath) {
    return { ok: true, asarPath: '', alreadyStock: false, diskWritten: false, pendingRestart: false, notFound: true };
  }
  let stat = null;
  try {
    stat = fs.statSync(asarPath);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    return { ok: true, asarPath, alreadyStock: false, diskWritten: false, pendingRestart: false, notFound: true };
  }

  try {
    const curRaw = fs.readFileSync(asarPath);
    const curParsed = parseAsar(curRaw);
    const { entryRel, appVersion } = resolveEntryRelPath(curParsed);
    const hasHookInEntry = lookupAsarNode(curParsed.root, entryRel)
      ? extractAsarFile(curParsed, entryRel).toString('utf8').includes(MAIN_HOOK_MARKER)
      : false;
    const hasOurArtifacts = Boolean(
      lookupAsarNode(curParsed.root, ASAR_MAIN_REL) ||
        lookupAsarNode(curParsed.root, ASAR_RENDERER_REL) ||
        lookupAsarNode(curParsed.root, ASAR_WALLPAPER_REL) ||
        lookupAsarNode(curParsed.root, ASAR_META_REL),
    );
    if (!hasHookInEntry && !hasOurArtifacts) {
      cleanupStaleAsarSiblingsSync(asarPath);
      return { ok: true, asarPath, alreadyStock: true, diskWritten: false, pendingRestart: false };
    }

    let cleanStockBuf = null;
    if (paths?.pluginDataDir) {
      const { bakPath, metaPath } = resolveBackupPaths(paths);
      try {
        if (fs.existsSync(bakPath) && fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (meta?.appVersion === appVersion) {
            const bakRaw = fs.readFileSync(bakPath);
            const bakParsed = parseAsar(bakRaw);
            const { appVersion: bakVer } = resolveEntryRelPath(bakParsed);
            if (bakVer === appVersion) {
              cleanStockBuf = buildCleanStockAsar(bakRaw);
            }
          }
        }
      } catch {
        cleanStockBuf = null;
      }
    }
    if (!cleanStockBuf) {
      cleanStockBuf = buildCleanStockAsar(curRaw);
    }

    const writeRes = writeAsarSafelySync(asarPath, cleanStockBuf);
    asarInspectCache.delete(asarPath);
    if (!writeRes.ok) {
      return {
        ok: false,
        asarPath,
        alreadyStock: false,
        diskWritten: false,
        pendingRestart: true,
        locked: Boolean(writeRes.locked),
        error: writeRes.error || 'app.asar 当前被占用',
      };
    }
    return {
      ok: true,
      asarPath,
      alreadyStock: false,
      diskWritten: true,
      writeMethod: writeRes.method,
      pendingRestart: true,
    };
  } catch (err) {
    asarInspectCache.delete(asarPath);
    return {
      ok: false,
      asarPath,
      alreadyStock: false,
      diskWritten: false,
      pendingRestart: false,
      error: err?.message || '还原 app.asar 失败',
    };
  }
}
