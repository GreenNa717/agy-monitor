import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildBackdropSpawnArgs } from '../sidecars/agy_monitor/backend/backdrop_manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKDROP_CS = path.resolve(__dirname, '..', 'sidecars', 'agy_monitor', 'backdrop', 'AgyBackdrop.cs');
const BACKDROP_MGR = path.resolve(__dirname, '..', 'sidecars', 'agy_monitor', 'backend', 'backdrop_manager.mjs');

test('AgyBackdrop.cs prevents re-entrant orphaned HUD/Backdrop windows', () => {
  const src = fs.readFileSync(BACKDROP_CS, 'utf8');

  // 1. SyncHudForWindow must assign item.Hud BEFORE calling hud.Show()
  const syncHudStart = src.indexOf('private void SyncHudForWindow(');
  assert.ok(syncHudStart > 0, 'SyncHudForWindow method missing');
  const hudBlockStart = src.indexOf('if (item.Hud == null)', syncHudStart);
  assert.ok(hudBlockStart > syncHudStart, 'SyncHudForWindow HUD creation block missing');
  const hudBlock = src.slice(hudBlockStart, hudBlockStart + 1200);
  const assignIdx = hudBlock.indexOf('item.Hud = hud;');
  const showIdx = hudBlock.indexOf('hud.Show();');
  assert.ok(assignIdx > 0 && showIdx > 0, 'item.Hud assignment or hud.Show() missing');
  assert.ok(assignIdx < showIdx, 'item.Hud must be assigned before hud.Show() to prevent re-entrant ghost HUDs');

  // 2. Re-entrancy guard around SyncAllWindows and OnWinEvent
  assert.match(src, /private\s+bool\s+_inSync\s*=\s*false;/, '_inSync guard missing');
  assert.match(src, /if\s*\(_inSync\)\s*\{\s*_syncPending\s*=\s*true;\s*return;\s*\}/s, 'SyncAllWindows must defer re-entrant calls');
  assert.match(src, /EVENT_OBJECT_LOCATIONCHANGE\s*&&\s*isTracked\s*&&\s*!_inSync/, 'OnWinEvent must skip synchronous SyncAllWindows during _inSync');

  // 3. Guaranteed force-hide/close and Application.Current.Windows orphan sweeper
  assert.match(src, /private\s+static\s+void\s+ForceCloseOwnedWindow\s*\(\s*Window\s+win\s*\)/, 'ForceCloseOwnedWindow helper missing');
  assert.match(src, /private\s+void\s+SweepOrphanedWindows\s*\(\s*\)/, 'SweepOrphanedWindows safety net missing');
  assert.match(src, /SweepOrphanedWindows\(\);/, 'SweepOrphanedWindows must be invoked');

  // 4. Minimized (iconic) Antigravity windows remain tracked so minimize/restore never thrashes overlays
  assert.match(src, /if\s*\(!Native\.IsIconic\(hWnd\)\)/, 'FindAntigravityTopWindows must keep iconic windows tracked');

  // 5. Z-order occlusion walk covers deep Windows desktop stacks (>= 128 steps)
  const zMatch = src.match(/while\s*\(prev\s*!=\s*IntPtr\.Zero\s*&&\s*steps\s*<\s*(\d+)\)/);
  assert.ok(zMatch && Number(zMatch[1]) >= 128, 'Z-order occlusion walk must inspect at least 128 top-level windows');

  // 6. Native 100%-opaque WPF ImageLightboxWindow guards (non-locking load, advertised support, orphan sweep & dispose cleanup)
  assert.match(src, /internal\s+sealed\s+class\s+ImageLightboxWindow\s*:\s*Window/, 'ImageLightboxWindow class missing');
  assert.match(src, /"supportsLightbox"\s*,\s*true/, 'WriteStatusFile must advertise supportsLightbox=true');
  assert.match(src, /IsTargetFile\(name,\s*"lightbox_cmd\.json"\)/, 'FileSystemWatcher must react to lightbox_cmd.json');
  assert.match(src, /w\s+is\s+ImageLightboxWindow/, 'SweepOrphanedWindows must sweep orphaned ImageLightboxWindow instances');
  const openLbIdx = src.indexOf('private void OpenNativeLightbox(');
  assert.ok(openLbIdx > 0, 'OpenNativeLightbox method missing');
  const lbBlock = src.slice(openLbIdx, openLbIdx + 2800);
  const lbAssign = lbBlock.indexOf('_lightbox = win;');
  const lbShow = lbBlock.indexOf('win.Show();');
  assert.ok(lbAssign > 0 && lbShow > 0 && lbAssign < lbShow, '_lightbox must be bound before win.Show()');

  // 7. v1.0.5 companion resource safety, mixed-DPI lightbox & comma-safe Explorer selection
  assert.match(src, /SHOpenFolderAndSelectItems/, 'OpenTargetFolder should use SHOpenFolderAndSelectItems');
  assert.match(src, /using\s*\(\s*Process\s+/, 'Process instances must be disposed with using');
  assert.match(src, /private\s+volatile\s+bool\s+_disposed\s*=\s*false;/, '_disposed must be volatile across threads');
  const lbClassStart = src.indexOf('internal sealed class ImageLightboxWindow');
  const hudClassStart = src.indexOf('internal sealed class HudOverlayWindow');
  assert.ok(lbClassStart > 0 && hudClassStart > lbClassStart);
  const lbClassSrc = src.slice(lbClassStart, hudClassStart);
  assert.match(lbClassSrc, /TransformToDevice/, 'ImageLightboxWindow must compensate mixed-DPI via TransformToDevice');

  // 8. v1.0.6 GPU hardware-accelerated backdrop, atomic DeferWindowPos, VSync render-follow & progress-tag header filter
  const bdStart = src.indexOf('internal sealed class BackdropSurfaceWindow');
  assert.ok(bdStart > 0 && lbClassStart > bdStart);
  const bdSrc = src.slice(bdStart, lbClassStart);
  assert.match(bdSrc, /AllowsTransparency\s*=\s*false;/, 'BackdropSurfaceWindow must use hardware-accelerated AllowsTransparency=false');
  assert.match(bdSrc, /DwmSetWindowAttribute/, 'BackdropSurfaceWindow must apply native DWM rounded corners');
  assert.doesNotMatch(bdSrc, /Native\.WS_EX_TRANSPARENT/, 'Non-layered BackdropSurfaceWindow must NOT set GDI WS_EX_TRANSPARENT');
  assert.match(bdSrc, /0x0084/, 'BackdropSurfaceWindow must handle WM_NCHITTEST for click-through');
  assert.match(bdSrc, /0x0021/, 'BackdropSurfaceWindow must handle WM_MOUSEACTIVATE to never steal focus');
  assert.match(src, /BeginDeferWindowPos/, 'SyncAllWindows must batch window updates via DeferWindowPos');
  assert.match(src, /CommitPendingMoves\s*\(\s*backdropMoves\s*\)/, 'SyncAllWindows must commit backdropMoves separately');
  assert.match(src, /CommitPendingMoves\s*\(\s*hudMoves\s*\)/, 'SyncAllWindows must commit hudMoves separately');
  const syncAllIdx = src.indexOf('private void SyncAllWindows(');
  const commitBdIdx = src.indexOf('CommitPendingMoves(backdropMoves);', syncAllIdx);
  const applyAlphaIdx = src.indexOf('SetLayeredWindowAttributes(item.Hwnd, 0, targetAlpha', syncAllIdx);
  assert.ok(commitBdIdx > syncAllIdx && applyAlphaIdx > commitBdIdx, 'Backdrop must be positioned BEFORE making host window translucent');
  assert.match(src, /CompositionTarget\.Rendering\s*\+=\s*OnCompositionRendering/, 'Companion must VSync-track window moves/resizes');
  assert.match(src, /EVENT_OBJECT_REORDER/, 'Companion must hook EVENT_OBJECT_REORDER for instant Z-order sync');
  assert.match(src, /\[AGY_PROGRESS/, 'IsHeaderChromeText must reject [AGY_PROGRESS...] chat lines as titles');
  assert.match(src, /IsNewConversationTitle/, 'ProbeActiveConversationView must detect blank New Conversation headers');

  // 9. Constructor null-safety & global unhandled-exception host-opacity safety net
  const applyDipIdx = src.indexOf('private void ApplyAvailableDipLayout()');
  assert.ok(applyDipIdx > 0, 'ApplyAvailableDipLayout missing');
  const applyDipSnippet = src.slice(applyDipIdx, applyDipIdx + 260);
  assert.match(applyDipSnippet, /if\s*\(_metaPill\s*==\s*null\s*\|\|\s*_metaText\s*==\s*null[^)]*\)\s*return;/, 'ApplyAvailableDipLayout must guard against pre-init null controls');
  assert.match(src, /DispatcherUnhandledException/, 'Program.Main must hook DispatcherUnhandledException');
  assert.match(src, /AppDomain\.CurrentDomain\.UnhandledException/, 'Program.Main must hook AppDomain.CurrentDomain.UnhandledException');
  assert.match(src, /RestoreAllHostOpacityEmergency/, 'CompanionController must provide pure-Win32 emergency host opacity restore');

  // 10. Context ring click-to-configure popover (showSpeed, showCacheHit, showModel, showContext)
  assert.match(src, /internal\s+sealed\s+class\s+HudConfigPopupWindow\s*:\s*Window/, 'HudConfigPopupWindow class missing');
  assert.match(src, /w\s+is\s+HudConfigPopupWindow/, 'SweepOrphanedWindows must sweep orphaned HudConfigPopupWindow instances');
  assert.match(src, /IsTargetFile\(name,\s*"hud_display\.json"\)/, 'FileSystemWatcher must watch hud_display.json');
  const popMethodIdx = src.indexOf('private void ToggleHudConfigPopup(');
  assert.ok(popMethodIdx > 0, 'ToggleHudConfigPopup missing');
  const popBlock = src.slice(popMethodIdx, popMethodIdx + 2400);
  const popAssign = popBlock.indexOf('_hudPopup = popup;');
  const popShow = popBlock.indexOf('popup.Show();');
  assert.ok(popAssign > 0 && popShow > 0 && popAssign < popShow, '_hudPopup must be bound before popup.Show()');
  assert.doesNotMatch(popBlock, /ForceActivateWindow/, 'ToggleHudConfigPopup must NOT steal foreground focus from host window');
  const popClassIdx = src.indexOf('internal sealed class HudConfigPopupWindow');
  const uiaClassIdx = src.indexOf('internal static class UiaHelper', popClassIdx);
  assert.ok(popClassIdx > 0 && uiaClassIdx > popClassIdx);
  const popClassSrc = src.slice(popClassIdx, uiaClassIdx);
  assert.match(popClassSrc, /WS_EX_NOACTIVATE/, 'HudConfigPopupWindow must set WS_EX_NOACTIVATE to avoid z-order focus jump');
  assert.match(popClassSrc, /0x0021/, 'HudConfigPopupWindow must return MA_NOACTIVATE on WM_MOUSEACTIVATE');
  assert.match(popClassSrc, /SWP_NOACTIVATE/, 'HudConfigPopupWindow positioning must pass SWP_NOACTIVATE');
  assert.match(popClassSrc, /生成速率/);
  assert.match(popClassSrc, /缓存命中/);
  assert.match(popClassSrc, /上游模型/);
  assert.match(popClassSrc, /上下文占用/);

  // 11. v1.0.7 zero mouse-injection, hover console guide card, dual-monitor/Wallpaper-Engine Z-order kill-switch, and Chinese usage popup occlusion
  assert.doesNotMatch(src, /SendInput\s*\(/, 'AgyBackdrop.cs must not inject synthetic mouse clicks via SendInput');
  assert.doesNotMatch(src, /SetCursorPos\s*\(/, 'AgyBackdrop.cs must not hijack cursor via SetCursorPos');
  assert.match(src, /internal\s+sealed\s+class\s+HudGuidePreviewWindow\s*:\s*Window/, 'HudGuidePreviewWindow class missing');
  assert.match(src, /w\s+is\s+HudGuidePreviewWindow/, 'SweepOrphanedWindows must sweep orphaned HudGuidePreviewWindow instances');
  assert.match(src, /open_console_guide\.jpg/, 'HudConfigPopupWindow must reference bundled open_console_guide.jpg');
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'assets', 'open_console_guide.jpg')), 'assets/open_console_guide.jpg must exist');
  assert.match(src, /IsWindowStrictlyBehind\s*\(/, 'Backdrop sync must verify strict behind-host Z-order before showing');
  assert.match(src, /BackdropGuardBlocked/, 'Backdrop sync must circuit-break when Z-order or layered alpha conflicts');
  assert.match(src, /使用限额/);
  assert.match(src, /查看用量/);
  assert.match(src, /重置于/);
  assert.match(src, /frompoint-portal-box/);
  assert.match(src, /anchor-covered/, 'IsHudOccluded must detect when a maximized side panel covers the composer anchor');
  assert.match(src, /DecodePixelWidth/, 'Wallpaper and lightbox bitmaps must cap DecodePixelWidth to curb RAM');
  assert.match(src, /SetProcessWorkingSetSize/, 'Companion must trim startup/idle working set memory');
  assert.match(src, /ControlType\.ComboBox/, 'ProbeComposerAnchor must detect ComboBox model pickers on narrow composers');
  assert.match(src, /CollectLeftToolbarBoundary/, 'ProbeComposerAnchor must walk toolbarRow subtree to guard against ARIA-less left controls');
  assert.match(src, /CachedComposerBox/, 'Companion must clamp HUD within composer container left edge');
  assert.match(src, /minModelDip/, 'HudOverlayWindow must progressively drop long model ID before clipping speed or leaving only ring');
  assert.match(src, /anchor-covered-doc/, 'IsHudOccluded must detect cross-document sidecar iframe covering composer anchor');
  assert.match(src, /hitIsAncestorOfAnchor/, 'IsHudOccluded must never false-trigger when FromPoint returns an ancestor of cachedAnchor');
  assert.match(src, /if\s*\(mouseDownOnHost\)\s*\{[^}]*finalAnchor\.Occluded\s*=\s*prevAnchor\.Occluded;/s, 'mouseDownOnHost must preserve occlusion state so full-screen Console never flashes HUD on click');
  assert.match(src, /IsTargetFile\(name,\s*"console_viewport\.json"\)/, 'Companion must watch console_viewport.json for instant full-screen Console occlusion');
  assert.match(src, /IsConsoleCoveringAnchor\s*\(/, 'SyncHudForWindow must check exact consoleLeftPx geometry against composer anchor');

  // 12. v1.0.12 anti-bleed-through & HUD sync guards: popup re-entry crash fix, sleep/lock opaque restore,
  // residual alpha recovery, real-session header validation, and fast CLI --probe-desktop / --restore-opacity
  assert.match(src, /_hudPopupOpening/, 'ToggleHudConfigPopup must guard against re-entrant CloseHudPopup during popup.Show()');
  assert.match(src, /SystemEvents\.PowerModeChanged/, 'Companion must restore full host opacity on sleep/suspend and resync on resume');
  assert.match(src, /SystemEvents\.SessionSwitch/, 'Companion must restore full host opacity on session lock and resync on unlock');
  assert.match(src, /RestoreAllAntigravityWindowsOpaqueStatic\s*\(/, 'Emergency opacity recovery must sweep all translucent Antigravity windows');
  assert.match(src, /MatchesAnyKnownSession\s*\(/, 'UIA header probe must validate titles against known real sessions');
  assert.match(src, /--probe-desktop/, 'Companion must support fast --probe-desktop CLI mode');
  assert.match(src, /--restore-opacity/, 'Companion must support --restore-opacity emergency CLI mode');
  assert.match(src, /RecoverFromNonFatalUiException\s*\(/, 'DispatcherUnhandledException must recover non-fatal UI glitches without killing companion');
  assert.match(src, /_consoleViewportPhysW\s*<\s*\(int\)Math\.Round\(winW\s*\*\s*0\.62\)/, 'IsConsoleCoveringAnchor must only trigger on true full-screen console (>=62% width)');
  assert.match(src, /idObject\s*!=\s*0\s*\|\|\s*idChild\s*!=\s*0/, 'OnWinEvent must require CHILDID_SELF (idChild == 0) so Chromium child hides never blink the backdrop');
  assert.match(src, /IsDirectlyBehindVisible\s*\(/, 'Z-order mismatch check must skip invisible helper windows to avoid EVENT_OBJECT_REORDER loops');
  assert.match(src, /Antigravity_Original/, 'Host window finder must track both Antigravity and Antigravity_Original launcher wrapper processes');

  // 13. v1.1.3+ anti-HUD-drift & multi-Document occlusion guards: exclude AGY Console Document, keep tight bottom band, and self-heal stale background conversation anchors
  assert.match(src, /IsAgyConsoleDocument\s*\(/, 'Must identify AGY Console sidecar Document cleanly');
  assert.match(src, /IsInsideAgyConsoleDocument\s*\(/, 'ProbeComposerAnchor must skip buttons inside the AGY Console sidecar Document');
  assert.match(src, /IsCandidateUncovered\s*\(/, 'ProbeComposerAnchor must prefer uncovered foreground Document buttons over hidden background conversations');
  assert.match(src, /anchor-covered-console/, 'IsHudOccluded must distinguish maximized AGY Console Document from stale background conversation Document');
  assert.match(src, /int\s+bandTop\s*=\s*winRect\.Bottom\s*-\s*\(int\)Math\.Round\(108\s*\*\s*dpiScale\)/, 'ProbeComposerAnchor must keep tight 108 DIP bottom band to avoid latching onto chat/sidecar buttons');
  assert.match(src, /ComputePureWin32ComposerAnchor\s*\(/, 'Strict Zero-UIA mode must cleanly disable guessed Mode-1 HUD coordinates');
});

test('AgyBackdrop.cs & backdrop_manager.mjs Issue #7 RAM/VRAM optimizations and --parent-pid orphan guard', () => {
  const src = fs.readFileSync(BACKDROP_CS, 'utf8');
  const mgrSrc = fs.readFileSync(BACKDROP_MGR, 'utf8');

  // 1. Never upscale wallpaper or lightbox images: probe dimensions first and only cap when srcWidth > targetMaxWidth
  assert.match(src, /BitmapUtil\.TryProbeImageDimensions\s*\(/, 'AgyBackdrop.cs must probe image dimensions before decoding');
  assert.match(src, /BitmapCreateOptions\.DelayCreation[\s\S]{0,80}BitmapCacheOption\.None/, 'Dimension probe must use DelayCreation + CacheOption.None');
  assert.doesNotMatch(src, /bmp\.DecodePixelWidth\s*=\s*3840\s*;/, 'ImageLightboxWindow must NOT unconditionally upscale small images to 3840px');
  const loadWpStart = src.indexOf('private void LoadSharedWallpaperBitmap(');
  assert.ok(loadWpStart > 0, 'LoadSharedWallpaperBitmap missing');
  const loadWpBlock = src.slice(loadWpStart, loadWpStart + 2000);
  assert.match(loadWpBlock, /Math\.Min\s*\(\s*srcWidth\s*,\s*maxMonitorWidth\s*\)/, 'Wallpaper decode must cap without upscaling');
  assert.match(loadWpBlock, /if\s*\(\s*!probed\s*\|\|\s*srcWidth\s*>\s*maxMonitorWidth\s*\)/, 'Wallpaper DecodePixelWidth must only be set when exceeding monitor width');

  const lbLoadStart = src.indexOf('public bool LoadImage(');
  assert.ok(lbLoadStart > 0, 'ImageLightboxWindow.LoadImage missing');
  const lbLoadBlock = src.slice(lbLoadStart, lbLoadStart + 1800);
  assert.match(lbLoadBlock, /Math\.Min\s*\(\s*srcWidth\s*,\s*maxLightboxWidth\s*\)/, 'Lightbox decode must cap at 3840 without upscaling');
  assert.match(lbLoadBlock, /if\s*\(\s*!probed\s*\|\|\s*srcWidth\s*>\s*maxLightboxWidth\s*\)/, 'Lightbox DecodePixelWidth must only be set when exceeding 3840px');

  // 2. Offline pre-blurred frozen bitmap cache instead of live full-screen BlurEffect
  const bdStart = src.indexOf('internal sealed class BackdropSurfaceWindow');
  const lbClassStart = src.indexOf('internal sealed class ImageLightboxWindow');
  const bdSrc = src.slice(bdStart, lbClassStart);
  assert.doesNotMatch(bdSrc, /new\s+BlurEffect/, 'BackdropSurfaceWindow must NOT attach live BlurEffect render targets');
  assert.match(src, /CreatePreBlurredBitmap\s*\(/, 'BitmapUtil must pre-render blurred wallpapers offline');
  assert.match(src, /new\s+WriteableBitmap\s*\(/, 'Pre-blurred wallpaper must be materialized into a WriteableBitmap');
  assert.match(src, /_cachedBlurredBitmap/, 'CompanionController must cache pre-blurred bitmap across frames/windows');
  assert.match(src, /GetEffectiveWallpaperBitmap\s*\(/, 'CompanionController must select unblurred or cached pre-blurred bitmap');

  // 3. Release VRAM & close hidden surfaces in RestoreBackdropOnly
  const restoreStart = src.indexOf('private void RestoreBackdropOnly(');
  assert.ok(restoreStart > 0, 'RestoreBackdropOnly missing');
  const restoreBlock = src.slice(restoreStart, restoreStart + 900);
  assert.match(restoreBlock, /ReleaseSurfaceResources\s*\(\)/, 'RestoreBackdropOnly must clear _image.Source before closing surface');
  assert.match(restoreBlock, /ForceCloseOwnedWindow\s*\(\s*closingBackdrop\s*\)/, 'RestoreBackdropOnly must close hidden BackdropSurfaceWindow to release D3D VRAM');
  assert.match(restoreBlock, /!IsBackdropEffectWanted\(\)\s*\|\|\s*\(\s*closing\s*&&\s*!HasAnyActiveBackdropSurface\(\)\s*\)/, 'RestoreBackdropOnly must keep shared bitmaps alive while other host windows still use backdrops');
  assert.match(restoreBlock, /ReleaseSharedWallpaperBitmaps\s*\(\)/, 'RestoreBackdropOnly must release cached wallpaper bitmaps when backdrop is inactive');
  assert.match(bdSrc, /_image\.Source\s*=\s*null;/, 'BackdropSurfaceWindow.ReleaseSurfaceResources must clear _image.Source');

  // 4. Orphan --parent-pid guard in AgyBackdrop.cs and native-Windows-only passing in backdrop_manager.mjs
  assert.match(src, /"--parent-pid"/, 'AgyBackdrop.cs must parse --parent-pid CLI argument');
  assert.match(src, /private\s+bool\s+CheckHostLiveness\s*\(\s*\)/, 'CompanionController must monitor parent PID liveness');
  assert.match(src, /if\s*\(!CheckHostLiveness\(\)\)\s*return;/, 'Reconcile timer must enforce parent-PID orphan check');
  assert.match(mgrSrc, /buildBackdropSpawnArgs\s*\(/, 'backdrop_manager.mjs must build spawn args via buildBackdropSpawnArgs');

  const rtSample = { dataDirWin: 'C:\\data', assetsDirWin: 'C:\\assets' };
  const nativeArgs = buildBackdropSpawnArgs(rtSample, { isWsl: false, parentPid: 4242 });
  assert.deepEqual(nativeArgs, ['--data-dir', 'C:\\data', '--assets-dir', 'C:\\assets', '--parent-pid', '4242']);

  const wslArgs = buildBackdropSpawnArgs(rtSample, { isWsl: true, parentPid: 4242 });
  assert.deepEqual(wslArgs, ['--data-dir', 'C:\\data', '--assets-dir', 'C:\\assets']);
  assert.equal(wslArgs.includes('--parent-pid'), false, 'WSL2 interop must NEVER pass Linux PID via --parent-pid');

  const invalidPidArgs = buildBackdropSpawnArgs(rtSample, { isWsl: false, parentPid: 0 });
  assert.equal(invalidPidArgs.includes('--parent-pid'), false);
});

test('AgyBackdrop.cs scopes WinEvent hooks to host PIDs, attaches drag-only location hook, persists tray HUD toggle, and idles UIA worker', () => {
  const src = fs.readFileSync(BACKDROP_CS, 'utf8');

  // 1. Global hook limited to EVENT_SYSTEM_FOREGROUND with WINEVENT_SKIPOWNPROCESS
  const installStart = src.indexOf('private void InstallHooks()');
  const syncHooksStart = src.indexOf('private void SyncHostPidHooks()');
  assert.ok(installStart > 0 && syncHooksStart > installStart);
  const installBlock = src.slice(installStart, syncHooksStart);
  assert.match(installBlock, /WINEVENT_SKIPOWNPROCESS/);
  assert.match(installBlock, /EVENT_SYSTEM_FOREGROUND/);
  assert.doesNotMatch(installBlock, /EVENT_OBJECT_/);

  // 2. Permanent per-host-PID hooks exclude noisy EVENT_OBJECT_* streams
  const onWinStart = src.indexOf('private void OnWinEvent(');
  assert.ok(onWinStart > syncHooksStart);
  const syncHooksBlock = src.slice(syncHooksStart, onWinStart);
  assert.match(syncHooksBlock, /EVENT_SYSTEM_MOVESIZESTART/);
  assert.match(syncHooksBlock, /EVENT_SYSTEM_MINIMIZESTART/);
  assert.doesNotMatch(syncHooksBlock, /EVENT_OBJECT_LOCATIONCHANGE/);
  assert.doesNotMatch(syncHooksBlock, /EVENT_OBJECT_REORDER/);
  assert.doesNotMatch(syncHooksBlock, /EVENT_OBJECT_SHOW/);
  assert.doesNotMatch(syncHooksBlock, /EVENT_OBJECT_HIDE/);

  // 3. Drag-only EVENT_OBJECT_LOCATIONCHANGE hook attached on StartRenderFollow and detached on StopRenderFollow & Dispose
  assert.match(src, /private\s+void\s+AttachDragLocationHook\s*\(/);
  assert.match(src, /private\s+void\s+DetachDragLocationHook\s*\(/);
  const startFollowStart = src.indexOf('private void StartRenderFollow(');
  const stopFollowStart = src.indexOf('private void StopRenderFollow(');
  const onRenderStart = src.indexOf('private void OnCompositionRendering(');
  assert.ok(startFollowStart > 0 && stopFollowStart > startFollowStart && onRenderStart > stopFollowStart);
  assert.match(src.slice(startFollowStart, stopFollowStart), /AttachDragLocationHook\s*\(/);
  assert.match(src.slice(stopFollowStart, onRenderStart), /DetachDragLocationHook\s*\(/);

  // 4. Adaptive FastStateWatchTick + fast QueryFullProcessImageName lookup + tray HUD persistence + UIA idle gate
  assert.match(src, /private\s+void\s+FastStateWatchTick\s*\(/);
  assert.match(src, /GetWindow\(item\.Hwnd,\s*Native\.GW_HWNDNEXT\)/);
  assert.match(src, /GetProcessBaseNameFast\s*\(/);
  assert.match(src, /QueryFullProcessImageName\s*\(/);
  assert.match(src, /private\s+void\s+PersistHudEnabledToThemesFile\s*\(/);
  assert.match(src, /_hudEnabledByTray\s*=\s*next\.hudEnabled;/);
  assert.match(src, /bool\s+hudWantActive\s*=/);
  assert.match(src, /if\s*\(\s*!hudWantActive\s*\)\s*waitMs\s*=\s*2000;/);
});
