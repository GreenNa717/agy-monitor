import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildHostWallpaperCss,
  buildMainHookScript,
  buildNativeHudRendererScript,
  buildNativeWallpaperEngineScript,
  clearHudInjectorCaches,
  computeAsarIntegrity,
  extractAsarFile,
  inspectNativeHudState,
  installNativeHud,
  NATIVE_HUD_VERSION,
  parseAsar,
  readDevToolsActivePort,
  readNativeHudHeartbeat,
  repackAsarInMemory,
  resolveWallpaperDataUriForThemes,
  restoreStockAsar,
  restoreStockAsarSync,
  stageLiveHudAssets,
  stageLiveWallpaperCss,
  writeAsarSafely,
} from '../sidecars/agy_monitor/backend/hud_injector.mjs';
import {
  buildCdpThemeCss,
  isAntigravityAppTarget,
} from '../sidecars/agy_monitor/backend/cdp_theme_bridge.mjs';
import {
  applyPendingAsarJobOnce,
  runPendingAsarWorker,
} from '../sidecars/agy_monitor/backend/asar_apply_worker.mjs';
import { resolvePaths } from '../sidecars/agy_monitor/backend/paths.mjs';
import { createStorage } from '../sidecars/agy_monitor/backend/storage.mjs';
import { createMonitorHandlers } from '../sidecars/agy_monitor/main.mjs';

function buildSyntheticAsar(filesMap) {
  const root = { files: {} };
  const chunks = [];
  let offset = 0;

  for (const [relPath, content] of Object.entries(filesMap)) {
    const segs = relPath.split('/').filter(Boolean);
    let cur = root;
    for (let i = 0; i < segs.length - 1; i += 1) {
      if (!cur.files[segs[i]]) cur.files[segs[i]] = { files: {} };
      cur = cur.files[segs[i]];
    }
    const leaf = segs[segs.length - 1];
    if (content && typeof content === 'object' && content.unpacked === true) {
      cur.files[leaf] = { size: content.size || 12, unpacked: true };
      continue;
    }
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    cur.files[leaf] = {
      size: buf.length,
      offset: String(offset),
      integrity: computeAsarIntegrity(buf),
    };
    chunks.push(buf);
    offset += buf.length;
  }

  const jsonBuf = Buffer.from(JSON.stringify(root), 'utf8');
  const alignedLen = (jsonBuf.length + 3) & ~3;
  const headerBuf = Buffer.alloc(16 + alignedLen);
  headerBuf.writeUInt32LE(4, 0);
  headerBuf.writeUInt32LE(alignedLen + 8, 4);
  headerBuf.writeUInt32LE(alignedLen + 4, 8);
  headerBuf.writeUInt32LE(jsonBuf.length, 12);
  jsonBuf.copy(headerBuf, 16);
  return Buffer.concat([headerBuf, ...chunks], headerBuf.length + offset);
}

