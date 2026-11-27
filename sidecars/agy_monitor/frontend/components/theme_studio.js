/**
 * Theme studio: palettes with custom naming/save/delete, 6 live CSS color tokens,
 * 5 built-in anime wallpapers + raster upload/delete, frosted-glass sliders,
 * language switcher, and honest host boundary status.
 */

const BUILTIN_PALETTES = [
  {
    id: "default",
    builtin: true,
    nameZh: "极昼原版",
    nameEn: "Polar Day",
    colors: {
      accent: "#5b8cff",
      contrast: "#e5a84b",
      tertiary: "#3dc2a7",
      canvas: "#14161d",
      chrome: "#1b1e28",
      bubble: "#212533",
    },
  },
  {
    id: "cinnabar",
    builtin: true,
    nameZh: "朱砂曜石",
    nameEn: "Cinnabar",
    colors: {
      accent: "#e84a3c",
      contrast: "#3dd6c8",
      tertiary: "#f2c14e",
      canvas: "#090708",
      chrome: "#141012",
      bubble: "#181316",
    },
  },
  {
    id: "forest",
    builtin: true,
    nameZh: "松烟赤金",
    nameEn: "Pine & Gold",
    colors: {
      accent: "#2ea06b",
      contrast: "#e57a35",
      tertiary: "#6d9cf5",
      canvas: "#060908",
      chrome: "#0f1412",
      bubble: "#131917",
    },
  },
  {
    id: "cobalt",
    builtin: true,
    nameZh: "钴蓝蜜柚",
    nameEn: "Cobalt Citrus",
    colors: {
      accent: "#3b82f6",
      contrast: "#f45b69",
      tertiary: "#eab308",
      canvas: "#07080b",
      chrome: "#101218",
      bubble: "#14171f",
    },
  },
  {
    id: "plum",
    builtin: true,
    nameZh: "黛紫青柠",
    nameEn: "Plum & Lime",
    colors: {
      accent: "#9d6bff",
      contrast: "#a3e635",
      tertiary: "#f59e0b",
      canvas: "#09070b",
      chrome: "#131018",
      bubble: "#18141f",
    },
  },
];

const BUILTIN_PALETTE_IDS = new Set(BUILTIN_PALETTES.map((p) => p.id));

const BUILTIN_WALLPAPERS = [
  { id: "wp-1", nameZh: "星海夜行电车", nameEn: "Starlit Night Train" },
  { id: "wp-2", nameZh: "雨夜霓虹街巷", nameEn: "Rainy Neon Alley" },
  { id: "wp-3", nameZh: "月下绯樱神社", nameEn: "Moonlit Sakura Shrine" },
  { id: "wp-4", nameZh: "天台观星少女", nameEn: "Rooftop Stargazer" },
  { id: "wp-5", nameZh: "暮色海滨车站", nameEn: "Twilight Seaside Station" },
];

const BUILTIN_WALLPAPER_IDS = new Set(BUILTIN_WALLPAPERS.map((w) => w.id));

const COLOR_FIELDS = [
  { key: "accent", i18nKey: "theme.colorAccent", zh: "主强调色", en: "Primary Accent" },
  { key: "contrast", i18nKey: "theme.colorContrast", zh: "次撞色", en: "Secondary Accent" },
  { key: "tertiary", i18nKey: "theme.colorTertiary", zh: "辅助点缀", en: "Tertiary Accent" },
  { key: "canvas", i18nKey: "theme.colorCanvas", zh: "主画布背景", en: "Canvas Background" },
  { key: "chrome", i18nKey: "theme.colorChrome", zh: "边框与顶栏", en: "Chrome & Header" },
  { key: "bubble", i18nKey: "theme.colorBubble", zh: "卡片与气泡", en: "Cards & Bubbles" },
];

const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const EXT_TO_IMAGE_MIME = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
});

function resolveUploadImageMime(file) {
  const rawType = String(file?.type || "").trim().toLowerCase();
  if (rawType === "image/jpg") return "image/jpeg";
  if (ALLOWED_IMAGE_MIME.has(rawType)) return rawType;
  if (!rawType) {
    const name = String(file?.name || "").trim().toLowerCase();
    const dot = name.lastIndexOf(".");
    if (dot >= 0 && EXT_TO_IMAGE_MIME[name.slice(dot)]) {
      return EXT_TO_IMAGE_MIME[name.slice(dot)];
    }
  }
  return "";
}

const MAX_WALLPAPER_BYTES = 8 * 1024 * 1024;
const WALLPAPER_MAX_EDGE_PX = 2560;
const WALLPAPER_WEBP_QUALITY = 0.86;

function decodeBase64ToBytes(base64) {
  if (typeof base64 !== "string" || !base64) return null;
  try {
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return new Uint8Array(Buffer.from(base64, "base64"));
    }
    if (typeof atob === "function") {
      const bin = atob(base64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) {
        out[i] = bin.charCodeAt(i);
      }
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

/** Returns true if a GIF byte stream contains >= 2 image frames (animated GIF). */
export function isAnimatedGifBytes(bytes) {
  if (!bytes || bytes.length < 14) return false;
  // Header: "GIF87a" or "GIF89a"
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x38) {
    return false;
  }
  if ((bytes[4] !== 0x37 && bytes[4] !== 0x39) || bytes[5] !== 0x61) {
    return false;
  }
  const packed = bytes[10];
  let pos = 13;
  if (packed & 0x80) {
    pos += 3 * (1 << ((packed & 0x07) + 1));
  }
  let frameCount = 0;
  const skipSubBlocks = () => {
    while (pos < bytes.length) {
      const subLen = bytes[pos];
      pos += 1;
      if (subLen === 0) break;
      pos += subLen;
    }
  };
  while (pos < bytes.length) {
    const marker = bytes[pos];
    if (marker === 0x3b) break; // Trailer
    if (marker === 0x2c) {
      // Image Descriptor
      frameCount += 1;
      if (frameCount >= 2) return true;
      if (pos + 10 >= bytes.length) break;
      const imgPacked = bytes[pos + 9];
      pos += 10;
      if (imgPacked & 0x80) {
        pos += 3 * (1 << ((imgPacked & 0x07) + 1));
      }
      pos += 1; // LZW minimum code size
      skipSubBlocks();
    } else if (marker === 0x21) {
      // Extension block
      pos += 2;
      skipSubBlocks();
    } else {
      break;
    }
  }
  return false;
}

/** Returns true if a WebP byte stream sets the VP8X animation flag or contains ANIM/ANMF chunks. */
export function isAnimatedWebpBytes(bytes) {
  if (!bytes || bytes.length < 16) return false;
  // "RIFF" .... "WEBP"
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return false;
  }
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const f0 = bytes[pos];
    const f1 = bytes[pos + 1];
    const f2 = bytes[pos + 2];
    const f3 = bytes[pos + 3];
    const chunkSize =
      (bytes[pos + 4] |
        (bytes[pos + 5] << 8) |
        (bytes[pos + 6] << 16) |
        (bytes[pos + 7] << 24)) >>>
      0;
    const payloadStart = pos + 8;
    // "VP8X": feature flags byte bit 1 (0x02) indicates animation
    if (f0 === 0x56 && f1 === 0x50 && f2 === 0x38 && f3 === 0x58) {
      if (payloadStart < bytes.length && (bytes[payloadStart] & 0x02) !== 0) {
        return true;
      }
    }
    // "ANIM" or "ANMF" chunk
    if (
      f0 === 0x41 &&
      f1 === 0x4e &&
      ((f2 === 0x49 && f3 === 0x4d) || (f2 === 0x4d && f3 === 0x46))
    ) {
      return true;
    }
    const paddedSize = chunkSize + (chunkSize & 1);
    const nextPos = payloadStart + paddedSize;
    if (nextPos <= pos) break;
    pos = nextPos;
  }
  return false;
}

/** Caps the longest edge to maxEdge without upscaling, preserving aspect ratio. */
export function computeCappedDimensions(width, height, maxEdge = WALLPAPER_MAX_EDGE_PX) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const cap = Math.max(1, Number(maxEdge) || WALLPAPER_MAX_EDGE_PX);
  if (w <= 0 || h <= 0) {
    return { width: 0, height: 0, resized: false };
  }
  const longest = Math.max(w, h);
  if (longest <= cap) {
    return { width: Math.round(w), height: Math.round(h), resized: false };
  }
  const scale = cap / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    resized: true,
  };
}

function defaultLoadImage(srcUrl) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = srcUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Downscales large wallpaper uploads to <= 2560px longest edge and transcodes to WebP.
 * Safely falls back to the original image on animated GIF/WebP, decode/encode errors,
 * or when WebP output is larger than the original payload.
 */
export async function optimizeWallpaperUpload({
  dataUrl = "",
  base64 = "",
  mime = "",
  bytes = null,
  maxEdge = WALLPAPER_MAX_EDGE_PX,
  quality = WALLPAPER_WEBP_QUALITY,
  loadImage = null,
  createCanvas = null,
} = {}) {
  const fallback = (reason) => ({
    base64,
    mime,
    dataUrl,
    transcoded: false,
    resized: false,
    reason,
  });

  if (!base64 || !dataUrl) {
    return fallback("empty");
  }

  const normalizedMime = String(mime || "").trim().toLowerCase();
  if (normalizedMime === "image/gif" || normalizedMime === "image/webp") {
    const rawBytes = bytes instanceof Uint8Array ? bytes : decodeBase64ToBytes(base64);
    if (normalizedMime === "image/gif" && isAnimatedGifBytes(rawBytes)) {
      return fallback("animated_gif");
    }
    if (normalizedMime === "image/webp" && isAnimatedWebpBytes(rawBytes)) {
      return fallback("animated_webp");
    }
  }

  let canvas = null;
  try {
    const imgLoader = typeof loadImage === "function" ? loadImage : defaultLoadImage;
    const img = await imgLoader(dataUrl);
    const naturalWidth = Number(img?.naturalWidth || img?.width || 0);
    const naturalHeight = Number(img?.naturalHeight || img?.height || 0);
    if (!img || naturalWidth <= 0 || naturalHeight <= 0) {
      return fallback("decode_failed");
    }

    const { width, height, resized } = computeCappedDimensions(naturalWidth, naturalHeight, maxEdge);
    if (width <= 0 || height <= 0) {
      return fallback("invalid_dimensions");
    }

    canvas =
      typeof createCanvas === "function"
        ? createCanvas()
        : typeof document !== "undefined" && typeof document.createElement === "function"
          ? document.createElement("canvas")
          : null;
    if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.toDataURL !== "function") {
      return fallback("canvas_unavailable");
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof ctx.drawImage !== "function") {
      return fallback("context_unavailable");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    const outDataUrl = canvas.toDataURL("image/webp", quality);
    if (typeof outDataUrl !== "string" || !outDataUrl.startsWith("data:image/webp")) {
      return fallback("webp_unsupported");
    }
    const commaIdx = outDataUrl.indexOf(",");
    const outBase64 = commaIdx >= 0 ? outDataUrl.slice(commaIdx + 1) : "";
    if (!outBase64) {
      return fallback("encode_empty");
    }
    if (outBase64.length > base64.length || (!resized && outBase64.length >= base64.length)) {
      return fallback("larger_than_original");
    }

    return {
      base64: outBase64,
      mime: "image/webp",
      dataUrl: outDataUrl,
      width,
      height,
      transcoded: true,
      resized,
      reason: "ok",
    };
  } catch {
    return fallback("encode_error");
  } finally {
    if (canvas) {
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch {}
    }
  }
}

function translate(tFn, key, zhFallback, enFallback, vars) {
  let raw = typeof tFn === "function" ? tFn(key, vars) : "";
  if (!raw || raw === key) {
    const lang = typeof tFn?.getLang === "function" ? tFn.getLang() : "zh-CN";
    raw = lang === "en" ? (enFallback ?? zhFallback) : zhFallback;
  }
  if (!vars) return raw;
  return String(raw).replace(/\{\{?(\w+)\}?\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : ""
  );
}

async function fetchViaSidecar(apiFetch, url, options = {}) {
  const fetcher = apiFetch || (typeof window !== "undefined" ? window.sidecar?.fetch : null);
  if (typeof fetcher !== "function") {
    throw new Error("window.sidecar.fetch unavailable");
  }
  const res = await fetcher(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.reason || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

function postJson(apiFetch, url, payload) {
  return fetchViaSidecar(apiFetch, url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function getAssetUrl(kind, id, thumb = false) {
  const params = new URLSearchParams({
    kind,
    id: String(id),
    thumb: thumb ? "1" : "0",
  });
  const basePath =
    typeof window !== "undefined" && typeof window.location?.pathname === "string"
      ? window.location.pathname.replace(/[^/]*$/, "")
      : "/";
  const prefix = basePath && basePath !== "/" ? basePath.replace(/\/+$/, "") : "";
  return `${prefix}/api/asset?${params.toString()}`;
}

function normalizeHex(hex, fallback) {
  if (typeof hex !== "string") return fallback;
  const trimmed = hex.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function normalizeColors(colors) {
  const base = BUILTIN_PALETTES[0].colors;
  const src = colors && typeof colors === "object" ? colors : {};
  return {
    accent: normalizeHex(src.accent, base.accent),
    contrast: normalizeHex(src.contrast, base.contrast),
    tertiary: normalizeHex(src.tertiary, base.tertiary),
    canvas: normalizeHex(src.canvas, base.canvas),
    chrome: normalizeHex(src.chrome, base.chrome),
    bubble: normalizeHex(src.bubble, base.bubble),
  };
}

/** Parses #rgb / #rrggbb / rgb()/rgba() into {r,g,b} (0-255), or null. */
function parseCssColor(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b };
  }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  if (m) {
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
    };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance(color) {
  const rgb = typeof color === "string" ? parseCssColor(color) : color;
  if (!rgb) return 0;
  const lin = (c) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function isLightColor(hex) {
  return relativeLuminance(hex) > 0.4;
}

/** Mixes hex `a` into hex `b`; weight is the share of `a` (0-1). */
function mixHex(a, b, weight) {
  const ca = parseCssColor(a);
  const cb = parseCssColor(b);
  if (!ca || !cb) return b;
  const w = Math.min(1, Math.max(0, weight));
  const ch = (x, y) => Math.round(x * w + y * (1 - w)).toString(16).padStart(2, "0");
  return `#${ch(ca.r, cb.r)}${ch(ca.g, cb.g)}${ch(ca.b, cb.b)}`;
}

/** Surfaces derived from the accent for the opposite brightness mode. */
function deriveSurfacesForMode(colors, wantLight) {
  if (wantLight) {
    return {
      canvas: mixHex(colors.accent, "#f7f7f9", 0.04),
      chrome: mixHex(colors.accent, "#ececf0", 0.06),
      bubble: mixHex(colors.accent, "#ffffff", 0.03),
    };
  }
  return {
    canvas: mixHex(colors.accent, "#070709", 0.03),
    chrome: mixHex(colors.accent, "#111015", 0.05),
    bubble: mixHex(colors.accent, "#131317", 0.06),
  };
}

const LIGHT_TEXT_TOKENS = Object.freeze({
  "--text-primary": "#1d1c22",
  "--text-strong": "#0f0e13",
  "--text-body": "#2c2b33",
  "--text-secondary": "#4f4e58",
  "--text-muted": "#6b6a74",
  "--text-dim": "#8d8c96",
  "--border-hairline": "color-mix(in srgb, var(--text-primary) 12%, var(--bg-chrome))",
  "--border-subtle": "color-mix(in srgb, var(--text-primary) 20%, var(--bg-chrome))",
  "--mastery-running": "#2563eb",
  "--mastery-running-bright": "#1d4ed8",
  "--mastery-running-flow": "#3b82f6",
  "--mastery-unread": "#0f9d58",
  "--mastery-unread-bright": "#047857",
  "--mastery-unread-flow": "#10b981",
  "--mastery-peer": "#64748b",
  "--mastery-peer-live": "#475569",
  "--mastery-peer-hi": "#1e40af",
});

/** Renders a cover-cropped 240x148 raster thumbnail; resolves {base64, mime} or null. */
function generateThumbnail(dataUrl, width = 240, height = 148) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx || !img.naturalWidth || !img.naturalHeight) return resolve(null);
          const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
          let mime = "image/webp";
          let out = canvas.toDataURL(mime, 0.82);
          if (!out.startsWith("data:image/webp")) {
            mime = "image/jpeg";
            out = canvas.toDataURL(mime, 0.82);
          }
          const idx = out.indexOf(",");
          canvas.width = 0;
          canvas.height = 0;
          resolve(idx >= 0 ? { base64: out.slice(idx + 1), mime } : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch {
      resolve(null);
    }
  });
}

function createDeleteIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
}

/**
 * Mounts the Theme Studio onto #panelTheme DOM nodes.
 */
export function createThemeStudio({
  apiFetch,
  t,
  onThemeApplied,
  onLanguageChange,
  onToast,
} = {}) {
  const palettesRow = document.getElementById("themePalettesRow");
  const colorsGrid = document.getElementById("themeColorsGrid");
  const previewStage = document.getElementById("themePreviewStage");
  const previewCaption = document.getElementById("themePreviewCaption");
  const previewWallpaperBg = document.getElementById("previewWallpaperBg");
  const workspaceWallpaperLayer = document.getElementById("workspaceWallpaperLayer");
  const syncGlobalBtn = document.getElementById("themeSyncGlobalBtn");
  const resetBtn = document.getElementById("themeResetBtn");

  const customPaletteNameInput = document.getElementById("customPaletteNameInput");
  const customPaletteSaveBtn = document.getElementById("customPaletteSaveBtn");
  const themeSaveStatus = document.getElementById("themeSaveStatus");

  const wallpaperCurrentName = document.getElementById("wallpaperCurrentName");
  const wallpaperThumbsRow = document.getElementById("wallpaperThumbsRow");
  const customWallpapersRow = document.getElementById("customWallpapersRow");
  const wallpaperRandomBtn = document.getElementById("wallpaperRandomBtn");
  const wallpaperUploadBtn = document.getElementById("wallpaperUploadBtn");
  const wallpaperClearBtn = document.getElementById("wallpaperClearBtn");
  const wallpaperFileInput = document.getElementById("wallpaperFileInput");

  const opacityInput = document.getElementById("wallpaperOpacityInput");
  const opacityVal = document.getElementById("wallpaperOpacityVal");
  const blurInput = document.getElementById("wallpaperBlurInput");
  const blurVal = document.getElementById("wallpaperBlurVal");
  const dimInput = document.getElementById("wallpaperDimInput");
  const dimVal = document.getElementById("wallpaperDimVal");
  const radiusInput = document.getElementById("themeRadiusInput");
  const radiusVal = document.getElementById("themeRadiusVal");
  const fitBtns = document.querySelectorAll("[data-wp-fit]");

  const languageSelector = document.getElementById("languageSelector");
  const hostThemeSyncBadge = document.getElementById("hostThemeSyncBadge");
  const backdropToggleBtn = document.getElementById("backdropToggleBtn");
  const backdropStatusBadge = document.getElementById("backdropStatusBadge");
  const backdropBlendLabel = document.getElementById("backdropBlendLabel");
  const backdropBlendInput = document.getElementById("backdropBlendInput");
  const backdropBlendVal = document.getElementById("backdropBlendVal");
  const backdropStatusHint = document.getElementById("backdropStatusHint");
  const copyBackdropCmdBtn = document.getElementById("copyBackdropCmdBtn");
  const backdropCmdInput = document.getElementById("backdropCmdInput");
  const hostModeBtns = document.querySelectorAll("[data-host-mode]");
  const nativeHudStatusBadge = document.getElementById("nativeHudStatusBadge");
  const nativeHudEnableBtn = document.getElementById("nativeHudEnableBtn");
  const nativeHudModeBtns = document.querySelectorAll("[data-hud-mode]");
  const nativeHudStatusHint = document.getElementById("nativeHudStatusHint");
  const nativeHudAutoReinjectBtn = document.getElementById("nativeHudAutoReinjectBtn");
  const nativeHudInstallBtn = document.getElementById("nativeHudInstallBtn");
  const nativeHudRestoreBtn = document.getElementById("nativeHudRestoreBtn");

  let translator = t;
  let currentLang = "zh-CN";
  let saveTimer = null;
  let dragClassTimer = null;
  let statusTimer = null;
  let backdropPollTimer = null;
  let mutationSeq = 0;
  let persistInFlight = false;
  let persistQueued = false;
  let pendingPaletteName = "";
  let lastPersistDispatchAt = 0;
  let destroyed = false;
  let backdropStatusInFlight = false;
  const trackedTimers = new Set();
  const cleanups = [];

  const scheduleTrackedTimeout = (fn, delayMs) => {
    const id = setTimeout(() => {
      trackedTimers.delete(id);
      if (!destroyed) fn();
    }, delayMs);
    trackedTimers.add(id);
    return id;
  };

  const colorInputMap = new Map();
  const colorHexMap = new Map();
  const colorLabelMap = new Map();

  const state = {
    activePaletteId: "default",
    palettes: BUILTIN_PALETTES.map((p) => ({ ...p, colors: { ...p.colors } })),
    colors: { ...BUILTIN_PALETTES[0].colors },
    syncGlobal: true,
    backdropEnabled: true,
    hudEnabled: true,
    hudInjectionMode: "asar",
    hudAutoReinject: true,
    hostThemeMode: "inject",
    cdpPort: 9229,
    hostBlendPct: 25,
    backdropStatus: null,
    activeWallpaperId: "wp-1",
    customWallpapers: [],
    opacity: 100,
    blur: 0,
    dim: 0,
    radius: 10,
    fit: "cover",
    // Read-only host bridge state: no host config is ever written.
    hostThemeSynced: false,
    hostIsLight: null,
  };

  const tr = (key, zh, en, vars) => translate(translator, key, zh, en, vars);

  const getPaletteDisplayName = (palette) => {
    if (!palette) return tr("theme.customBadge", "自定义配色", "Custom Palette");
    if (palette.builtin || BUILTIN_PALETTE_IDS.has(palette.id)) {
      const builtin = BUILTIN_PALETTES.find((p) => p.id === palette.id);
      if (builtin) {
        return builtin.nameZh;
      }
    }
    return palette.name || palette.nameZh || palette.nameEn || palette.id;
  };

  const getWallpaperDisplayName = (wpId) => {
    if (!wpId) return tr("theme.wallpaperNone", "未启用壁纸", "No wallpaper active");
    const builtin = BUILTIN_WALLPAPERS.find((w) => w.id === wpId);
    if (builtin) {
      return builtin.nameZh;
    }
    const custom = state.customWallpapers.find((w) => w.id === wpId);
    if (custom) {
      return custom.name || tr("theme.customBadge", "自定义壁纸", "Custom Wallpaper");
    }
    return wpId;
  };

  const resolveActiveWallpaperUrl = () => {
    const id = state.activeWallpaperId;
    if (!id) return "";
    if (BUILTIN_WALLPAPER_IDS.has(id)) {
      return getAssetUrl("builtin_wp", id, false);
    }
    if (state.customWallpapers.some((w) => w.id === id)) {
      return getAssetUrl("custom_wp", id, false);
    }
    return "";
  };

  const setInlineSaveStatus = (msg) => {
    if (!themeSaveStatus) return;
    clearTimeout(statusTimer);
    themeSaveStatus.textContent = msg || "";
    if (msg) {
      statusTimer = setTimeout(() => {
        themeSaveStatus.textContent = "";
      }, 2800);
    }
  };

  const buildPayload = () => ({
    activePaletteId: state.activePaletteId,
    colors: { ...state.colors },
    syncGlobal: Boolean(state.syncGlobal),
    followHostTheme: Boolean(state.syncGlobal),
    backdropEnabled: Boolean(state.backdropEnabled),
    hudEnabled: state.hudEnabled !== false,
    hudInjectionMode: state.hudInjectionMode || "asar",
    hudAutoReinject: state.hudAutoReinject !== false,
    hostThemeMode:
      state.hostThemeMode === "cdp" || state.hostThemeMode === "backdrop" ? state.hostThemeMode : "inject",
    cdpPort: state.cdpPort || 9229,
    hostBlendPct: state.hostBlendPct,
    activeWallpaperId: state.activeWallpaperId || null,
    opacity: state.opacity,
    blur: state.blur,
    dim: state.dim,
    radius: state.radius,
    fit: state.fit,
  });

  const renderBackdropCompanion = () => {
    const bd = state.backdropStatus || {};
    const cdp = bd.cdp || {};
    const nh = bd.nativeHud || {};
    const supported = bd.supported !== false || cdp.supported === true;
    const isWsl = Boolean(bd.isWsl || cdp.isWsl);
    const enabled = Boolean(state.backdropEnabled);
    const hostMode =
      state.hostThemeMode === "cdp" || state.hostThemeMode === "backdrop" ? state.hostThemeMode : "inject";
    const isCdp = hostMode === "cdp";
    const isInject = hostMode === "inject";
    const isCssMode = isCdp || isInject;
    const hasWp = Boolean(state.activeWallpaperId);
    const running = Boolean(bd.running);
    const paused = Boolean(bd.paused);
    const isolated = Boolean(bd.desktopIsolated);
    const trackedCount = Number(bd.trackedCount || 0);
    const alphaPct = Math.round(((Number(bd.appliedAlpha || 255) / 255) * 100));
    const cdpPort = Number(cdp.port || state.cdpPort || 9229);
    const cdpConnected = Boolean(cdp.connected);
    const cdpStyleLive = Boolean(cdp.styleApplied);
    const cdpTransport = String(cdp.transport || "direct");
    const nativeWpAlive = Boolean(nh.heartbeat?.wallpaperAlive);
    const asarInstalledWp = nh.state === "installed" || nh.pendingApply?.action === "install";
    const asarVerWp = nh.installedVersion || nh.currentVersion || "2.1.0";
    const quickCmd = isCdp
      ? (typeof cdp.launchCommand === "string" ? cdp.launchCommand : "")
      : (typeof bd.quickLaunchCommand === "string" ? bd.quickLaunchCommand : "");
    const launcherCmdPath = isCdp
      ? (typeof cdp.shortcutLnkPath === "string" && cdp.shortcutLnkPath
          ? cdp.shortcutLnkPath
          : typeof cdp.launcherCmdPath === "string"
            ? cdp.launcherCmdPath
            : "")
      : (typeof bd.launcherCmdPath === "string" ? bd.launcherCmdPath : "");

    hostModeBtns.forEach((btn) => {
      const mode = btn.getAttribute("data-host-mode");
      const isCurrent = mode === hostMode;
      btn.classList.toggle("is-active", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
      btn.disabled = !supported;
    });

    if (backdropToggleBtn) {
      backdropToggleBtn.classList.toggle("is-toggled", enabled);
      backdropToggleBtn.setAttribute("aria-pressed", String(enabled));
      backdropToggleBtn.disabled = !supported;
    }
    if (backdropBlendLabel) {
      backdropBlendLabel.textContent = isCssMode
        ? tr("backdrop.blendLabelCdp", "底层壁纸透出强度（文字 100% 锐利）", "Wallpaper Show-Through (100% Crisp Text)")
        : tr("backdrop.blendLabel", "整机壁纸透显度（主窗柔和透明）", "Desktop Blend (Soft Host Translucency)");
    }
    if (backdropBlendInput) {
      backdropBlendInput.value = String(state.hostBlendPct);
      backdropBlendInput.disabled = !supported;
    }
    if (backdropBlendVal) {
      backdropBlendVal.textContent = `${state.hostBlendPct}%`;
    }

    if (backdropStatusBadge) {
      let badgeCls = "boundary-badge is-scoped";
      let badgeText = tr("backdrop.statusPreparing", "准备就绪", "Ready");
      if (!supported) {
        badgeCls = "boundary-badge is-disabled";
        badgeText = tr("backdrop.statusUnsupported", "仅支持 Windows", "Windows Only");
      } else if (!enabled) {
        badgeCls = "boundary-badge is-disabled";
        badgeText = tr("backdrop.statusOff", "未开启", "Disabled");
      } else if (!hasWp) {
        badgeCls = "boundary-badge is-scoped";
        badgeText = tr("backdrop.statusStandby", "待选壁纸", "Pick Wallpaper");
      } else if (isInject) {
        if (nativeWpAlive) {
          badgeCls = "boundary-badge is-synced";
          badgeText = tr("backdrop.statusInjectLive", "持久注入生效 (v{ver})", "Inject Active (v{ver})", {
            ver: asarVerWp,
          });
        } else if (cdpStyleLive) {
          badgeCls = "boundary-badge is-synced";
          badgeText = tr("backdrop.statusInjectHotLive", "热注入已生效", "Hot-Inject Live");
        } else if (asarInstalledWp) {
          badgeCls = "boundary-badge is-scoped";
          badgeText = tr("backdrop.statusInjectPending", "已持久化 · 重启生效", "Persisted · Restart AGY");
        } else {
          badgeCls = "boundary-badge is-scoped";
          badgeText = tr("backdrop.statusInjectNeed", "待自动注入", "Pending Inject");
        }
      } else if (isCdp) {
        if (cdpConnected) {
          badgeCls = "boundary-badge is-synced";
          badgeText = isWsl
            ? tr(
                "backdrop.statusCdpConnectedWsl",
                "CDP 已桥接 (WSL :{port})",
                "CDP Bridged (WSL :{port})",
                { port: cdpPort }
              )
            : tr("backdrop.statusCdpConnected", "CDP 已直连 (:{port})", "CDP Linked (:{port})", {
                port: cdpPort,
              });
        } else {
          badgeCls = "boundary-badge is-scoped";
          badgeText = tr("backdrop.statusCdpWait", "待 CDP 启动 (:{port})", "Wait CDP (:{port})", {
            port: cdpPort,
          });
        }
      } else if (running && paused) {
        badgeCls = "boundary-badge is-scoped";
        badgeText = tr("backdrop.statusPaused", "伴侣已暂停", "Paused in Tray");
      } else if (running) {
        badgeCls = "boundary-badge is-synced";
        badgeText = isWsl
          ? tr("backdrop.statusRunningWsl", "伴侣运行中（WSL · {count} 窗）", "Active (WSL · {count} win)", {
              count: trackedCount,
            })
          : tr("backdrop.statusRunning", "伴侣运行中（{count} 窗）", "Active ({count} win)", {
              count: trackedCount,
            });
      } else if (isolated) {
        badgeCls = "boundary-badge is-scoped";
        badgeText = tr("backdrop.statusIsolated", "待桌面启动", "Run on Desktop");
      }
      backdropStatusBadge.className = badgeCls;
      backdropStatusBadge.textContent = badgeText;
    }

    if (backdropStatusHint) {
      if (!enabled) {
        backdropStatusHint.textContent = tr(
          "backdrop.descAuto",
          "在窗口后方贴合壁纸，无需重启软件。",
          "Renders wallpaper behind the window without restarting."
        );
      } else if (!hasWp) {
        backdropStatusHint.textContent = tr(
          "backdrop.descNoWallpaper",
          "请先在上方选一张壁纸。",
          "Select or upload a wallpaper above first."
        );
      } else if (isInject) {
        if (nativeWpAlive) {
          backdropStatusHint.textContent = tr(
            "backdrop.descInjectLive",
            "原生壁纸已生效，调节滑块实时同步，更新后自动恢复。",
            "Native wallpaper active; sliders sync live.",
            { ver: asarVerWp }
          );
        } else if (cdpStyleLive) {
          backdropStatusHint.textContent = tr(
            "backdrop.descInjectHotLive",
            "壁纸已生效，下次重启后直接自动加载。",
            "Wallpaper active; auto-loads after next restart.",
            { ver: asarVerWp }
          );
        } else if (asarInstalledWp) {
          backdropStatusHint.textContent = tr(
            "backdrop.descInjectPending",
            "已写入配置并保留备份，重启软件后自动生效。",
            "Saved with backup; restart to apply.",
            { ver: asarVerWp }
          );
        } else {
          backdropStatusHint.textContent = tr(
            "backdrop.descInjectNeed",
            "已启用原生壁纸，调节上方参数实时生效，随时可一键还原。",
            "Native wallpaper enabled; adjustable live with one-click restore."
          );
        }
      } else if (isCdp) {
        if (cdpConnected) {
          backdropStatusHint.textContent = isWsl
            ? tr(
                "backdrop.descCdpConnectedWsl",
                "WSL 跨端壁纸已生效，拖动滑块实时调节。",
                "WSL wallpaper active; sliders sync live.",
                {
                  port: cdpPort,
                  mode: cdpTransport === "wsl_tunnel" ? "NAT 隧道" : cdpTransport === "wsl_gateway" ? "网关" : "直连",
                }
              )
            : tr(
                "backdrop.descCdpConnected",
                "整机壁纸已生效，拖动滑块实时调节。",
                "Whole-window wallpaper active; sliders sync live.",
                { port: cdpPort }
              );
        } else {
          backdropStatusHint.textContent = isWsl
            ? tr(
                "backdrop.descCdpWaitWsl",
                "在 Windows 端退出软件后，运行「{path}」即可生效。",
                "Quit on Windows and run \"{path}\" to activate.",
                { path: launcherCmdPath || quickCmd, port: cdpPort }
              )
            : tr(
                "backdrop.descCdpWait",
                "完全退出软件后，双击快捷方式「{path}」启动即可生效。",
                "Quit and launch via \"{path}\" to activate.",
                { path: launcherCmdPath || quickCmd, port: cdpPort }
              );
        }
      } else if (running) {
        backdropStatusHint.textContent = tr(
          "backdrop.descRunning",
          "方案一在线（追踪 {count} 窗 · 主窗不透明度 {alpha}%）；若觉得文字偏柔可切换方案二或方案三。",
          "Mode 1 active ({count} win · {alpha}% opacity); switch to Mode 2 or Mode 3 for 100% crisp text.",
          { count: trackedCount, alpha: alphaPct }
        );
      } else if (isolated && quickCmd) {
        backdropStatusHint.textContent = tr(
          "backdrop.descIsolated",
          "官方插件进程在隔离沙箱中；复制右侧启动命令（Win+R）或双击「{path}」启动一次即可常驻托盘。",
          "Sidecar runs inside an isolated sandbox; copy & run the launch command (Win+R) or double-click \"{path}\" once.",
          { path: launcherCmdPath || quickCmd }
        );
      } else {
        backdropStatusHint.textContent = tr(
          "backdrop.descAuto",
          "方案一：在 Antigravity 窗口正后方贴合壁纸并微透主窗（零侵入、无需重启 AGY）。",
          "Mode 1 renders the active wallpaper behind Antigravity with soft translucency (no restart needed)."
        );
      }
    }

    const showQuickLaunch = Boolean(
      supported &&
        enabled &&
        !isInject &&
        quickCmd &&
        (isCdp ? !cdpConnected : !running && isolated)
    );
    if (copyBackdropCmdBtn) {
      copyBackdropCmdBtn.hidden = !showQuickLaunch;
    }
    if (backdropCmdInput) {
      backdropCmdInput.hidden = !showQuickLaunch;
      if (showQuickLaunch) {
        backdropCmdInput.value = quickCmd;
      }
    }

    const hudEnabled = state.hudEnabled !== false;
    const hudMode = state.hudInjectionMode || "asar";
    const autoReinject = state.hudAutoReinject !== false;
    const nativeAlive = Boolean(nh.heartbeat?.alive);
    const cdpHudLive = Boolean(cdp.hudInjected);
    const asarInstalled = nh.state === "installed" || nh.pendingApply?.action === "install";
    const ver = nh.installedVersion || nh.currentVersion || "2.0.0";

    if (nativeHudEnableBtn) {
      nativeHudEnableBtn.classList.toggle("is-toggled", hudEnabled);
      nativeHudEnableBtn.setAttribute("aria-pressed", String(hudEnabled));
    }
    if (nativeHudAutoReinjectBtn) {
      nativeHudAutoReinjectBtn.classList.toggle("is-toggled", autoReinject);
      nativeHudAutoReinjectBtn.setAttribute("aria-pressed", String(autoReinject));
      nativeHudAutoReinjectBtn.disabled = hudMode === "uia";
    }
    nativeHudModeBtns.forEach((btn) => {
      const m = btn.getAttribute("data-hud-mode");
      const isCur = m === hudMode;
      btn.classList.toggle("is-active", isCur);
      btn.setAttribute("aria-selected", String(isCur));
    });
    if (nativeHudInstallBtn) {
      nativeHudInstallBtn.disabled = !supported || hudMode === "uia";
    }
    if (nativeHudRestoreBtn) {
      nativeHudRestoreBtn.disabled = !supported || (!asarInstalled && !nh.bakExists && !cdpHudLive);
    }

    if (nativeHudStatusBadge) {
      let cls = "boundary-badge is-scoped";
      let txt = tr("nativeHud.statusChecking", "检测中", "Checking");
      if (!hudEnabled) {
        cls = "boundary-badge is-disabled";
        txt = tr("nativeHud.statusOff", "已关闭", "Disabled");
      } else if (hudMode === "uia") {
        cls = "boundary-badge is-scoped";
        txt = tr("nativeHud.statusUia", "旧版 UIA 浮窗", "Legacy UIA");
      } else if (nativeAlive) {
        cls = "boundary-badge is-synced";
        txt = tr("nativeHud.statusNativeLive", "原生 DOM 运行中", "Native DOM Active");
      } else if (cdpHudLive) {
        cls = "boundary-badge is-synced";
        txt = tr("nativeHud.statusCdpLive", "CDP 热注入运行中", "CDP Hot-Inject Active");
      } else if (hudMode === "asar" && asarInstalled) {
        cls = "boundary-badge is-scoped";
        txt = tr("nativeHud.statusPendingRestart", "已持久化 · 重启后免捷径生效", "Persisted · Restart AGY");
      } else if (hudMode === "asar") {
        cls = "boundary-badge is-scoped";
        txt = tr("nativeHud.statusNeedInject", "待自动补注", "Pending Reinject");
      } else {
        cls = "boundary-badge is-scoped";
        txt = tr("nativeHud.statusWaitCdp", "等待 CDP 连接", "Waiting for CDP");
      }
      nativeHudStatusBadge.className = cls;
      nativeHudStatusBadge.textContent = txt;
    }

    if (nativeHudStatusHint) {
      if (!hudEnabled) {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descDefault",
          "紧贴输入框显示上下文进度与速率，更新后自动恢复。",
          "Shows context progress and speed right in the composer."
        );
      } else if (hudMode === "uia") {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descUia",
          "当前为旧版外部浮窗，建议切换为「原生持久」。",
          "Legacy overlay mode; Persistent mode is recommended."
        );
      } else if (nativeAlive) {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descNativeLive",
          "原生状态栏已生效，随时可一键还原。",
          "Native HUD active; one-click restore available.",
          { ver }
        );
      } else if (cdpHudLive) {
        const persistHint =
          hudMode === "asar" && asarInstalled
            ? "重启后将自动原生加载。"
            : hudMode === "asar"
              ? "将自动持久化保存。"
              : "未改动安装文件。";
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descCdpLive",
          "状态栏已临时生效；{persistHint}",
          "HUD is live; {persistHint}",
          { persistHint }
        );
      } else if (hudMode === "asar" && asarInstalled) {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descPendingRestart",
          "已写入配置并保留备份，重启软件后生效。",
          "Saved with backup; restart to apply.",
          { ver }
        );
      } else if (hudMode === "asar") {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descAsarWait",
          "待自动应用，也可点击右侧「立即应用」。",
          "Pending auto-apply, or click Apply Now."
        );
      } else {
        nativeHudStatusHint.textContent = tr(
          "nativeHud.descCdpWait",
          "使用带调试端口的方式启动软件后自动生效。",
          "Auto-activates when launched with debug port."
        );
      }
    }
  };

  const computeEffectiveColors = () => {
    const colors = { ...state.colors };
    // "Follow host light/dark": only swap panel surfaces when the host's
    // read-only theme-change brightness differs from the palette canvas.
    if (state.syncGlobal && typeof state.hostIsLight === "boolean") {
      if (state.hostIsLight !== isLightColor(colors.canvas)) {
        Object.assign(colors, deriveSurfacesForMode(colors, state.hostIsLight));
      }
    }
    return colors;
  };

  const applyTheme = () => {
    const rootStyle = document.documentElement.style;
    const wpUrl = resolveActiveWallpaperUrl();
    const wpCssUrl = wpUrl ? `url("${wpUrl}")` : "none";

    if (previewStage) {
      const previewIsLight = isLightColor(state.colors.canvas);
      previewStage.style.setProperty("--preview-accent", state.colors.accent);
      previewStage.style.setProperty("--preview-contrast", state.colors.contrast);
      previewStage.style.setProperty("--preview-tertiary", state.colors.tertiary);
      previewStage.style.setProperty("--preview-canvas", state.colors.canvas);
      previewStage.style.setProperty("--preview-chrome", state.colors.chrome);
      previewStage.style.setProperty("--preview-bubble", state.colors.bubble);
      previewStage.style.setProperty("--preview-text-primary", previewIsLight ? "#1d1c22" : "#e8e7ec");
      previewStage.style.setProperty("--preview-text-secondary", previewIsLight ? "#4f4e58" : "#adacb4");
      previewStage.style.setProperty("--preview-radius", `${state.radius}px`);
      previewStage.style.setProperty("--preview-wp-opacity", (state.opacity / 100).toFixed(2));
      previewStage.style.setProperty("--preview-wp-blur", `${state.blur}px`);
      previewStage.style.setProperty("--preview-wp-dim", (state.dim / 100).toFixed(2));
      previewStage.style.setProperty("--preview-wp-fit", state.fit);
    }

    if (previewWallpaperBg) {
      previewWallpaperBg.style.backgroundImage = wpCssUrl;
      previewWallpaperBg.classList.toggle("has-image", Boolean(wpUrl));
    }

    if (previewCaption) {
      const activePalette = state.palettes.find((p) => p.id === state.activePaletteId);
      previewCaption.textContent = activePalette
        ? getPaletteDisplayName(activePalette)
        : tr("theme.customBadge", "自定义配色", "Custom");
    }

    if (wallpaperCurrentName) {
      wallpaperCurrentName.textContent = getWallpaperDisplayName(
        wpUrl ? state.activeWallpaperId : null
      );
    }

    // Always apply customized look to the plugin panel itself (never to the host)
    const effective = computeEffectiveColors();
    rootStyle.setProperty("--accent-blue", effective.accent);
    rootStyle.setProperty("--accent-blue-dot", effective.accent);
    rootStyle.setProperty("--accent-amber", effective.contrast);
    rootStyle.setProperty("--accent-teal", effective.tertiary);
    rootStyle.setProperty("--bg-canvas", effective.canvas);
    rootStyle.setProperty("--bg-chrome", effective.chrome);
    rootStyle.setProperty("--bg-bubble", effective.bubble);
    rootStyle.setProperty("--background", effective.canvas);
    rootStyle.setProperty("--ui-radius", `${state.radius}px`);
    rootStyle.setProperty("--wallpaper-opacity", (state.opacity / 100).toFixed(2));
    rootStyle.setProperty("--wallpaper-blur", `${state.blur}px`);
    rootStyle.setProperty("--wallpaper-dim", (state.dim / 100).toFixed(2));
    rootStyle.setProperty("--wallpaper-fit", state.fit);

    // High-contrast text/border tokens follow the effective canvas brightness
    const canvasIsLight = isLightColor(effective.canvas);
    Object.entries(LIGHT_TEXT_TOKENS).forEach(([prop, value]) => {
      if (canvasIsLight) rootStyle.setProperty(prop, value);
      else rootStyle.removeProperty(prop);
    });
    rootStyle.setProperty(
      "--text-on-accent",
      relativeLuminance(effective.accent) > 0.55 ? "#111015" : "#ffffff"
    );
    rootStyle.setProperty("--foreground", "var(--text-primary)");
    rootStyle.setProperty("color-scheme", canvasIsLight ? "light" : "dark");
    document.documentElement.classList.toggle("is-light-canvas", canvasIsLight);

    if (workspaceWallpaperLayer) {
      const bd = state.backdropStatus || {};
      const cdp = bd.cdp || {};
      const nh = bd.nativeHud || {};
      const hostMode =
        state.hostThemeMode === "cdp" || state.hostThemeMode === "backdrop" ? state.hostThemeMode : "inject";
      const sharedWithHostBackdrop = Boolean(
        wpUrl &&
          state.backdropEnabled &&
          hostMode === "backdrop" &&
          bd.running &&
          !bd.paused
      );
      const sharedWithHostCss = Boolean(
        wpUrl &&
          state.backdropEnabled &&
          ((hostMode === "inject" && (Boolean(nh.heartbeat?.wallpaperAlive) || Boolean(cdp.styleApplied))) ||
            (hostMode === "cdp" && (Boolean(cdp.styleApplied) || Boolean(cdp.connected))))
      );
      const isSharedWithHost = sharedWithHostBackdrop || sharedWithHostCss;
      const dimFrac = state.dim / 100;
      const blendFrac = state.hostBlendPct / 100;
      const panelVeilPct =
        wpUrl && state.backdropEnabled && !isSharedWithHost
          ? Math.round(Math.max(28, Math.min(96, (1 - (1 - dimFrac) * blendFrac) * 100)))
          : 0;
      const hostSurfaceAlphaPct = Math.round(Math.max(58, Math.min(92, 100 - state.hostBlendPct)));
      rootStyle.setProperty("--panel-surface-veil-pct", `${panelVeilPct}%`);
      rootStyle.setProperty("--host-surface-alpha-pct", `${hostSurfaceAlphaPct}%`);
      // Drop decoded sidebar wallpaper texture while host wallpaper is shared; restore on exit
      workspaceWallpaperLayer.style.backgroundImage = isSharedWithHost ? "none" : wpCssUrl;
      workspaceWallpaperLayer.style.backgroundSize = state.fit;
      document.documentElement.classList.toggle("host-css-shared", sharedWithHostCss);
      document.body.classList.toggle("has-wallpaper", Boolean(wpUrl) && !isSharedWithHost);
      document.body.classList.toggle("host-backdrop-shared", sharedWithHostBackdrop);
      document.body.classList.toggle("host-css-shared", sharedWithHostCss);
    }

    if (syncGlobalBtn) {
      syncGlobalBtn.classList.toggle("is-toggled", Boolean(state.syncGlobal));
      syncGlobalBtn.setAttribute("aria-pressed", String(Boolean(state.syncGlobal)));
    }

    if (hostThemeSyncBadge) {
      if (state.syncGlobal) {
        hostThemeSyncBadge.className = "boundary-badge is-synced";
        hostThemeSyncBadge.textContent = tr(
          "theme.boundarySynced",
          "仅监听宿主明暗",
          "Follows Host Light/Dark"
        );
      } else {
        hostThemeSyncBadge.className = "boundary-badge is-scoped";
        hostThemeSyncBadge.textContent = tr(
          "theme.boundaryUnsynced",
          "完全独立配色",
          "Independent Palette"
        );
      }
    }

    onThemeApplied?.(buildPayload());
  };

  const syncSlidersAndFitUi = () => {
    if (opacityInput) opacityInput.value = String(state.opacity);
    if (opacityVal) opacityVal.textContent = `${state.opacity}%`;
    if (blurInput) blurInput.value = String(state.blur);
    if (blurVal) blurVal.textContent = `${state.blur}px`;
    if (dimInput) dimInput.value = String(state.dim);
    if (dimVal) dimVal.textContent = `${state.dim}%`;
    if (radiusInput) radiusInput.value = String(state.radius);
    if (radiusVal) radiusVal.textContent = `${state.radius}px`;

    fitBtns.forEach((btn) => {
      const isCurrent = btn.getAttribute("data-wp-fit") === state.fit;
      btn.classList.toggle("is-active", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
    });
  };

  const syncColorPickers = () => {
    COLOR_FIELDS.forEach(({ key, i18nKey, zh, en }) => {
      const input = colorInputMap.get(key);
      const hexLabel = colorHexMap.get(key);
      const labelEl = colorLabelMap.get(key);
      const val = state.colors[key];
      if (input && val) input.value = val;
      if (hexLabel && val) hexLabel.textContent = val.toUpperCase();
      if (labelEl) labelEl.textContent = tr(i18nKey, zh, en);
    });
  };

  const mergePalettesFromServer = (serverPalettes) => {
    const merged = BUILTIN_PALETTES.map((b) => ({
      ...b,
      colors: { ...b.colors },
    }));
    if (Array.isArray(serverPalettes)) {
      serverPalettes.forEach((item) => {
        if (!item || !item.id) return;
        const isBuiltin = item.builtin === true || BUILTIN_PALETTE_IDS.has(item.id);
        if (isBuiltin) {
          const idx = merged.findIndex((p) => p.id === item.id);
          if (idx >= 0 && item.colors) {
            merged[idx] = {
              ...merged[idx],
              colors: normalizeColors(item.colors),
            };
          }
        } else {
          merged.push({
            id: String(item.id),
            name: String(item.name || item.id),
            builtin: false,
            colors: normalizeColors(item.colors),
          });
        }
      });
    }
    state.palettes = merged;
  };

  const hydrateThemeState = (themeState) => {
    if (!themeState || typeof themeState !== "object") return;
    mergePalettesFromServer(themeState.palettes);

    if (typeof themeState.followHostTheme === "boolean") {
      state.syncGlobal = themeState.followHostTheme;
    } else if (typeof themeState.syncGlobal === "boolean") {
      state.syncGlobal = themeState.syncGlobal;
    }
    if (typeof themeState.backdropEnabled === "boolean") {
      state.backdropEnabled = themeState.backdropEnabled;
    }
    if (typeof themeState.hudEnabled === "boolean") {
      state.hudEnabled = themeState.hudEnabled;
    }
    if (themeState.hudInjectionMode === "asar" || themeState.hudInjectionMode === "cdp" || themeState.hudInjectionMode === "uia") {
      state.hudInjectionMode = themeState.hudInjectionMode;
    }
    if (typeof themeState.hudAutoReinject === "boolean") {
      state.hudAutoReinject = themeState.hudAutoReinject;
    }
    if (
      themeState.hostThemeMode === "inject" ||
      themeState.hostThemeMode === "cdp" ||
      themeState.hostThemeMode === "backdrop"
    ) {
      state.hostThemeMode = themeState.hostThemeMode;
    }
    if (typeof themeState.cdpPort === "number" && Number.isFinite(themeState.cdpPort)) {
      state.cdpPort = Math.min(65535, Math.max(1024, Math.round(themeState.cdpPort)));
    }
    if (typeof themeState.hostBlendPct === "number") {
      state.hostBlendPct = Math.min(42, Math.max(5, Math.round(themeState.hostBlendPct)));
    }
    if (typeof themeState.opacity === "number") {
      state.opacity = Math.min(100, Math.max(0, Math.round(themeState.opacity)));
    }
    if (typeof themeState.blur === "number") {
      state.blur = Math.min(24, Math.max(0, Math.round(themeState.blur)));
    }
    if (typeof themeState.dim === "number") {
      state.dim = Math.min(85, Math.max(0, Math.round(themeState.dim)));
    }
    if (typeof themeState.radius === "number") {
      state.radius = Math.min(18, Math.max(4, Math.round(themeState.radius)));
    }
    if (themeState.fit === "cover" || themeState.fit === "contain") {
      state.fit = themeState.fit;
    }
    if (Array.isArray(themeState.customWallpapers)) {
      state.customWallpapers = themeState.customWallpapers.filter((w) => w && w.id);
    }
    state.activeWallpaperId = themeState.activeWallpaperId || null;

    if (themeState.activePaletteId) {
      state.activePaletteId = themeState.activePaletteId;
    }
    const matchedPalette = state.palettes.find((p) => p.id === state.activePaletteId);
    if (themeState.colors && typeof themeState.colors === "object") {
      state.colors = normalizeColors(themeState.colors);
      if (
        !matchedPalette ||
        COLOR_FIELDS.some(({ key }) => state.colors[key] !== matchedPalette.colors[key])
      ) {
        state.activePaletteId = "custom";
      }
    } else if (matchedPalette) {
      state.colors = { ...matchedPalette.colors };
    } else {
      state.activePaletteId = "custom";
    }
  };

  const markDraggingTheme = () => {
    if (typeof document !== "undefined" && document.documentElement?.classList) {
      document.documentElement.classList.add("is-dragging-theme");
      clearTimeout(dragClassTimer);
      dragClassTimer = setTimeout(() => {
        document.documentElement?.classList?.remove("is-dragging-theme");
      }, 150);
    }
  };

  const persistTheme = async ({ saveAsNewPaletteName, silent = false } = {}) => {
    if (destroyed) return null;
    if (persistInFlight) {
      persistQueued = true;
      if (saveAsNewPaletteName) {
        pendingPaletteName = saveAsNewPaletteName;
      }
      return null;
    }
    const reqSeq = mutationSeq;
    persistInFlight = true;
    lastPersistDispatchAt = Date.now();
    try {
      const payload = { themeState: buildPayload() };
      if (saveAsNewPaletteName) {
        payload.saveAsNewPaletteName = saveAsNewPaletteName;
      }
      const res = await postJson(apiFetch, "/api/theme/save", payload);
      if (destroyed) return null;
      if (res.backdropStatus) {
        state.backdropStatus = res.backdropStatus;
      }
      if (typeof res.hostThemeSynced === "boolean") {
        state.hostThemeSynced = res.hostThemeSynced;
      }
      // Only hydrate server snapshot back into UI if the user did not keep editing while in flight
      const isLatest = reqSeq === mutationSeq;
      if (isLatest && res.themeState) {
        hydrateThemeState(res.themeState);
        renderPaletteChips();
        syncColorPickers();
        syncSlidersAndFitUi();
        renderWallpaperThumbs();
        applyTheme();
      } else if (saveAsNewPaletteName && res.themeState?.palettes) {
        mergePalettesFromServer(res.themeState.palettes);
        renderPaletteChips();
      }
      renderBackdropCompanion();
      if (!silent) {
        setInlineSaveStatus(
          saveAsNewPaletteName
            ? tr("theme.customPaletteSaved", "已保存：{name}", "Saved: {name}", {
                name: saveAsNewPaletteName,
              })
            : tr("theme.wallpaperSaved", "已保存设置", "Settings saved")
        );
      }
      return res;
    } catch (err) {
      if (!destroyed) {
        onToast?.(
          err?.message ||
            tr("theme.customPaletteSaveFailed", "保存配色方案失败", "Failed to save theme"),
          "error"
        );
      }
      return null;
    } finally {
      persistInFlight = false;
      if (!destroyed && (persistQueued || pendingPaletteName)) {
        const queuedName = pendingPaletteName;
        pendingPaletteName = "";
        persistQueued = false;
        void persistTheme(queuedName ? { saveAsNewPaletteName: queuedName } : { silent: true });
      }
    }
  };

  // Leading + trailing 50ms throttle so live dragging streams smoothly to disk & desktop backdrop
  const schedulePersistTheme = () => {
    clearTimeout(saveTimer);
    const elapsed = Date.now() - lastPersistDispatchAt;
    if (!persistInFlight && elapsed >= 50) {
      void persistTheme({ silent: true });
      return;
    }
    const waitMs = Math.max(16, 50 - elapsed);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistTheme({ silent: true });
    }, waitMs);
  };

  const renderPaletteChips = () => {
    if (!palettesRow) return;
    palettesRow.innerHTML = "";

    state.palettes.forEach((palette) => {
      const isCurrent = state.activePaletteId === palette.id;
      const isCustom = !palette.builtin && !BUILTIN_PALETTE_IDS.has(palette.id);

      const chip = document.createElement("div");
      chip.className = `theme-palette-chip${isCurrent ? " is-active" : ""}`;
      chip.setAttribute("role", "option");
      chip.setAttribute("aria-selected", String(isCurrent));
      chip.tabIndex = 0;
      chip.dataset.paletteId = palette.id;

      const dots = document.createElement("span");
      dots.className = "palette-dots";
      dots.setAttribute("aria-hidden", "true");
      [palette.colors.accent, palette.colors.contrast, palette.colors.tertiary].forEach((c) => {
        const dot = document.createElement("span");
        dot.className = "palette-dot";
        dot.style.background = c;
        dots.appendChild(dot);
      });

      const nameSpan = document.createElement("span");
      nameSpan.textContent = getPaletteDisplayName(palette);

      chip.appendChild(dots);
      chip.appendChild(nameSpan);

      const activatePalette = () => {
        mutationSeq += 1;
        state.activePaletteId = palette.id;
        state.colors = { ...palette.colors };
        syncColorPickers();
        renderPaletteChips();
        applyTheme();
        persistTheme({ silent: true });
      };

      chip.addEventListener("click", activatePalette);
      chip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activatePalette();
        }
      });

      if (isCustom) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "palette-delete-btn";
        const delTitle = tr("common.delete", "删除", "Delete");
        delBtn.title = delTitle;
        delBtn.setAttribute("aria-label", delTitle);
        delBtn.appendChild(createDeleteIconSvg());
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          mutationSeq += 1;
          try {
            const res = await postJson(apiFetch, "/api/theme/palette/delete", {
              paletteId: palette.id,
            });
            if (destroyed) return;
            if (res.themeState) {
              hydrateThemeState(res.themeState);
            } else {
              state.palettes = state.palettes.filter((p) => p.id !== palette.id);
              if (state.activePaletteId === palette.id) {
                state.activePaletteId = "default";
                state.colors = { ...BUILTIN_PALETTES[0].colors };
              }
            }
            renderPaletteChips();
            syncColorPickers();
            applyTheme();
            renderBackdropCompanion();
            onToast?.(
              tr("theme.customPaletteDeleted", "已删除自定义配色方案", "Deleted custom palette"),
              "info"
            );
          } catch (err) {
            if (!destroyed) {
              onToast?.(
                err?.message ||
                  tr("theme.customPaletteDeleteFailed", "删除配色方案失败", "Failed to delete palette"),
                "error"
              );
            }
          }
        });
        chip.appendChild(delBtn);
      }

      palettesRow.appendChild(chip);
    });
  };

  const renderColorGrid = () => {
    if (!colorsGrid) return;
    colorsGrid.innerHTML = "";
    colorInputMap.clear();
    colorHexMap.clear();
    colorLabelMap.clear();

    COLOR_FIELDS.forEach(({ key, i18nKey, zh, en }) => {
      const item = document.createElement("label");
      item.className = "theme-color-item";

      const meta = document.createElement("span");
      meta.className = "theme-color-meta";

      const labelEl = document.createElement("span");
      labelEl.className = "theme-color-label";
      labelEl.textContent = tr(i18nKey, zh, en);

      const hexEl = document.createElement("span");
      hexEl.className = "theme-color-hex";
      hexEl.textContent = state.colors[key].toUpperCase();

      meta.appendChild(labelEl);
      meta.appendChild(hexEl);

      const pickerWrap = document.createElement("span");
      pickerWrap.className = "theme-color-picker-wrap";

      const input = document.createElement("input");
      input.type = "color";
      input.className = "theme-color-input";
      input.value = state.colors[key];
      input.setAttribute("aria-label", labelEl.textContent);

      input.addEventListener("input", () => {
        mutationSeq += 1;
        markDraggingTheme();
        state.activePaletteId = "custom";
        state.colors[key] = input.value;
        // If user explicitly edits canvas/chrome/bubble to a brightness different from host,
        // release followHostTheme so the picked color renders immediately instead of being clobbered.
        if (
          (key === "canvas" || key === "chrome" || key === "bubble") &&
          state.syncGlobal &&
          typeof state.hostIsLight === "boolean" &&
          state.hostIsLight !== isLightColor(state.colors.canvas)
        ) {
          state.syncGlobal = false;
        }
        hexEl.textContent = input.value.toUpperCase();
        renderPaletteChips();
        applyTheme();
        schedulePersistTheme();
      });

      pickerWrap.appendChild(input);
      item.appendChild(meta);
      item.appendChild(pickerWrap);
      colorsGrid.appendChild(item);

      colorInputMap.set(key, input);
      colorHexMap.set(key, hexEl);
      colorLabelMap.set(key, labelEl);
    });
  };

  const renderWallpaperThumbs = () => {
    if (wallpaperThumbsRow) {
      wallpaperThumbsRow.innerHTML = "";
      BUILTIN_WALLPAPERS.forEach((wp) => {
        const isCurrent = state.activeWallpaperId === wp.id;
        const label = wp.nameZh;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `wallpaper-thumb-btn${isCurrent ? " is-active" : ""}`;
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", String(isCurrent));
        btn.title = label;

        const img = document.createElement("img");
        img.className = "wallpaper-thumb-img";
        img.src = getAssetUrl("builtin_wp", wp.id, true);
        img.alt = label;
        img.loading = "lazy";

        const labelSpan = document.createElement("span");
        labelSpan.className = "wallpaper-thumb-label";
        labelSpan.textContent = label;

        btn.appendChild(img);
        btn.appendChild(labelSpan);

        btn.addEventListener("click", () => {
          mutationSeq += 1;
          state.activeWallpaperId = wp.id;
          renderWallpaperThumbs();
          applyTheme();
          persistTheme({ silent: true });
        });

        wallpaperThumbsRow.appendChild(btn);
      });
    }

    if (customWallpapersRow) {
      customWallpapersRow.innerHTML = "";
      if (state.customWallpapers.length === 0) {
        customWallpapersRow.hidden = true;
      } else {
        customWallpapersRow.hidden = false;
        state.customWallpapers.forEach((wp) => {
          const isCurrent = state.activeWallpaperId === wp.id;
          const chip = document.createElement("div");
          chip.className = `custom-wp-chip${isCurrent ? " is-active" : ""}`;

          const thumb = document.createElement("img");
          thumb.className = "custom-wp-mini-thumb";
          thumb.src = getAssetUrl("custom_wp", wp.id, true);
          thumb.alt = wp.name || "custom wallpaper";

          const nameSpan = document.createElement("span");
          nameSpan.className = "custom-wp-name";
          nameSpan.textContent = wp.name || tr("theme.customBadge", "自定义壁纸", "Custom");
          nameSpan.title = nameSpan.textContent;
          chip.addEventListener("click", () => {
            mutationSeq += 1;
            state.activeWallpaperId = wp.id;
            renderWallpaperThumbs();
            applyTheme();
            persistTheme({ silent: true });
          });

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "palette-delete-btn";
          delBtn.title = tr("theme.wallpaperDeleteBtn", "删除壁纸", "Delete Wallpaper");
          delBtn.appendChild(createDeleteIconSvg());
          delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            mutationSeq += 1;
            try {
              const res = await postJson(apiFetch, "/api/theme/wallpaper/delete", {
                wallpaperId: wp.id,
              });
              if (destroyed) return;
              if (res.themeState) {
                hydrateThemeState(res.themeState);
              } else {
                state.customWallpapers = state.customWallpapers.filter((item) => item.id !== wp.id);
                if (state.activeWallpaperId === wp.id) {
                  state.activeWallpaperId = null;
                }
              }
              renderWallpaperThumbs();
              applyTheme();
              renderBackdropCompanion();
              onToast?.(
                tr("theme.wallpaperDeleted", "已删除自定义壁纸", "Deleted custom wallpaper"),
                "info"
              );
            } catch (err) {
              if (destroyed) return;
              onToast?.(
                err?.message || tr("theme.customPaletteDeleteFailed", "删除失败", "Delete failed"),
                "error"
              );
            }
          });

          chip.appendChild(thumb);
          chip.appendChild(nameSpan);
          chip.appendChild(delBtn);
          customWallpapersRow.appendChild(chip);
        });
      }
    }
  };

  const syncLanguageButtons = (lang) => {
    currentLang = lang === "en" ? "en" : "zh-CN";
    if (!languageSelector) return;
    languageSelector.querySelectorAll("[data-lang]").forEach((btn) => {
      const isCurrent = btn.getAttribute("data-lang") === currentLang;
      btn.classList.toggle("is-active", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
    });
  };

  // Initial mount
  renderColorGrid();
  renderPaletteChips();
  renderWallpaperThumbs();
  syncSlidersAndFitUi();
  applyTheme();

  // Save custom palette
  const handleSaveCustomPalette = async () => {
    const rawName = customPaletteNameInput ? customPaletteNameInput.value.trim() : "";
    if (!rawName) {
      onToast?.(
        tr("theme.customPaletteNameRequired", "请先输入自定义方案名称", "Please enter a palette name first"),
        "error"
      );
      customPaletteNameInput?.focus();
      return;
    }
    const res = await persistTheme({ saveAsNewPaletteName: rawName });
    if (res && customPaletteNameInput) {
      customPaletteNameInput.value = "";
      onToast?.(
        tr("theme.customPaletteSaved", "已保存自定义配色方案：{name}", "Saved custom palette: {name}", {
          name: rawName,
        }),
        "success"
      );
    }
  };

  if (customPaletteSaveBtn) {
    const onSaveClick = () => handleSaveCustomPalette();
    customPaletteSaveBtn.addEventListener("click", onSaveClick);
    cleanups.push(() => customPaletteSaveBtn.removeEventListener("click", onSaveClick));
  }

  if (customPaletteNameInput) {
    const onInputKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveCustomPalette();
      }
    };
    customPaletteNameInput.addEventListener("keydown", onInputKey);
    cleanups.push(() => customPaletteNameInput.removeEventListener("keydown", onInputKey));
  }

  // Follow host light/dark toggle (read-only; never writes host config)
  if (syncGlobalBtn) {
    const onSyncClick = async () => {
      mutationSeq += 1;
      state.syncGlobal = !state.syncGlobal;
      applyTheme();
      const res = await persistTheme({ silent: true });
      if (res && !destroyed) {
        onToast?.(
          state.syncGlobal
            ? tr("theme.boundarySynced", "仅监听宿主明暗", "Follows Host Light/Dark")
            : tr("theme.boundaryUnsynced", "完全独立配色", "Independent Palette"),
          "info"
        );
      }
    };
    syncGlobalBtn.addEventListener("click", onSyncClick);
    cleanups.push(() => syncGlobalBtn.removeEventListener("click", onSyncClick));
  }

  // Reset default (restores user's pinned default 美化 configuration)
  if (resetBtn) {
    const onResetClick = async () => {
      mutationSeq += 1;
      state.activePaletteId = "default";
      state.colors = { ...BUILTIN_PALETTES[0].colors };
      state.syncGlobal = true;
      state.backdropEnabled = true;
      state.hostThemeMode = "inject";
      state.hostBlendPct = 25;
      state.activeWallpaperId = "wp-1";
      state.opacity = 100;
      state.blur = 0;
      state.dim = 0;
      state.radius = 10;
      state.fit = "cover";
      syncColorPickers();
      syncSlidersAndFitUi();
      renderPaletteChips();
      renderWallpaperThumbs();
      applyTheme();
      await persistTheme();
    };
    resetBtn.addEventListener("click", onResetClick);
    cleanups.push(() => resetBtn.removeEventListener("click", onResetClick));
  }

  // Random anime wallpaper
  if (wallpaperRandomBtn) {
    const onRandomClick = () => {
      mutationSeq += 1;
      const candidates = BUILTIN_WALLPAPERS.filter((w) => w.id !== state.activeWallpaperId);
      const picked =
        candidates[Math.floor(Math.random() * candidates.length)] || BUILTIN_WALLPAPERS[0];
      state.activeWallpaperId = picked.id;
      renderWallpaperThumbs();
      applyTheme();
      persistTheme({ silent: true });
    };
    wallpaperRandomBtn.addEventListener("click", onRandomClick);
    cleanups.push(() => wallpaperRandomBtn.removeEventListener("click", onRandomClick));
  }

  // Upload custom raster wallpaper
  if (wallpaperUploadBtn && wallpaperFileInput) {
    const onUploadBtnClick = () => wallpaperFileInput.click();
    wallpaperUploadBtn.addEventListener("click", onUploadBtnClick);
    cleanups.push(() => wallpaperUploadBtn.removeEventListener("click", onUploadBtnClick));

    const onFileChange = () => {
      const file = wallpaperFileInput.files && wallpaperFileInput.files[0];
      if (!file) return;

      const resolvedMime = resolveUploadImageMime(file);
      if (!resolvedMime) {
        onToast?.(
          tr(
            "theme.wallpaperSvgBlocked",
            "安全限制：禁止上传 SVG 图片，仅支持 PNG/JPEG/WEBP/GIF 位图",
            "Security rule: SVG uploads are blocked; use PNG, JPEG, WEBP, or GIF"
          ),
          "error"
        );
        wallpaperFileInput.value = "";
        return;
      }
      if (file.size > MAX_WALLPAPER_BYTES) {
        onToast?.(
          tr("theme.uploadTooLarge", "壁纸图片请勿超过 8 MB", "Wallpaper image must be <= 8 MB"),
          "error"
        );
        wallpaperFileInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        if (!destroyed) {
          onToast?.(
            tr("theme.wallpaperUploadFailed", "上传壁纸失败", "Failed to upload wallpaper"),
            "error"
          );
        }
        wallpaperFileInput.value = "";
      };
      reader.onload = async () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        const commaIdx = dataUrl.indexOf(",");
        const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : "";
        if (!base64) {
          if (!destroyed) {
            onToast?.(
              tr("theme.wallpaperUploadFailed", "上传壁纸失败", "Failed to upload wallpaper"),
              "error"
            );
          }
          wallpaperFileInput.value = "";
          return;
        }
        const cleanName = file.name.replace(/\.[^.]+$/, "") || "Wallpaper";
        mutationSeq += 1;
        try {
          const optimized = await optimizeWallpaperUpload({
            dataUrl,
            base64,
            mime: resolvedMime,
          });
          if (destroyed) return;
          const thumb = await generateThumbnail(optimized.dataUrl || dataUrl);
          if (destroyed) return;
          const uploadPayload = {
            name: cleanName,
            mime: optimized.mime,
            base64: optimized.base64,
          };
          if (thumb) {
            uploadPayload.thumbBase64 = thumb.base64;
            uploadPayload.thumbMime = thumb.mime;
          }
          const res = await postJson(apiFetch, "/api/theme/wallpaper/upload", uploadPayload);
          if (destroyed) return;
          if (res.themeState) {
            hydrateThemeState(res.themeState);
          } else if (res.wallpaper) {
            state.customWallpapers.push(res.wallpaper);
            state.activeWallpaperId = res.wallpaper.id;
          }
          renderWallpaperThumbs();
          applyTheme();
          renderBackdropCompanion();
          onToast?.(
            tr(
              "theme.wallpaperUploaded",
              "已上传并应用自定义壁纸：{name}",
              "Uploaded and applied wallpaper: {name}",
              { name: cleanName }
            ),
            "success"
          );
        } catch (err) {
          if (destroyed) return;
          onToast?.(
            err?.message ||
              tr("theme.wallpaperUploadFailed", "上传壁纸失败", "Failed to upload wallpaper"),
            "error"
          );
        } finally {
          wallpaperFileInput.value = "";
        }
      };
      reader.readAsDataURL(file);
    };
    wallpaperFileInput.addEventListener("change", onFileChange);
    cleanups.push(() => wallpaperFileInput.removeEventListener("change", onFileChange));
  }

  // Clear wallpaper
  if (wallpaperClearBtn) {
    const onClearClick = () => {
      mutationSeq += 1;
      state.activeWallpaperId = null;
      renderWallpaperThumbs();
      applyTheme();
      persistTheme({ silent: true });
    };
    wallpaperClearBtn.addEventListener("click", onClearClick);
    cleanups.push(() => wallpaperClearBtn.removeEventListener("click", onClearClick));
  }

  // Sliders
  const bindSlider = (inputEl, valEl, prop, unit) => {
    if (!inputEl) return;
    const onInput = () => {
      mutationSeq += 1;
      markDraggingTheme();
      state[prop] = Number(inputEl.value);
      if (valEl) valEl.textContent = `${state[prop]}${unit}`;
      applyTheme();
      schedulePersistTheme();
    };
    const onChange = () => {
      mutationSeq += 1;
      state[prop] = Number(inputEl.value);
      if (valEl) valEl.textContent = `${state[prop]}${unit}`;
      applyTheme();
      schedulePersistTheme();
    };
    inputEl.addEventListener("input", onInput);
    inputEl.addEventListener("change", onChange);
    cleanups.push(() => inputEl.removeEventListener("input", onInput));
    cleanups.push(() => inputEl.removeEventListener("change", onChange));
  };

  bindSlider(opacityInput, opacityVal, "opacity", "%");
  bindSlider(blurInput, blurVal, "blur", "px");
  bindSlider(dimInput, dimVal, "dim", "%");
  bindSlider(radiusInput, radiusVal, "radius", "px");

  if (backdropBlendInput) {
    const onBlendInput = () => {
      mutationSeq += 1;
      markDraggingTheme();
      state.hostBlendPct = Math.min(42, Math.max(5, Number(backdropBlendInput.value)));
      if (backdropBlendVal) backdropBlendVal.textContent = `${state.hostBlendPct}%`;
      applyTheme();
      schedulePersistTheme();
    };
    backdropBlendInput.addEventListener("input", onBlendInput);
    backdropBlendInput.addEventListener("change", onBlendInput);
    cleanups.push(() => backdropBlendInput.removeEventListener("input", onBlendInput));
    cleanups.push(() => backdropBlendInput.removeEventListener("change", onBlendInput));
  }

  const refreshBackdropStatus = async () => {
    if (destroyed || backdropStatusInFlight) return;
    backdropStatusInFlight = true;
    try {
      const res = await fetchViaSidecar(apiFetch, "/api/theme/backdrop/status");
      if (destroyed) return;
      if (res?.status) {
        const sharedKeyOf = (bdObj) =>
          `${Boolean(bdObj?.running && !bdObj?.paused)}|${Boolean(bdObj?.cdp?.styleApplied)}|${Boolean(bdObj?.cdp?.connected)}|${Boolean(bdObj?.nativeHud?.heartbeat?.wallpaperAlive)}`;
        const prevKey = sharedKeyOf(state.backdropStatus);
        state.backdropStatus = res.status;
        const nextKey = sharedKeyOf(state.backdropStatus);
        renderBackdropCompanion();
        if (prevKey !== nextKey) {
          applyTheme();
        }
      }
    } catch {
      // Ignore transient status fetch failure
    } finally {
      backdropStatusInFlight = false;
    }
  };

  if (backdropToggleBtn) {
    const onBackdropToggle = async () => {
      mutationSeq += 1;
      state.backdropEnabled = !state.backdropEnabled;
      applyTheme();
      renderBackdropCompanion();
      try {
        const res = await postJson(apiFetch, "/api/theme/backdrop/action", {
          action: state.backdropEnabled ? "start" : "stop",
          backdropEnabled: state.backdropEnabled,
          hostBlendPct: state.hostBlendPct,
        });
        if (destroyed) return;
        if (res?.themeState) hydrateThemeState(res.themeState);
        if (res?.status) state.backdropStatus = res.status;
        applyTheme();
        renderBackdropCompanion();
        scheduleTrackedTimeout(() => void refreshBackdropStatus(), 180);
        onToast?.(
          state.backdropEnabled
            ? tr("backdrop.enabledToast", "已开启整机贴背壁纸模式", "Desktop backdrop companion enabled")
            : tr("backdrop.disabledToast", "已关闭整机贴背壁纸，Antigravity 恢复不透明", "Desktop backdrop disabled; Antigravity restored opaque"),
          "info"
        );
      } catch (err) {
        if (destroyed) return;
        state.backdropEnabled = !state.backdropEnabled;
        applyTheme();
        renderBackdropCompanion();
        onToast?.(err?.message || "操作失败", "error");
      }
    };
    backdropToggleBtn.addEventListener("click", onBackdropToggle);
    cleanups.push(() => backdropToggleBtn.removeEventListener("click", onBackdropToggle));
  }

  hostModeBtns.forEach((btn) => {
    const onModeClick = async () => {
      const rawMode = btn.getAttribute("data-host-mode");
      const nextMode = rawMode === "cdp" || rawMode === "backdrop" ? rawMode : "inject";
      if (nextMode === state.hostThemeMode) return;
      mutationSeq += 1;
      const prevMode = state.hostThemeMode;
      state.hostThemeMode = nextMode;
      applyTheme();
      renderBackdropCompanion();
      try {
        const res = await postJson(apiFetch, "/api/theme/backdrop/action", {
          action: nextMode === "inject" ? "inject_sync" : nextMode === "cdp" ? "cdp_sync" : "sync",
          backdropEnabled: state.backdropEnabled,
          hostThemeMode: nextMode,
          cdpPort: state.cdpPort,
          hostBlendPct: state.hostBlendPct,
        });
        if (destroyed) return;
        if (res?.themeState) hydrateThemeState(res.themeState);
        if (res?.status) state.backdropStatus = res.status;
        applyTheme();
        renderBackdropCompanion();
        scheduleTrackedTimeout(() => void refreshBackdropStatus(), 200);
        onToast?.(
          nextMode === "inject"
            ? tr("backdrop.modeSwitchedInject", "已切换到方案三（持久纯 CSS 注入，免快捷方式且文字 100% 锐利）", "Switched to Mode 3 (Persistent Pure-CSS Injection; 100% crisp text)")
            : nextMode === "cdp"
              ? tr("backdrop.modeSwitchedCdp", "已切换到方案二（CDP 高清纯 CSS，主窗文字已恢复 100% 实心）", "Switched to Mode 2 (CDP Crisp CSS; host opacity restored 100%)")
              : tr("backdrop.modeSwitchedBackdrop", "已切回方案一（贴背微透窗）", "Switched to Mode 1 (Backdrop Window)"),
          "info"
        );
      } catch (err) {
        if (destroyed) return;
        state.hostThemeMode = prevMode;
        applyTheme();
        renderBackdropCompanion();
        onToast?.(err?.message || "切换方案失败", "error");
      }
    };
    btn.addEventListener("click", onModeClick);
    cleanups.push(() => btn.removeEventListener("click", onModeClick));
  });

  if (copyBackdropCmdBtn) {
    const onCopyCmd = async () => {
      const isCdp = state.hostThemeMode === "cdp";
      const cmd = isCdp
        ? (state.backdropStatus?.cdp?.launchCommand || "")
        : (state.backdropStatus?.quickLaunchCommand || "");
      if (!cmd) return;
      let copied = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(cmd);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (!copied && backdropCmdInput && typeof backdropCmdInput.select === "function") {
        try {
          backdropCmdInput.hidden = false;
          backdropCmdInput.focus();
          backdropCmdInput.select();
          copied = Boolean(typeof document.execCommand === "function" && document.execCommand("copy"));
        } catch {
          copied = false;
        }
      }
      onToast?.(
        copied
          ? (isCdp
              ? tr("backdrop.cdpCmdCopied", "已复制 CDP 启动命令：完全退出 Antigravity 后按 Win+R 粘贴运行即可", "CDP command copied: fully quit Antigravity, then paste in Win+R")
              : tr("backdrop.cmdCopied", "已复制启动命令：按 Win+R 粘贴运行即可启动", "Launch command copied: press Win+R, paste & run"))
          : tr("backdrop.cmdCopyFailed", "复制失败，请手工运行：{cmd}", "Copy failed; run manually: {cmd}", { cmd }),
        copied ? "success" : "info"
      );
    };
    copyBackdropCmdBtn.addEventListener("click", onCopyCmd);
    cleanups.push(() => copyBackdropCmdBtn.removeEventListener("click", onCopyCmd));
  }

  const runNativeHudAction = async (payload, successMsg) => {
    try {
      const res = await postJson(apiFetch, "/api/hud/native/action", payload);
      if (destroyed) return;
      if (res?.themeState) hydrateThemeState(res.themeState);
      state.backdropStatus = {
        ...(state.backdropStatus || {}),
        ...(res?.cdp ? { cdp: res.cdp } : {}),
        ...(res?.nativeHud ? { nativeHud: res.nativeHud } : {}),
      };
      renderBackdropCompanion();
      scheduleTrackedTimeout(() => void refreshBackdropStatus(), 220);
      if (successMsg) {
        onToast?.(successMsg, "success");
      } else if (res?.error) {
        onToast?.(res.error, res?.hotInjected ? "info" : "error");
      }
    } catch (err) {
      if (!destroyed) {
        onToast?.(err?.message || "操作失败", "error");
      }
    }
  };

  if (nativeHudEnableBtn) {
    const onHudEnable = () => {
      mutationSeq += 1;
      state.hudEnabled = !(state.hudEnabled !== false);
      renderBackdropCompanion();
      void runNativeHudAction(
        { action: "config", hudEnabled: state.hudEnabled },
        state.hudEnabled ? tr("nativeHud.toastModeSwitched", "已开启输入框状态栏", "HUD enabled") : tr("nativeHud.statusOff", "已关闭输入框状态栏", "HUD disabled")
      );
    };
    nativeHudEnableBtn.addEventListener("click", onHudEnable);
    cleanups.push(() => nativeHudEnableBtn.removeEventListener("click", onHudEnable));
  }

  nativeHudModeBtns.forEach((btn) => {
    const onHudModeClick = () => {
      const nextMode = btn.getAttribute("data-hud-mode");
      if (!nextMode || nextMode === state.hudInjectionMode) return;
      mutationSeq += 1;
      state.hudInjectionMode = nextMode;
      renderBackdropCompanion();
      void runNativeHudAction(
        { action: "config", hudInjectionMode: nextMode, hudEnabled: state.hudEnabled },
        tr("nativeHud.toastModeSwitched", "状态栏挂载方式已更新", "HUD mount mode updated")
      );
    };
    btn.addEventListener("click", onHudModeClick);
    cleanups.push(() => btn.removeEventListener("click", onHudModeClick));
  });

  if (nativeHudAutoReinjectBtn) {
    const onAutoReinject = () => {
      mutationSeq += 1;
      state.hudAutoReinject = !(state.hudAutoReinject !== false);
      renderBackdropCompanion();
      void runNativeHudAction(
        { action: "config", hudAutoReinject: state.hudAutoReinject },
        state.hudAutoReinject ? "已开启失效自动补注" : "已关闭失效自动补注"
      );
    };
    nativeHudAutoReinjectBtn.addEventListener("click", onAutoReinject);
    cleanups.push(() => nativeHudAutoReinjectBtn.removeEventListener("click", onAutoReinject));
  }

  if (nativeHudInstallBtn) {
    const onInstallClick = async () => {
      nativeHudInstallBtn.disabled = true;
      try {
        const res = await postJson(apiFetch, "/api/hud/native/action", {
          action: state.hudInjectionMode === "cdp" ? "hot_inject" : "install",
          hudInjectionMode: state.hudInjectionMode === "uia" ? "asar" : state.hudInjectionMode,
          hudEnabled: true,
        });
        if (destroyed) return;
        if (res?.themeState) hydrateThemeState(res.themeState);
        state.backdropStatus = {
          ...(state.backdropStatus || {}),
          ...(res?.cdp ? { cdp: res.cdp } : {}),
          ...(res?.nativeHud ? { nativeHud: res.nativeHud } : {}),
        };
        renderBackdropCompanion();
        if (res?.hotInjected || res?.nativeHud?.heartbeat?.alive) {
          onToast?.(tr("nativeHud.toastInstalled", "原生 DOM 状态栏已注入并生效", "Native DOM HUD injected and active"), "success");
        } else if (res?.queuedForExit) {
          onToast?.(
            tr(
              "nativeHud.toastQueuedExit",
              "已备好新版补丁，关闭并重启 Antigravity 后自动生效",
              "Patch staged; close and reopen Antigravity to apply automatically"
            ),
            "success"
          );
        } else if (res?.diskWritten) {
          onToast?.(tr("nativeHud.toastInstalledPending", "已写入 app.asar 持久化，重启 Antigravity 后原生生效", "Written to app.asar; restart Antigravity to activate natively"), "success");
        } else if (res?.error) {
          onToast?.(res.error, "info");
        }
      } catch (err) {
        if (!destroyed) onToast?.(err?.message || "注入失败", "error");
      } finally {
        if (!destroyed) renderBackdropCompanion();
      }
    };
    nativeHudInstallBtn.addEventListener("click", onInstallClick);
    cleanups.push(() => nativeHudInstallBtn.removeEventListener("click", onInstallClick));
  }

  if (nativeHudRestoreBtn) {
    const onRestoreClick = async () => {
      nativeHudRestoreBtn.disabled = true;
      try {
        const res = await postJson(apiFetch, "/api/hud/native/action", { action: "restore" });
        if (destroyed) return;
        if (res?.themeState) hydrateThemeState(res.themeState);
        state.backdropStatus = {
          ...(state.backdropStatus || {}),
          ...(res?.cdp ? { cdp: res.cdp } : {}),
          ...(res?.nativeHud ? { nativeHud: res.nativeHud } : {}),
        };
        renderBackdropCompanion();
        onToast?.(
          res?.error ||
            (res?.queuedForExit
              ? tr(
                  "nativeHud.toastRestoreQueued",
                  "已备好原版文件，关闭 Antigravity 后将自动完成还原",
                  "Stock app.asar staged; close Antigravity to finish restoring"
                )
              : tr("nativeHud.toastRestored", "已还原官方纯净 app.asar 并卸载原生状态栏", "Restored stock app.asar and unmounted native HUD")),
          res?.ok ? "success" : "info"
        );
      } catch (err) {
        if (!destroyed) onToast?.(err?.message || "还原失败", "error");
      } finally {
        if (!destroyed) renderBackdropCompanion();
      }
    };
    nativeHudRestoreBtn.addEventListener("click", onRestoreClick);
    cleanups.push(() => nativeHudRestoreBtn.removeEventListener("click", onRestoreClick));
  }

  let backdropPollTicks = 0;
  backdropPollTimer = setInterval(() => {
    if (destroyed) return;
    if (document.visibilityState === "hidden") return;
    if (typeof window !== "undefined" && (window.innerWidth === 0 || window.innerHeight === 0)) return;
    backdropPollTicks += 1;
    const themePanel = document.getElementById("panelTheme");
    const onThemeTab = Boolean(themePanel && !themePanel.hidden);
    if (onThemeTab || backdropPollTicks % 2 === 0) {
      void refreshBackdropStatus();
    }
  }, 1500);
  if (typeof backdropPollTimer?.unref === "function") {
    backdropPollTimer.unref();
  }

  // Fit mode buttons
  fitBtns.forEach((btn) => {
    const onFitClick = () => {
      mutationSeq += 1;
      state.fit = btn.getAttribute("data-wp-fit") || "cover";
      syncSlidersAndFitUi();
      applyTheme();
      persistTheme({ silent: true });
    };
    btn.addEventListener("click", onFitClick);
    cleanups.push(() => btn.removeEventListener("click", onFitClick));
  });

  // Language selector (controls Antigravity host UI via CDP; AGY Console stays fixed in zh-CN)
  if (languageSelector) {
    languageSelector.querySelectorAll("[data-lang]").forEach((btn) => {
      const onLangClick = async () => {
        const nextLang = btn.getAttribute("data-lang");
        if (!nextLang || nextLang === currentLang) return;
        const prevLang = currentLang;
        syncLanguageButtons(nextLang);
        onLanguageChange?.(nextLang);
        const langLabel = nextLang === "en" ? "English" : "简体中文";
        try {
          const res = await postJson(apiFetch, "/api/language", { language: nextLang });
          if (destroyed) return;
          if (res?.cdp) {
            state.backdropStatus = {
              ...(state.backdropStatus || {}),
              cdp: res.cdp,
            };
            renderBackdropCompanion();
          }
          if (res?.cdp?.connected || res?.nativeHud?.hookAlive || res?.nativeHud?.alive) {
            onToast?.(
              tr("theme.languageSaved", "已切换 Antigravity 宿主界面为：{lang}", "Switched Antigravity host UI language to: {lang}", {
                lang: langLabel,
              }),
              "success"
            );
          } else {
            onToast?.(
              tr(
                "theme.languageSavedWaitCdp",
                "已保存主窗口语言为「{lang}」（启用原生注入或 CDP 后自动生效）",
                "Saved host language \"{lang}\" (auto-applies with native injection or CDP)",
                { lang: langLabel }
              ),
              "info"
            );
          }
        } catch (err) {
          if (destroyed) return;
          syncLanguageButtons(prevLang);
          onLanguageChange?.(prevLang);
          onToast?.(
            err?.message ||
              tr("theme.languageSaveFailed", "保存语言设置失败", "Failed to save language preference"),
            "error"
          );
        }
      };
      btn.addEventListener("click", onLangClick);
      cleanups.push(() => btn.removeEventListener("click", onLangClick));
    });
  }

  return {
    update(prefs) {
      if (destroyed) return;
      if (prefs?.language) {
        syncLanguageButtons(prefs.language);
      }
      if (prefs?.backdropStatus) {
        state.backdropStatus = prefs.backdropStatus;
      }
      if (prefs?.themeState && !persistInFlight && saveTimer === null) {
        hydrateThemeState(prefs.themeState);
        renderPaletteChips();
        syncColorPickers();
        syncSlidersAndFitUi();
        renderWallpaperThumbs();
        applyTheme();
      }
      renderBackdropCompanion();
    },
    refreshBackdropStatus,
    applyHostTheme(cssVariables) {
      if (cssVariables && typeof cssVariables === "object") {
        const bg =
          cssVariables["--background"] ||
          cssVariables["--vscode-editor-background"] ||
          cssVariables["--bg-canvas"];
        if (typeof bg === "string" && parseCssColor(bg)) {
          state.hostIsLight = isLightColor(bg);
        }
      }
      applyTheme();
    },
    applyThemeState(themeState) {
      hydrateThemeState(themeState);
      renderPaletteChips();
      syncColorPickers();
      syncSlidersAndFitUi();
      renderWallpaperThumbs();
      applyTheme();
    },
    setLanguage(lang) {
      syncLanguageButtons(lang);
      renderPaletteChips();
      syncColorPickers();
      renderWallpaperThumbs();
      applyTheme();
    },
    setTranslator(nextT) {
      translator = nextT;
      if (typeof nextT?.getLang === "function") {
        syncLanguageButtons(nextT.getLang());
      }
      renderPaletteChips();
      syncColorPickers();
      renderWallpaperThumbs();
      applyTheme();
      renderBackdropCompanion();
    },
    destroy() {
      destroyed = true;
      clearTimeout(saveTimer);
      clearTimeout(dragClassTimer);
      clearTimeout(statusTimer);
      clearInterval(backdropPollTimer);
      trackedTimers.forEach((id) => clearTimeout(id));
      trackedTimers.clear();
      if (typeof document !== "undefined") {
        document.documentElement?.classList?.remove("is-dragging-theme");
      }
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    },
  };
}