test('hud_injector: ASAR repack, install, upgrade auto-reinject, and stock restore roundtrip', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-asar-'));
  try {
    const asarPath = path.join(tmpDir, 'app.asar');
    const devToolsFile = path.join(tmpDir, 'DevToolsActivePort');
    fs.writeFileSync(devToolsFile, '19234\n/devtools/browser/test\n', 'utf8');

    const stockV1 = buildSyntheticAsar({
      'package.json': JSON.stringify({ name: 'antigravity', version: '2.35.1', main: 'dist/main.js' }),
      'dist/main.js': '"use strict";\nconsole.log("stock main 2.35.1");\n',
      'dist/extra.bin': Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
      'node_modules/native.node': { unpacked: true, size: 64 },
    });
    fs.writeFileSync(asarPath, stockV1);

    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      hostAsarPath: asarPath,
      devToolsActivePortFile: devToolsFile,
    });

    // 1. DevToolsActivePort & initial stock inspection
    assert.equal(await readDevToolsActivePort(paths), 19234);
    const before = await inspectNativeHudState(paths);
    assert.equal(before.state, 'stock');
    assert.equal(before.appVersion, '2.35.1');
    assert.equal(before.devToolsPort, 19234);

    // 2. Install persistent HUD into app.asar
    const inst = await installNativeHud(paths);
    assert.equal(inst.ok, true);
    assert.equal(inst.diskWritten, true);
    assert.equal(inst.status.state, 'installed');
    assert.equal(inst.status.installedVersion, NATIVE_HUD_VERSION);
    assert.equal(fs.existsSync(inst.backupPath), true);
    assert.equal(fs.existsSync(paths.nativeHudRendererFile), true);
    assert.equal(fs.existsSync(paths.nativeWallpaperEngineFile), true);

    // Verify integrity & preserved untouched / unpacked files inside repacked ASAR
    const parsedAfter = parseAsar(fs.readFileSync(asarPath));
    const patchedMain = extractAsarFile(parsedAfter, 'dist/main.js').toString('utf8');
    assert.match(patchedMain, /require\("\.\/agy-monitor-hud-main"\)/);
    assert.match(patchedMain, /stock main 2\.35\.1/);
    assert.deepEqual(extractAsarFile(parsedAfter, 'dist/extra.bin'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    assert.equal(parsedAfter.root.files.node_modules.files['native.node'].unpacked, true);
    assert.equal(parsedAfter.root.files.dist.files['agy-monitor-hud-main.js'].integrity.algorithm, 'SHA256');
    assert.equal(parsedAfter.root.files.dist.files['agy-monitor-wallpaper.js'].integrity.algorithm, 'SHA256');

    // 3. Idempotent second run reports alreadyUpToDate
    const inst2 = await installNativeHud(paths);
    assert.equal(inst2.ok, true);
    assert.equal(inst2.alreadyUpToDate, true);

    // 4. Simulate Antigravity official update to 2.36.0 wiping app.asar back to stock
    const stockV2 = buildSyntheticAsar({
      'package.json': JSON.stringify({ name: 'antigravity', version: '2.36.0', main: 'dist/main.js' }),
      'dist/main.js': '"use strict";\nconsole.log("stock main 2.36.0");\n',
    });
    fs.writeFileSync(asarPath, stockV2);
    const afterUpdate = await inspectNativeHudState(paths);
    assert.equal(afterUpdate.state, 'stock');
    assert.equal(afterUpdate.appVersion, '2.36.0');

    // Auto-reinject refreshes backup to 2.36.0 stock and re-patches cleanly
    const reinj = await installNativeHud(paths);
    assert.equal(reinj.ok, true);
    assert.equal(reinj.status.state, 'installed');
    assert.equal(reinj.status.appVersion, '2.36.0');
    const reinjMain = extractAsarFile(parseAsar(fs.readFileSync(asarPath)), 'dist/main.js').toString('utf8');
    assert.match(reinjMain, /stock main 2\.36\.0/);

    // 5. Restore stock restores 2.36.0 (NOT stale 2.35.1!)
    const restored = await restoreStockAsar(paths);
    assert.equal(restored.ok, true);
    assert.equal(restored.diskWritten, true);
    assert.equal(restored.status.state, 'stock');
    assert.equal(restored.status.appVersion, '2.36.0');
    const restoredParsed = parseAsar(fs.readFileSync(asarPath));
    const restoredMain = extractAsarFile(restoredParsed, 'dist/main.js').toString('utf8');
    assert.doesNotMatch(restoredMain, /agy-monitor-hud-main/);
    assert.match(restoredMain, /stock main 2\.36\.0/);
    assert.equal(restoredParsed.root.files.dist.files['agy-monitor-wallpaper.js'], undefined);

    // 6. Direct repackAsarInMemory sanity
    const repacked = repackAsarInMemory(stockV2, new Map([['dist/hello.txt', Buffer.from('world')]]), new Set());
    assert.equal(extractAsarFile(parseAsar(repacked), 'dist/hello.txt').toString('utf8'), 'world');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: embedded scripts are valid JS, support Scheme 3 persistent wallpaper, and default to asar+inject', async () => {
  const rendererSrc = buildNativeHudRendererScript();
  const wallpaperSrc = buildNativeWallpaperEngineScript();
  const mainSrc = buildMainHookScript();
  assert.doesNotThrow(() => new vm.Script(rendererSrc, { filename: 'agy-monitor-hud.js' }));
  assert.doesNotThrow(() => new vm.Script(wallpaperSrc, { filename: 'agy-monitor-wallpaper.js' }));
  assert.doesNotThrow(() => new vm.Script(mainSrc, { filename: 'agy-monitor-hud-main.js' }));
  assert.match(rendererSrc, /attachShadow/);
  assert.match(rendererSrc, /\.agy-composer-footer/);
  assert.match(rendererSrc, /permissions-selector-trigger/);
  assert.match(rendererSrc, /agy-monitor-native-hud-portal/);
  assert.match(rendererSrc, /quota-pill/);
  assert.match(rendererSrc, /showQuota/);
  assert.match(rendererSrc, /账号剩余额度/);
  assert.match(rendererSrc, /backdrop-filter:\s*blur\(16px\)/);
  assert.match(wallpaperSrc, /__agyMonitorWallpaper/);
  assert.match(wallpaperSrc, /__agyMonLayerEngine/);
  assert.match(wallpaperSrc, /agy-monitor-native-hud/);
  assert.match(mainSrc, /remote-debugging-port/);
  assert.match(mainSrc, /web-contents-created/);
  assert.match(rendererSrc, /computeHudBudget/);
  assert.match(rendererSrc, /data-collapsed="1"/);
  assert.match(rendererSrc, /data-compact-ring/);
  assert.match(rendererSrc, /data-qhover/);
  assert.match(rendererSrc, /mCacheSeg/);
  assert.doesNotMatch(rendererSrc, /title="点击选择底部显示项"/);
  assert.match(mainSrc, /native_wallpaper\.css/);

  const cssSample = buildHostWallpaperCss(
    { opacity: 80, blur: 6, dim: 20, hostBlendPct: 25, fit: 'cover', colors: { canvas: '#14161D', accent: '#5B8CFF' } },
    'data:image/webp;base64,AAAA',
  );
  assert.match(cssSample, /--card:/);
  assert.match(cssSample, /--shell-canvas:\s*transparent/);
  assert.match(cssSample, /\.bg-card/);
  assert.match(cssSample, /bg-sidebar\[style\*="sticky"\]/);
  assert.match(cssSample, /\.sticky\.bg-background/);
  assert.match(cssSample, /sticky-main/);
  assert.match(cssSample, /background-attachment:\s*fixed/);
  assert.match(cssSample, /html::before/);
  const injectorSource = fs.readFileSync(
    path.resolve(process.cwd(), 'sidecars/agy_monitor/backend/hud_injector.mjs'),
    'utf8',
  );
  assert.match(injectorSource, /original-fs/);
  assert.match(cssSample, /data:image\/webp;base64,AAAA/);
  assert.match(cssSample, /blur\(6px\)/);
  assert.match(cssSample, /\.bg-sidebar/);
  assert.match(cssSample, /\.surface-composer-card/);
  assert.match(cssSample, /backdrop-filter:\s*blur\(20px\)/);
  assert.match(cssSample, /scrim-clear/);
  assert.match(cssSample, /iframe\[src\*="agy-monitor"\]/);
  assert.doesNotMatch(cssSample, /0\.96\) !important/);

  // Never inject host wallpaper/HUD into plugin:// sidecar iframes (prevents duplicate wallpaper inside AGY Console)
  assert.equal(
    isAntigravityAppTarget({
      type: 'iframe',
      url: 'plugin://agy-monitor--agy_monitor-63521/?token=abc',
      title: 'plugin://agy-monitor--agy_monitor-63521/?token=abc',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/1',
    }),
    false,
  );
  assert.equal(
    isAntigravityAppTarget({
      type: 'iframe',
      url: 'plugin://swarm--swarm_board-49902/?token=abc',
      title: 'plugin://swarm--swarm_board-49902/',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/2',
    }),
    false,
  );
  assert.equal(
    isAntigravityAppTarget({
      type: 'page',
      url: 'https://127.0.0.1:54966/c/123?project=abc&tab=sidecar__agy-monitor%2Fagy_monitor__%2F',
      title: 'Test - Antigravity',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9229/devtools/page/3',
    }),
    true,
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-routes-'));
  try {
    const asarPath = path.join(tmpDir, 'app.asar');
    fs.writeFileSync(
      asarPath,
      buildSyntheticAsar({
        'package.json': JSON.stringify({ name: 'antigravity', version: '2.35.1', main: 'dist/main.js' }),
        'dist/main.js': '"use strict";\nconsole.log("ok");\n',
      }),
    );
    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      hostAsarPath: asarPath,
      devToolsActivePortFile: path.join(tmpDir, 'missing_dt'),
    });
    const storage = createStorage(paths);
    const themes = await storage.getThemes();
    assert.equal(themes.hudEnabled, true);
    assert.equal(themes.hudInjectionMode, 'asar');
    assert.equal(themes.hudAutoReinject, true);
    assert.equal(themes.hostThemeMode, 'inject');

    // Stage live wallpaper CSS for Scheme 3 (inject) and verify clear on backdrop/disabled
    const stagedOn = await stageLiveWallpaperCss(paths, themes);
    assert.equal(stagedOn.staged, true);
    assert.equal(stagedOn.hasCss, true);
    assert.equal(fs.existsSync(paths.nativeWallpaperCssFile), true);
    assert.match(fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8'), /html::before/);

    const stagedOff = await stageLiveWallpaperCss(paths, { ...themes, hostThemeMode: 'backdrop' });
    assert.equal(stagedOff.staged, true);
    assert.equal(stagedOff.hasCss, false);
    assert.equal(fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8'), '');

    // Heartbeat freshness check (HUD + Wallpaper tracked independently)
    fs.writeFileSync(
      paths.nativeHudStatusFile,
      JSON.stringify({ version: NATIVE_HUD_VERSION, pid: 1234, mountedCount: 1, wallpaperCount: 1, updatedAtMs: Date.now() }),
    );
    const hb = readNativeHudHeartbeat(paths);
    assert.equal(hb.alive, true);
    assert.equal(hb.hookAlive, true);
    assert.equal(hb.wallpaperAlive, true);
    assert.equal(hb.wallpaperCount, 1);

    const fakeCdp = {
      sync: async () => ({ connected: false, hudInjected: false, styleApplied: false, port: 9229 }),
      getStatus: () => ({ connected: false, hudInjected: false, styleApplied: false, port: 9229 }),
      isHudInjected: () => false,
      updateHudData: async () => false,
    };
    const routes = createMonitorHandlers({
      paths,
      storage,
      cdpBridge: fakeCdp,
      hudPublisher: { refreshFromDb: async () => {} },
    });

    // Scheme 3 backdrop action installs app.asar hook and stages live CSS
    const backdropActionHandler = routes.get('POST /api/theme/backdrop/action');
    assert.equal(typeof backdropActionHandler, 'function');
    const injectRes = await backdropActionHandler({ action: 'inject_sync', hostThemeMode: 'inject' });
    assert.equal(injectRes.ok, true);
    assert.equal(injectRes.themeState.hostThemeMode, 'inject');
    assert.equal(injectRes.status.nativeHud.state, 'installed');
    assert.match(fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8'), /html::before/);

    const installHandler = routes.get('POST /api/hud/native/action');
    assert.equal(typeof installHandler, 'function');
    const statusHandler = routes.get('GET /api/hud/native/status');
    const statusRes = await statusHandler();
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.config.hudInjectionMode, 'asar');
    assert.equal(statusRes.nativeHud.state, 'installed');

    // Restore stock restores app.asar, switches hostThemeMode off inject, disables HUD, and clears staged CSS
    const restoreRes = await installHandler({ action: 'restore' });
    assert.equal(restoreRes.ok, true);
    assert.equal(restoreRes.nativeHud.state, 'stock');
    assert.equal(restoreRes.themeState.hostThemeMode, 'backdrop');
    assert.equal(restoreRes.themeState.hudEnabled, false);
    assert.equal(fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8'), '');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: main hook wallpaper cleanup does not leak global window.el', () => {
  const mainSrc = buildMainHookScript();
  assert.doesNotMatch(mainSrc, /var el = document\.getElementById\("agy-monitor-cdp-theme"\)/);

  const match = mainSrc.match(
    /\.executeJavaScript\(\s*'([^']*agy-monitor-cdp-theme[^']*)'/,
  );
  assert.ok(match, 'expected wallpaper cleanup executeJavaScript expression in buildMainHookScript');

  const sentinelFn = () => 'host-el-intact';
  const ctx = {
    el: sentinelFn,
    document: { getElementById: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(match[1], ctx);

  assert.equal(ctx.window.el, sentinelFn);
  assert.equal(ctx.el, sentinelFn);
});

test('hud_injector: inspectNativeHudState reads only ASAR header + target slices and caches by (path, mtimeMs, size)', async () => {
  clearHudInjectorCaches();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-slice-'));
  const origReadFile = fsp.readFile;
  const origOpen = fsp.open;
  try {
    const asarPath = path.join(tmpDir, 'app.asar');
    const bigBlob = Buffer.alloc(4 * 1024 * 1024, 0xab);
    fs.writeFileSync(
      asarPath,
      buildSyntheticAsar({
        'package.json': JSON.stringify({ name: 'antigravity', version: '2.37.0', main: 'dist/main.js' }),
        'dist/main.js': '"use strict";\nconsole.log("slice test");\n',
        'dist/huge_asset.bin': bigBlob,
      }),
    );

    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      hostAsarPath: asarPath,
      devToolsActivePortFile: path.join(tmpDir, 'missing_dt'),
    });

    let fullReadFileCalls = 0;
    let openCalls = 0;
    let closeCalls = 0;
    let totalBytesRead = 0;

    fsp.readFile = async function patchedReadFile(target, ...rest) {
      if (path.resolve(String(target)) === path.resolve(asarPath)) {
        fullReadFileCalls += 1;
      }
      return origReadFile.call(this, target, ...rest);
    };
    fsp.open = async function patchedOpen(target, ...rest) {
      const fh = await origOpen.call(this, target, ...rest);
      if (path.resolve(String(target)) === path.resolve(asarPath)) {
        openCalls += 1;
        const origRead = fh.read.bind(fh);
        const origClose = fh.close.bind(fh);
        fh.read = async (...args) => {
          const r = await origRead(...args);
          totalBytesRead += Number(r?.bytesRead || 0);
          return r;
        };
        fh.close = async (...args) => {
          closeCalls += 1;
          return origClose(...args);
        };
      }
      return fh;
    };

    // 1. First inspect (cache miss): opens via fsp.open, reads ONLY header + package.json + dist/main.js (< 64 KB), NEVER calls readFile
    const r1 = await inspectNativeHudState(paths);
    assert.equal(r1.state, 'stock');
    assert.equal(r1.appVersion, '2.37.0');
    assert.equal(fullReadFileCalls, 0, 'inspectNativeHudState must never call full fsp.readFile on app.asar');
    assert.equal(openCalls, 1);
    assert.equal(closeCalls, 1);
    assert.ok(totalBytesRead > 0 && totalBytesRead < 64 * 1024, `expected slice-only read < 64KB, got ${totalBytesRead}`);

    // 2. Second inspect with unchanged metadata: cache hit -> ZERO opens, ZERO bytes read
    const bytesBeforeHit = totalBytesRead;
    const r2 = await inspectNativeHudState(paths);
    assert.equal(r2.state, 'stock');
    assert.equal(r2.appVersion, '2.37.0');
    assert.equal(openCalls, 1, 'cached inspect should perform zero fsp.open calls');
    assert.equal(totalBytesRead, bytesBeforeHit, 'cached inspect should read 0 bytes');

    // 3. Clearing cache forces a fresh slice-only read on next inspect
    clearHudInjectorCaches();
    const r3 = await inspectNativeHudState(paths);
    assert.equal(r3.state, 'stock');
    assert.equal(openCalls, 2);
    assert.equal(closeCalls, 2);
    assert.equal(fullReadFileCalls, 0);

    // 4. Modifying app.asar invalidates cache automatically by (mtimeMs, size)
    fs.writeFileSync(
      asarPath,
      buildSyntheticAsar({
        'package.json': JSON.stringify({ name: 'antigravity', version: '2.38.1', main: 'dist/main.js' }),
        'dist/main.js': '"use strict";\ntry { require("./agy-monitor-hud-main"); } catch {}\nconsole.log("patched");\n',
        'dist/agy-monitor-hud-main.js': '// main',
        'dist/agy-monitor-hud.js': '// hud',
        'dist/agy-monitor-wallpaper.js': '// wp',
        'dist/agy-monitor-hud.meta.json': JSON.stringify({ version: NATIVE_HUD_VERSION }),
        'dist/huge_asset.bin': bigBlob,
      }),
    );
    const r4 = await inspectNativeHudState(paths);
    assert.equal(r4.state, 'installed');
    assert.equal(r4.appVersion, '2.38.1');
    assert.equal(r4.installedVersion, NATIVE_HUD_VERSION);
    assert.equal(openCalls, 3);
    assert.equal(closeCalls, 3);
    assert.equal(fullReadFileCalls, 0);
  } finally {
    fsp.readFile = origReadFile;
    fsp.open = origOpen;
    clearHudInjectorCaches();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: stageLiveHudAssets skips unchanged writes, reacts to liteMode toggle & file removal, and clears caches', async () => {
  clearHudInjectorCaches();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-stage-'));
  const origReadFile = fsp.readFile;
  try {
    const wpDir = path.join(tmpDir, 'wallpapers');
    const assetsDir = path.join(tmpDir, 'assets');
    fs.mkdirSync(wpDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    const wpFile = path.join(wpDir, 'wp-1.webp');
    const guideFileSrc = path.join(assetsDir, 'open_console_guide.jpg');
    fs.writeFileSync(wpFile, Buffer.from('FAKE_WEBP_DATA_123456'));
    fs.writeFileSync(guideFileSrc, Buffer.from('FAKE_GUIDE_JPEG_7890'));

    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      wallpapersDir: wpDir,
      assetsDir,
    });
    const themes = {
      hostThemeMode: 'inject',
      backdropEnabled: true,
      activeWallpaperId: 'wp-1',
      opacity: 60,
      blur: 6,
      dim: 30,
      hostBlendPct: 22,
      fit: 'cover',
      colors: { canvas: '#111218', chrome: '#171922', bubble: '#1d202b', accent: '#5b8cff' },
    };

    let wpReadCount = 0;
    fsp.readFile = async function spyReadFile(target, ...rest) {
      if (path.resolve(String(target)) === path.resolve(wpFile)) {
        wpReadCount += 1;
      }
      return origReadFile.call(this, target, ...rest);
    };

    // 1. Initial staging writes all live assets
    const first = await stageLiveHudAssets(paths, themes, { liteMode: false });
    assert.equal(first.staged, true);
    assert.equal(first.skipped, false);
    assert.ok(first.writtenFiles >= 4);
    assert.equal(wpReadCount, 1);

    const mtimesBefore = {
      renderer: fs.statSync(paths.nativeHudRendererFile).mtimeMs,
      engine: fs.statSync(paths.nativeWallpaperEngineFile).mtimeMs,
      guide: fs.statSync(paths.nativeHudGuideFile).mtimeMs,
      css: fs.statSync(paths.nativeWallpaperCssFile).mtimeMs,
    };

    // 2. Repeated staging with identical inputs skips ALL disk writes and wallpaper reads
    await new Promise((r) => setTimeout(r, 25));
    const second = await stageLiveHudAssets(paths, themes, { liteMode: false });
    assert.equal(second.staged, true);
    assert.equal(second.skipped, true);
    assert.equal(second.writtenFiles, 0);
    assert.equal(wpReadCount, 1);
    assert.equal(fs.statSync(paths.nativeHudRendererFile).mtimeMs, mtimesBefore.renderer);
    assert.equal(fs.statSync(paths.nativeWallpaperEngineFile).mtimeMs, mtimesBefore.engine);
    assert.equal(fs.statSync(paths.nativeHudGuideFile).mtimeMs, mtimesBefore.guide);
    assert.equal(fs.statSync(paths.nativeWallpaperCssFile).mtimeMs, mtimesBefore.css);

    // 3. Toggling liteMode changes staged signature and immediately rewrites native_wallpaper.css
    const liteOn = await stageLiveHudAssets(paths, themes, { liteMode: true });
    assert.equal(liteOn.staged, true);
    assert.equal(liteOn.skipped, false);
    assert.equal(liteOn.writtenFiles, 1);
    const liteCss = fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8');
    assert.doesNotMatch(liteCss, /backdrop-filter:\s*blur\(/);
    assert.doesNotMatch(liteCss, /background-attachment:\s*fixed/);
    assert.match(liteCss, /backdrop-filter:\s*none\s*!important/);

    // 4. Subsequent tick with liteMode still true skips again
    const liteRepeat = await stageLiveHudAssets(paths, themes, { liteMode: true });
    assert.equal(liteRepeat.skipped, true);
    assert.equal(liteRepeat.writtenFiles, 0);

    // 5. Deleting a staged target file causes re-staging even with same signature
    fs.unlinkSync(paths.nativeWallpaperCssFile);
    const restoredFile = await stageLiveHudAssets(paths, themes, { liteMode: true });
    assert.equal(restoredFile.skipped, false);
    assert.equal(fs.existsSync(paths.nativeWallpaperCssFile), true);

    // 6. Disabling wallpaper automatically releases cached wallpaper base64
    await stageLiveWallpaperCss(paths, { ...themes, activeWallpaperId: '' });
    assert.equal(fs.readFileSync(paths.nativeWallpaperCssFile, 'utf8'), '');
    const uriAfterClear = await resolveWallpaperDataUriForThemes(paths, themes);
    assert.match(uriAfterClear, /^data:image\/webp;base64,/);
    assert.equal(wpReadCount, 2, 'wallpaper base64 cache must be released when wallpaper is disabled');

    // 7. clearHudInjectorCaches releases wallpaper/guide/signature caches cleanly
    clearHudInjectorCaches();
    await resolveWallpaperDataUriForThemes(paths, themes);
    assert.equal(wpReadCount, 3, 'clearHudInjectorCaches must clear cached wallpaper base64');

    // 8. installNativeHud forwards themes + liteMode to stageLiveHudAssets so native_wallpaper.css stages cleanly
    const asarPath = path.join(tmpDir, 'install_themes.asar');
    fs.writeFileSync(
      asarPath,
      buildSyntheticAsar({
        'package.json': JSON.stringify({ name: 'antigravity', version: '2.39.0', main: 'dist/main.js' }),
        'dist/main.js': '"use strict";\nconsole.log("ok");\n',
      }),
    );
    const installPaths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata_install'),
      geminiConfigDir: path.join(tmpDir, 'config_install'),
      wallpapersDir: wpDir,
      assetsDir,
      hostAsarPath: asarPath,
      devToolsActivePortFile: path.join(tmpDir, 'missing_dt'),
    });
    const instWithThemes = await installNativeHud(installPaths, {
      force: true,
      liteMode: true,
      themes: { ...themes, liteMode: true },
    });
    assert.equal(instWithThemes.ok, true);
    assert.equal(fs.existsSync(installPaths.nativeWallpaperCssFile), true);
    const stagedViaInstallCss = fs.readFileSync(installPaths.nativeWallpaperCssFile, 'utf8');
    assert.match(stagedViaInstallCss, /--agy-wp-url:/);
    assert.doesNotMatch(stagedViaInstallCss, /backdrop-filter:\s*blur\(/);
    assert.match(stagedViaInstallCss, /backdrop-filter:\s*none\s*!important/);
  } finally {
    fsp.readFile = origReadFile;
    clearHudInjectorCaches();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: CSS deduplicates wallpaper base64 via --agy-wp-url and supports opt-in liteMode for dark & light themes', () => {
  const marker = 'data:image/webp;base64,UNIQUE_WP_DEDUP_TOKEN_999';
  const darkThemes = {
    opacity: 75,
    blur: 8,
    dim: 25,
    hostBlendPct: 24,
    fit: 'cover',
    colors: { canvas: '#12131a', chrome: '#181a24', bubble: '#202330', accent: '#5b8cff' },
  };
  const lightThemes = {
    ...darkThemes,
    colors: { canvas: '#f4f6fb', chrome: '#ffffff', bubble: '#eaedf6', accent: '#3570e4' },
  };

  // Default (liteMode === false): zero visual regression + base64 appears ONCE in :root --agy-wp-url
  const normalCss = buildHostWallpaperCss(darkThemes, marker);
  assert.equal(normalCss.split(marker).length - 1, 1, 'base64 wallpaper data URI must appear only once in CSS');
  assert.match(normalCss, /--agy-wp-url:\s*url\("data:image\/webp;base64,UNIQUE_WP_DEDUP_TOKEN_999"\);/);
  assert.match(normalCss, /html::before[\s\S]*?background-image:\s*var\(--agy-wp-url\)\s*!important/);
  assert.match(normalCss, /sticky-main"\]::before[\s\S]*?background-image:\s*var\(--agy-wp-url\)\s*!important/);
  assert.match(normalCss, /backdrop-filter:\s*blur\(20px\)/);
  assert.match(normalCss, /background-attachment:\s*fixed/);

  // Opt-in liteMode === true via options AND via themes.liteMode / buildCdpThemeCss
  const liteDarkCss = buildHostWallpaperCss(darkThemes, marker, { liteMode: true });
  const liteViaThemeProp = buildCdpThemeCss({ ...darkThemes, liteMode: true }, marker);
  assert.equal(liteDarkCss, liteViaThemeProp);
  assert.equal(liteDarkCss.split(marker).length - 1, 1, 'liteMode CSS must also deduplicate wallpaper URL via --agy-wp-url');
  assert.doesNotMatch(liteDarkCss, /backdrop-filter:\s*blur\(/, 'liteMode must eliminate all backdrop-filter blur rules');
  assert.doesNotMatch(liteDarkCss, /background-attachment:\s*fixed/, 'liteMode must eliminate fixed-attachment sticky wallpaper masks');
  assert.match(liteDarkCss, /\.agy-user-bubble[\s\S]*?backdrop-filter:\s*none\s*!important[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(liteDarkCss, /\.bg-card[\s\S]*?backdrop-filter:\s*none\s*!important[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(liteDarkCss, /\[role="dialog"\][\s\S]*?backdrop-filter:\s*none\s*!important[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(liteDarkCss, /sticky-main"\]::before[\s\S]*?background-image:\s*none\s*!important[\s\S]*?filter:\s*none\s*!important/);
  assert.match(liteDarkCss, /html\.light[\s\S]*?--agy-lite-card-bg:/, 'dark palette liteMode must still guard light host themes');

  const liteLightCss = buildHostWallpaperCss(lightThemes, marker, { liteMode: true });
  assert.doesNotMatch(liteLightCss, /backdrop-filter:\s*blur\(/);
  assert.doesNotMatch(liteLightCss, /background-attachment:\s*fixed/);
  assert.match(liteLightCss, /html\.dark[\s\S]*?--agy-lite-card-bg:/, 'light palette liteMode must still guard dark host themes');
});

test('hud_injector: scanLayers pauses when document.hidden, rescans on visibilitychange, and throttles mutations to 350ms with trailing settle', () => {
  const scriptSrc = buildNativeWallpaperEngineScript();
  assert.doesNotMatch(scriptSrc, /,\s*32\s*\)/, 'must not retain 32ms MutationObserver polling');
  assert.match(scriptSrc, /document\.hidden/);
  assert.match(scriptSrc, /visibilitychange/);
  assert.match(scriptSrc, /350/);

  let nowMs = 1000;
  let nextTimerId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const docListeners = new Map();
  const winListeners = new Map();
  let mutCallback = null;
  let elementsFromPointCalls = 0;

  const styleEl = { id: 'agy-monitor-cdp-theme', textContent: '', parentNode: null };
  const headEl = { appendChild(el) { el.parentNode = headEl; } };
  const bodyEl = { tagName: 'BODY' };

  const fakeDoc = {
    hidden: false,
    head: headEl,
    body: bodyEl,
    documentElement: headEl,
    getElementById: (id) => (id === styleEl.id && styleEl.parentNode ? styleEl : null),
    createElement: () => styleEl,
    elementsFromPoint: () => {
      elementsFromPointCalls += 1;
      return [];
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!docListeners.has(evt)) docListeners.set(evt, new Set());
      docListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      docListeners.get(evt)?.delete(fn);
    },
  };

  class FakeMutationObserver {
    constructor(cb) {
      mutCallback = cb;
      this.disconnected = false;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }

  const fakeWin = {
    innerWidth: 1280,
    innerHeight: 800,
    document: fakeDoc,
    MutationObserver: FakeMutationObserver,
    Set,
    Math,
    Date: { now: () => nowMs },
    setTimeout: (fn, delay) => {
      const id = nextTimerId++;
      timeouts.set(id, { fn, delay, at: nowMs + delay });
      return id;
    },
    clearTimeout: (id) => {
      timeouts.delete(id);
    },
    setInterval: (fn, delay) => {
      const id = nextTimerId++;
      intervals.set(id, { fn, delay });
      return id;
    },
    clearInterval: (id) => {
      intervals.delete(id);
    },
    addEventListener: (evt, fn) => {
      if (!winListeners.has(evt)) winListeners.set(evt, new Set());
      winListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      winListeners.get(evt)?.delete(fn);
    },
  };
  fakeWin.window = fakeWin;

  vm.createContext(fakeWin);
  vm.runInContext(scriptSrc, fakeWin);
  fakeWin.__agyMonitorWallpaper.apply('html { color: #fff; }');

  assert.equal(fakeWin.__agyMonLayerEngine.version, 6);
  assert.equal(fakeWin.__agyMonLayerEngine.throttleMs, 350);
  const initialCalls = elementsFromPointCalls;
  assert.ok(initialCalls > 0, 'initial visible apply should scan once');

  // 1. When document.hidden is true, direct scanLayers() and MutationObserver skip all work
  fakeDoc.hidden = true;
  elementsFromPointCalls = 0;
  assert.equal(fakeWin.__agyMonLayerEngine.scan(), 0);
  assert.equal(elementsFromPointCalls, 0);
  mutCallback();
  mutCallback();
  assert.equal(timeouts.size, 0, 'must not schedule mutation timers while document.hidden is true');
  assert.equal(elementsFromPointCalls, 0);

  // 2. When visibilitychange fires with document.hidden = false, clean rescan executes immediately
  fakeDoc.hidden = false;
  nowMs += 500;
  for (const fn of docListeners.get('visibilitychange') || []) fn();
  assert.ok(elementsFromPointCalls > 0, 'visibilitychange back to visible must trigger a clean rescan');

  // 3. Rapid MutationObserver bursts coalesce into a single >= 350ms timer (never 32ms) and settle cleanly
  elementsFromPointCalls = 0;
  nowMs += 400;
  mutCallback();
  mutCallback();
  mutCallback();
  assert.equal(timeouts.size, 1, 'rapid mutation burst must coalesce into one throttled timer');
  const [firstId, firstEntry] = [...timeouts.entries()][0];
  assert.ok(firstEntry.delay >= 350, `expected throttle delay >= 350ms, got ${firstEntry.delay}`);

  // Fire timer -> runs scan once and settles
  timeouts.delete(firstId);
  nowMs += firstEntry.delay;
  firstEntry.fn();
  assert.ok(elementsFromPointCalls > 0, 'throttled timer must perform layer scan');

  // Mutation immediately after scan schedules trailing settle timer honoring 350ms cadence
  elementsFromPointCalls = 0;
  nowMs += 40;
  mutCallback();
  assert.equal(timeouts.size, 1);
  const [trailId, trailEntry] = [...timeouts.entries()][0];
  assert.ok(trailEntry.delay >= 300, `expected trailing delay ~310ms, got ${trailEntry.delay}`);
  timeouts.delete(trailId);
  nowMs += trailEntry.delay;
  trailEntry.fn();
  assert.ok(elementsFromPointCalls > 0, 'trailing timer must settle final DOM state');

  // 4. stop() cleans up listeners and timers
  fakeWin.__agyMonLayerEngine.stop();
  assert.equal((docListeners.get('visibilitychange') || new Set()).size, 0);
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
});

test('hud_injector: non-lite sticky CSS avoids overflow:clip, uses clip-path on ::before, and adapts to html.light / html.dark', () => {
  const marker = 'data:image/webp;base64,LIGHT_ADAPT_TOKEN_123';
  const darkThemes = {
    opacity: 80,
    blur: 10,
    dim: 20,
    hostBlendPct: 25,
    fit: 'cover',
    colors: { canvas: '#12131a', chrome: '#181a24', bubble: '#202330', accent: '#5b8cff' },
  };
  const lightThemes = {
    ...darkThemes,
    colors: { canvas: '#f4f6fb', chrome: '#ffffff', bubble: '#eaedf6', accent: '#3570e4' },
  };
  const darkCss = buildHostWallpaperCss(darkThemes, marker, { liteMode: false });
  assert.doesNotMatch(darkCss, /overflow:\s*clip/, 'sticky containers must not force overflow:clip');
  assert.match(darkCss, /clip-path:\s*inset\(16px\)\s*!important/, 'blurred sticky ::before must clip blur bleed via clip-path');
  assert.match(darkCss, /html\.light[\s\S]*?--agy-host-canvas-bg:/);
  assert.match(darkCss, /html\.light[\s\S]*?--agy-host-sidebar-bg:/);
  assert.match(darkCss, /html\.light[\s\S]*?--agy-host-sticky-sidebar-veil:/);

  const lightCss = buildHostWallpaperCss(lightThemes, marker, { liteMode: false });
  assert.doesNotMatch(lightCss, /overflow:\s*clip/);
  assert.match(lightCss, /html\.dark[\s\S]*?--agy-host-canvas-bg:/);
});

test('hud_injector: layer engine skips oversized sidebar sticky nodes and project-header/tree containers', () => {
  const scriptSrc = buildNativeWallpaperEngineScript();
  const styleEl = { id: 'agy-monitor-cdp-theme', textContent: '', parentNode: null };
  const headEl = { appendChild(el) { el.parentNode = headEl; } };

  function makeFakeNode({ rect, classes = '', inSidebar = true, hasProjectChild = false }) {
    const attrs = new Map();
    return {
      nodeType: 1,
      tagName: 'DIV',
      className: classes,
      style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 40, ...rect }),
      closest: (sel) => {
        if (sel.includes('navigation') || sel.includes('sidebar')) return inSidebar ? {} : null;
        return null;
      },
      querySelector: (sel) => {
        if (hasProjectChild && sel.includes('project-header')) return {};
        return null;
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      setAttribute: (k, v) => attrs.set(k, String(v)),
      removeAttribute: (k) => attrs.delete(k),
      matches: () => false,
    };
  }

  const tallSidebarSticky = makeFakeNode({ rect: { height: 140 }, classes: 'sticky top-0' });
  const projectListSticky = makeFakeNode({ rect: { height: 52 }, classes: 'sticky top-0', hasProjectChild: true });
  const compactSidebarHeader = makeFakeNode({ rect: { height: 40 }, classes: 'sticky top-0' });

  const fakeDoc = {
    hidden: false,
    head: headEl,
    body: { tagName: 'BODY' },
    documentElement: headEl,
    getElementById: (id) => (id === styleEl.id && styleEl.parentNode ? styleEl : null),
    createElement: () => styleEl,
    elementsFromPoint: () => [tallSidebarSticky, projectListSticky, compactSidebarHeader],
    querySelectorAll: (sel) => {
      if (sel.includes('sticky')) return [tallSidebarSticky, projectListSticky, compactSidebarHeader];
      return [];
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }

  const fakeWin = {
    innerWidth: 1280,
    innerHeight: 800,
    document: fakeDoc,
    MutationObserver: FakeMutationObserver,
    Set,
    Math,
    Date,
    getComputedStyle: () => ({
      position: 'sticky',
      backgroundColor: 'rgb(20, 22, 30)',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      zIndex: '10',
    }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  fakeWin.window = fakeWin;
  vm.createContext(fakeWin);
  vm.runInContext(scriptSrc, fakeWin);
  fakeWin.__agyMonitorWallpaper.apply('html { color: #fff; }');

  assert.equal(tallSidebarSticky.getAttribute('data-agy-mon-layer'), null, 'tall sidebar sticky node must be skipped');
  assert.equal(projectListSticky.getAttribute('data-agy-mon-layer'), null, 'sidebar sticky containing project-header must be skipped');
  assert.equal(compactSidebarHeader.getAttribute('data-agy-mon-layer'), 'sticky-sidebar', 'compact sidebar sticky header should still be tagged');
  fakeWin.__agyMonLayerEngine.stop();
});

test('hud_injector: main hook goes dormant immediately when plugin.json is absent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-dormant-'));
  try {
    const emptyPluginRoot = path.join(tmpDir, 'missing-plugin');
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    const statusFile = path.join(dataDir, 'native_hud_status.json');
    fs.writeFileSync(statusFile, JSON.stringify({ version: NATIVE_HUD_VERSION, pid: 1 }), 'utf8');
    fs.writeFileSync(
      path.join(dataDir, 'user_prefs.json'),
      JSON.stringify({ proxy: { enabled: true, url: 'http://127.0.0.1:7897', forceHttp1: true } }),
      'utf8',
    );

    let appendSwitchCalls = 0;
    const fakeEnv = {
      AGY_MONITOR_PLUGIN_ROOT: emptyPluginRoot,
      AGY_MONITOR_PLUGIN_DATA_DIR: dataDir,
    };
    const fakeModule = { exports: {} };
    const fakeRequire = (name) => {
      if (name === 'fs') return fs;
      if (name === 'os') return os;
      if (name === 'path') return path;
      if (name === 'child_process') return { execFileSync: () => '' };
      if (name === 'electron') {
        return {
          app: {
            isReady: () => false,
            commandLine: {
              hasSwitch: () => false,
              appendSwitch: () => { appendSwitchCalls += 1; },
            },
            on: () => {},
            whenReady: () => Promise.resolve(),
          },
        };
      }
      throw new Error(`unexpected require: ${name}`);
    };

    const ctx = {
      globalThis: {},
      process: { env: fakeEnv, platform: process.platform, pid: process.pid },
      module: fakeModule,
      require: fakeRequire,
      URL,
      Set,
      Map,
      Date,
      Math,
      Number,
      Boolean,
      String,
      Array,
      Object,
      RegExp,
      JSON,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(buildMainHookScript(), ctx);

    assert.equal(fakeModule.exports.dormant, true);
    assert.equal(appendSwitchCalls, 0, 'dormant hook must not touch Electron commandLine');
    assert.equal(fakeEnv.HTTP_PROXY, undefined, 'dormant hook must not inject proxy env vars');
    assert.equal(fs.existsSync(statusFile), false, 'dormant hook must clear stale status heartbeat');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: defers live outdated app.asar rewrite, uses zero-truncation atomic inode swap on EPERM, rolls back on failure, and restores synchronously', async () => {
  clearHudInjectorCaches();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-safe-write-'));
  const origRename = fsp.rename;
  const origWriteFile = fsp.writeFile;
  try {
    const asarPath = path.join(tmpDir, 'app.asar');
    const stockAsar = buildSyntheticAsar({
      'package.json': JSON.stringify({ name: 'antigravity', version: '2.38.0', main: 'dist/main.js' }),
      'dist/main.js': '"use strict";\nconsole.log("stock main 2.38.0");\n',
    });
    // Build an outdated patched ASAR (version 2.1.0)
    const outdatedAsar = repackAsarInMemory(
      stockAsar,
      new Map([
        ['dist/main.js', Buffer.from('"use strict";\ntry { require("./agy-monitor-hud-main"); } catch {}\nconsole.log("stock main 2.38.0");\n', 'utf8')],
        ['dist/agy-monitor-hud-main.js', Buffer.from('// old hook\n', 'utf8')],
        ['dist/agy-monitor-hud.meta.json', Buffer.from(JSON.stringify({ version: '2.1.0', appVersion: '2.38.0' }), 'utf8')],
      ]),
      new Set(),
    );
    fs.writeFileSync(asarPath, outdatedAsar);

    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      hostAsarPath: asarPath,
      devToolsActivePortFile: path.join(tmpDir, 'missing_dt'),
    });
    fs.mkdirSync(paths.pluginDataDir, { recursive: true });
    fs.writeFileSync(
      paths.nativeHudStatusFile,
      JSON.stringify({ version: '2.1.0', pid: process.pid, mountedCount: 1, updatedAtMs: Date.now() }),
      'utf8',
    );

    // 1. Background auto-reinject (force: false) defers when live hook PID is running
    const deferred = await installNativeHud(paths);
    assert.equal(deferred.ok, false);
    assert.equal(deferred.diskWritten, false);
    assert.equal(deferred.deferredWhileRunning, true);
    assert.equal(deferred.pendingRestart, true);
    assert.equal((await inspectNativeHudState(paths)).installedVersion, '2.1.0');

    // 2. When direct rename(tmp -> app.asar) fails with EPERM (Windows open Electron handle),
    //    writeAsarSafely NEVER writes in-place to app.asar and succeeds via zero-truncation atomic_inode_swap
    const directWritesToTarget = [];
    let firstReplaceSimulated = false;
    fsp.writeFile = async (p, data, ...rest) => {
      if (p === asarPath) directWritesToTarget.push(p);
      return origWriteFile.call(fsp, p, data, ...rest);
    };
    fsp.rename = async (src, dst) => {
      if (!firstReplaceSimulated && src.includes('.agy_tmp.') && dst === asarPath) {
        firstReplaceSimulated = true;
        const err = new Error('EPERM: operation not permitted, rename');
        err.code = 'EPERM';
        throw err;
      }
      return origRename.call(fsp, src, dst);
    };
    const swappedRes = await writeAsarSafely(asarPath, stockAsar);
    fsp.rename = origRename;
    fsp.writeFile = origWriteFile;
    assert.equal(swappedRes.ok, true);
    assert.equal(swappedRes.method, 'atomic_inode_swap');
    assert.equal(directWritesToTarget.length, 0, 'must NEVER overwrite live app.asar in-place');
    assert.equal(fs.readFileSync(asarPath).equals(stockAsar), true);

    // 3. When second rename fails mid-swap, writeAsarSafely rolls back original app.asar atomically
    fsp.rename = async (src, dst) => {
      if (src.includes('.agy_tmp.') && dst === asarPath) {
        const err = new Error('EBUSY: resource busy');
        err.code = 'EBUSY';
        throw err;
      }
      return origRename.call(fsp, src, dst);
    };
    const rolledBack = await writeAsarSafely(asarPath, outdatedAsar);
    fsp.rename = origRename;
    assert.equal(rolledBack.ok, false);
    assert.equal(rolledBack.locked, true);
    assert.equal(fs.readFileSync(asarPath).equals(stockAsar), true, 'rollback must preserve original app.asar intact');

    // 4. Explicit force install upgrades atomically when unlocked and cleans any stale leftover
    fs.writeFileSync(`${asarPath}.agy_stale`, Buffer.from('legacy stale'));
    fs.writeFileSync(`${asarPath}.agy_stale.9999.1`, Buffer.from('legacy timestamped stale'));
    const forced = await installNativeHud(paths, { force: true });
    assert.equal(forced.ok, true);
    assert.equal(forced.diskWritten, true);
    assert.equal(forced.writeMethod, 'atomic_replace');
    assert.equal(forced.status.state, 'installed');
    assert.equal(fs.existsSync(`${asarPath}.agy_stale`), false);
    assert.equal(fs.existsSync(`${asarPath}.agy_stale.9999.1`), false);

    // 5. Synchronous stock restore brings app.asar cleanly back to stock
    const syncRestored = restoreStockAsarSync(paths);
    assert.equal(syncRestored.ok, true);
    assert.equal(syncRestored.diskWritten, true);
    const afterSync = await inspectNativeHudState(paths);
    assert.equal(afterSync.state, 'stock');
    assert.equal(afterSync.appVersion, '2.38.0');
  } finally {
    fsp.rename = origRename;
    fsp.writeFile = origWriteFile;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: queues deferred exit-apply when app.asar rename is EBUSY and worker atomically swaps on unlock', async () => {
  clearHudInjectorCaches();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-deferred-'));
  const origRename = fsp.rename;
  try {
    const asarPath = path.join(tmpDir, 'app.asar');
    const stockAsar = buildSyntheticAsar({
      'package.json': JSON.stringify({ name: 'antigravity', version: '2.36.0', main: 'dist/main.js' }),
      'dist/main.js': '"use strict";\nconsole.log("stock main 2.36.0");\n',
    });
    fs.writeFileSync(asarPath, stockAsar);

    const paths = resolvePaths({
      appDataDir: path.join(tmpDir, 'appdata'),
      geminiConfigDir: path.join(tmpDir, 'config'),
      hostAsarPath: asarPath,
      devToolsActivePortFile: path.join(tmpDir, 'missing_dt'),
    });
    paths.disableDeferredWorker = true;

    // 1. Simulate Windows EBUSY lock on both direct replace & inode swap -> installNativeHud queues pending job
    fsp.rename = async (src, dst) => {
      if (src === asarPath || dst === asarPath) {
        const err = new Error('EBUSY: resource busy or locked, rename');
        err.code = 'EBUSY';
        throw err;
      }
      return origRename.call(fsp, src, dst);
    };
    const queued = await installNativeHud(paths);
    fsp.rename = origRename;
    assert.equal(queued.ok, true);
    assert.equal(queued.diskWritten, false);
    assert.equal(queued.queuedForExit, true);
    assert.equal(queued.pendingRestart, true);
    assert.equal(queued.status.pendingApply?.action, 'install');
    assert.equal(queued.status.pendingApply?.appVersion, '2.36.0');
    assert.equal(fs.existsSync(`${asarPath}.agy_pending`), true);
    const jobPath = path.join(paths.pluginDataDir, 'pending_asar_job.json');
    assert.equal(fs.existsSync(jobPath), true);

    // 2. Worker sees EBUSY twice while Antigravity is closing, then atomically renames on 3rd attempt
    let lockTicks = 2;
    const mockFs = Object.create(fs);
    mockFs.renameSync = (src, dst) => {
      if (lockTicks > 0) {
        lockTicks -= 1;
        const err = new Error('EBUSY: still closing');
        err.code = 'EBUSY';
        throw err;
      }
      return fs.renameSync(src, dst);
    };
    const workerRes = await runPendingAsarWorker(jobPath, {
      watchPid: 0,
      pollMs: 25,
      maxWaitMs: 3000,
      fsMod: mockFs,
    });
    assert.equal(workerRes.status, 'applied');
    assert.equal(fs.existsSync(jobPath), false);
    assert.equal(fs.existsSync(`${asarPath}.agy_pending`), false);
    const finalState = await inspectNativeHudState(paths);
    assert.equal(finalState.state, 'installed');
    assert.equal(finalState.appVersion, '2.36.0');

    // 3. Target-changed guard: if app.asar changes to a newer version before apply, worker aborts safely
    fs.writeFileSync(asarPath, stockAsar);
    fsp.rename = async (src, dst) => {
      if (src === asarPath || dst === asarPath) {
        const err = new Error('EBUSY');
        err.code = 'EBUSY';
        throw err;
      }
      return origRename.call(fsp, src, dst);
    };
    await installNativeHud(paths, { force: true });
    fsp.rename = origRename;
    const newerStock = buildSyntheticAsar({
      'package.json': JSON.stringify({ name: 'antigravity', version: '2.37.0', main: 'dist/main.js' }),
      'dist/main.js': '"use strict";\nconsole.log("brand new 2.37.0 release");\n',
    });
    fs.writeFileSync(asarPath, newerStock);
    const guardRes = applyPendingAsarJobOnce(jobPath);
    assert.equal(guardRes.status, 'target_changed');
    assert.equal(fs.readFileSync(asarPath).equals(newerStock), true, 'must NEVER overwrite a newer app.asar');
    assert.equal(fs.existsSync(jobPath), false);
    assert.equal(fs.existsSync(`${asarPath}.agy_pending`), false);
  } finally {
    fsp.rename = origRename;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hud_injector: layer engine & native HUD guard against IME composition and ignore composer-internal mutations', () => {
  const wallpaperSrc = buildNativeWallpaperEngineScript();
  const rendererSrc = buildNativeHudRendererScript();

  assert.match(wallpaperSrc, /compositionstart/);
  assert.match(wallpaperSrc, /compositionend/);
  assert.match(wallpaperSrc, /requestIdleCallback/);
  assert.match(rendererSrc, /compositionstart/);
  assert.match(rendererSrc, /compositionend/);

  let elementsFromPointCalls = 0;
  let mutCallback = null;
  let nextTimerId = 1;
  const timeouts = new Map();
  const winListeners = new Map();
  const docListeners = new Map();
  const styleEl = { id: 'agy-monitor-cdp-theme', textContent: '', parentNode: null };
  const headEl = { appendChild(el) { el.parentNode = headEl; } };

  const fakeDoc = {
    hidden: false,
    head: headEl,
    body: { tagName: 'BODY' },
    documentElement: headEl,
    getElementById: (id) => (id === styleEl.id && styleEl.parentNode ? styleEl : null),
    createElement: () => styleEl,
    elementsFromPoint: () => {
      elementsFromPointCalls += 1;
      return [];
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!docListeners.has(evt)) docListeners.set(evt, new Set());
      docListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      docListeners.get(evt)?.delete(fn);
    },
  };

  class FakeMutationObserver {
    constructor(cb) {
      mutCallback = cb;
    }
    observe() {}
    disconnect() {}
  }

  const fakeWin = {
    innerWidth: 1280,
    innerHeight: 800,
    document: fakeDoc,
    MutationObserver: FakeMutationObserver,
    Set,
    Array,
    Math,
    Date: { now: () => 5000 },
    setTimeout: (fn, delay) => {
      const id = nextTimerId++;
      timeouts.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: () => nextTimerId++,
    clearInterval: () => {},
    addEventListener: (evt, fn) => {
      if (!winListeners.has(evt)) winListeners.set(evt, new Set());
      winListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
      winListeners.get(evt)?.delete(fn);
    },
  };
  fakeWin.window = fakeWin;

  vm.createContext(fakeWin);
  vm.runInContext(wallpaperSrc, fakeWin);
  fakeWin.__agyMonitorWallpaper.apply('html { color: #fff; }');

  // 1. Composer-internal mutations do NOT schedule layer scans
  timeouts.clear();
  elementsFromPointCalls = 0;
  const composerNode = {
    nodeType: 1,
    closest: (sel) => (sel.includes('.surface-composer') ? {} : null),
  };
  mutCallback([{ target: composerNode }]);
  assert.equal(timeouts.size, 0, 'composer-internal mutations must not schedule layer scans');

  // 2. Active IME composition blocks scanLayers and MutationObserver scheduling
  for (const fn of winListeners.get('compositionstart') || []) fn();
  assert.equal(fakeWin.__agyMonLayerEngine.scan(), 0);
  assert.equal(elementsFromPointCalls, 0);
  const outerNode = { nodeType: 1, closest: () => null };
  mutCallback([{ target: outerNode }]);
  assert.equal(timeouts.size, 0, 'IME composition must block MutationObserver layer scans');
  for (const fn of winListeners.get('compositionend') || []) fn();

  // 2b. Window blur also resets composition state so Alt-Tab mid-IME cannot stall scans
  for (const fn of winListeners.get('compositionstart') || []) fn();
  assert.equal(fakeWin.__agyMonLayerEngine.scan(), 0);
  for (const fn of winListeners.get('blur') || []) fn();
  fakeWin.__agyMonLayerEngine.scan();
  assert.ok(elementsFromPointCalls > 0, 'blur must reset stuck IME composition guard');

  // 3. stop() cleans up composition & blur listeners cleanly
  fakeWin.__agyMonLayerEngine.stop();
  assert.equal((winListeners.get('compositionstart') || new Set()).size, 0);
  assert.equal((winListeners.get('compositionend') || new Set()).size, 0);
  assert.equal((winListeners.get('blur') || new Set()).size, 0);
});
