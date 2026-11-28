/**
 * Official Antigravity PreInvocation lifecycle hook for AGY Console "掌握 (Mastery)" tab.
 *
 * - Default OFF: when mastery_config.json is missing, disabled, or using thirdparty mode,
 *   returns `{}` immediately (<10ms, zero injection, zero token overhead).
 * - `/compact` (on-demand context compaction) is skipped entirely: it is a host maintenance
 *   invocation, not a user task, so it must not receive the progress prompt nor overwrite state.
 * - When enabled with `source === "self"`:
 *   1) At the start of a new user task (first invocation for a given lastUserInput), appends
 *      a concise tail systemMessage instructing the running Agent to emit a ~30-char kid-friendly
 *      opening thought + `[AGY_PROGRESS|10%|...]` before its tool calls (same turn, no stopping).
 *   2) Thereafter, only when `now - lastPromptAtMs >= frequencyMs` (30s / 1m / 3m / 5m), appends
 *      a minimal tail systemMessage asking for `[AGY_PROGRESS|<0-100>%|<10字以内通俗总结>]`
 *      alongside its next tool call. Because messages are appended strictly at the tail and never
 *      mutate history prefix, Prompt Cache hit rate stays ~99%+.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FREQ_MS = {
  '30s': 30_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
};

function readStdinUtf8() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomicSync(filePath, obj) {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
    let renamed = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.renameSync(tmp, filePath);
        renamed = true;
        break;
      } catch (err) {
        if (attempt === 4 || (err?.code !== 'EPERM' && err?.code !== 'EBUSY' && err?.code !== 'EACCES')) {
          break;
        }
        const until = Date.now() + 12 * (attempt + 1);
        while (Date.now() < until) {
          // Short bounded backoff for Windows atomic rename contention
        }
      }
    }
    if (!renamed) {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // ignore cleanup failure
      }
    }
  } catch {
    // Non-fatal state write failure
  }
}

function inferAppDataFromExecDir(rawDir) {
  if (!rawDir || !String(rawDir).trim()) return '';
  let cursor = path.resolve(String(rawDir).trim());
  while (cursor && cursor !== path.dirname(cursor)) {
    if (path.basename(cursor) === 'sidecar_data') {
      return path.dirname(cursor);
    }
    cursor = path.dirname(cursor);
  }
  return '';
}

function resolvePluginDataDirs(explicitDir) {
  if (explicitDir && String(explicitDir).trim()) {
    return [path.resolve(String(explicitDir).trim())];
  }
  const dirs = [];
  const addDir = (raw) => {
    if (!raw || !String(raw).trim()) return;
    const resolved = path.resolve(String(raw).trim());
    if (!dirs.some((d) => d.toLowerCase() === resolved.toLowerCase())) {
      dirs.push(resolved);
    }
  };
  addDir(process.env.AGY_MONITOR_PLUGIN_DATA_DIR);
  addDir(process.env.PLUGIN_DATA);
  const inferredExecAppData = inferAppDataFromExecDir(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR);
  if (inferredExecAppData) {
    addDir(path.join(inferredExecAppData, 'plugin_data', 'agy-monitor'));
  }
  const appData =
    process.env.AGY_MONITOR_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
  addDir(path.join(path.resolve(appData), 'plugin_data', 'agy-monitor'));
  return dirs;
}

function safeConvStateFile(activeDataDir, convId) {
  const safe = String(convId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) || 'default';
  return path.join(activeDataDir, 'hook_state', `${safe}.json`);
}

function readConvHookState(activeDataDir, convId) {
  const perConvPath = safeConvStateFile(activeDataDir, convId);
  const perConv = readJsonSafe(perConvPath);
  if (perConv && typeof perConv === 'object') {
    return { prev: perConv, perConvPath };
  }
  // One-time read-only migration fallback from legacy monolithic mastery_hook_state.json
  const legacyPath = path.join(activeDataDir, 'mastery_hook_state.json');
  const legacy = readJsonSafe(legacyPath);
  const legacyEntry =
    legacy?.convs && typeof legacy.convs === 'object' && legacy.convs[convId] && typeof legacy.convs[convId] === 'object'
      ? legacy.convs[convId]
      : null;
  return { prev: legacyEntry, perConvPath };
}

function pruneOldConvStates(stateDir, keepBasename, nowMs) {
  try {
    const cutoff = nowMs - 7 * 24 * 3600 * 1000;
    const files = fs.readdirSync(stateDir);
    if (files.length <= 24) return;
    for (const name of files) {
      if (name === keepBasename || !name.endsWith('.json')) continue;
      const full = path.join(stateDir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs < cutoff) {
          fs.rmSync(full, { force: true });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function readLatestMasteryConfig(candidateDirs) {
  let bestCfg = null;
  let bestMtime = -1;
  let bestDir = candidateDirs[0];

  for (const dir of candidateDirs) {
    const cfgPath = path.join(dir, 'mastery_config.json');
    try {
      const st = fs.statSync(cfgPath);
      if (!st.isFile()) continue;
      const parsed = readJsonSafe(cfgPath);
      if (parsed && typeof parsed === 'object' && st.mtimeMs >= bestMtime) {
        bestCfg = parsed;
        bestMtime = st.mtimeMs;
        bestDir = dir;
      }
    } catch {
      // Candidate does not exist or unreadable; keep probing
    }
  }
  return { rawCfg: bestCfg, activeDataDir: bestDir };
}

function hashText(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '';
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

/**
 * `/compact` (optionally followed by instructions) is the host's on-demand context
 * compaction command. It triggers an extra model invocation whose only job is to
 * summarize the conversation, so it is not a new user task and must never receive
 * the mastery progress prompt.
 */
const COMPACTION_COMMAND_RE = /^\/compact(?:\s|$)/i;

function isCompactionInvocation(rawUserInput) {
  return typeof rawUserInput === 'string' && COMPACTION_COMMAND_RE.test(rawUserInput.trim());
}

export function evaluateMasteryHook(payload, { pluginDataDir, nowMs = Date.now() } = {}) {
  const candidateDirs = resolvePluginDataDirs(pluginDataDir);
  const { rawCfg, activeDataDir } = readLatestMasteryConfig(candidateDirs);

  const convId =
    typeof payload?.conversationId === 'string' && payload.conversationId.trim()
      ? payload.conversationId.trim()
      : 'default';

  const lastUserInput = typeof payload?.lastUserInput === 'string' ? payload.lastUserInput : '';

  // Context compaction is a host maintenance invocation, not a user task: injecting the
  // opening/periodic progress instruction here would be folded into the compaction prompt,
  // pollute the generated summary and waste tokens. Skip it without touching conversation state.
  if (isCompactionInvocation(lastUserInput)) {
    return {};
  }

  const cfg =
    rawCfg && typeof rawCfg === 'object'
      ? rawCfg
      : { enabled: false, source: 'self', frequency: '1m', thinking: 'low' };

  const { prev: existingPrev, perConvPath } = readConvHookState(activeDataDir, convId);

  if (cfg.enabled !== true || cfg.source !== 'self') {
    // If this ongoing conversation previously received [AGY_PROGRESS] prompts, emit a single
    // one-shot stop notice so the LLM immediately breaks few-shot format inertia; new conversations
    // or subsequent turns return `{}` with zero overhead.
    if (existingPrev && existingPrev.introSent === true && existingPrev.stopNoticeSent !== true) {
      writeJsonAtomicSync(perConvPath, {
        ...existingPrev,
        stopNoticeSent: true,
        updatedAtMs: nowMs,
      });
      return {
        injectSteps: [
          {
            systemMessage: {
              systemMessage:
                '【AGY掌握·已关闭】用户已关闭自动进度总结功能。从本轮开始请停止输出 `[AGY_PROGRESS|...|...]` 标签，也无需额外开场/阶段汇报，按正常对话直接回复即可。',
            },
          },
        ],
      };
    }
    return {};
  }

  const freqMs = FREQ_MS[cfg.frequency] || FREQ_MS['1m'];
  const invocationNum = Number(payload?.invocationNum || 0);
  const inputHash = hashText(lastUserInput);
  const prev = existingPrev || {};

  const isNewUserTask =
    (inputHash && inputHash !== prev.lastInputHash) ||
    (!prev.introSent && invocationNum <= 1) ||
    prev.stopNoticeSent === true;

  let instruction = '';
  let nextConvState = null;
  if (isNewUserTask) {
    instruction =
      '【AGY掌握·开场汇报】在你开始调用工具执行命令前，请先在回复最开头单独输出1行**纯简体中文**：' +
      '`[AGY_PROGRESS|10%|<10字以内纯中文、五岁孩童能懂的状态>]`，然后**必须在标签后空一行（双换行）**再写约30字纯中文大白话汇报正文，' +
      '说明你对用户任务的理解以及接下来第一步打算做什么（严禁使用英文句子）；然后**本轮立刻继续调用工具，不要停下来等用户**。';
    nextConvState = {
      lastInputHash: inputHash || prev.lastInputHash || '',
      introSent: true,
      stopNoticeSent: false,
      lastPromptAtMs: nowMs,
      updatedAtMs: nowMs,
    };
  } else {
    const elapsed = nowMs - Number(prev.lastPromptAtMs || 0);
    if (elapsed >= freqMs) {
      instruction =
        '【AGY掌握·阶段总结】请在本次继续调工具前顺带单独输出1行**纯简体中文**：' +
        '`[AGY_PROGRESS|<0-100整数>%|<10字以内纯中文、给五岁孩童都能看懂的当前进度总结>]`' +
        '（例如 `[AGY_PROGRESS|60%|修好报错准备复测]`）；如需附1句简短中文进展，**必须在标签后空一行（双换行）**与汇报正文分隔开（严禁使用英文句子）；' +
        '**同一步直接继续调用工具，不要停顿等用户**。';
      nextConvState = {
        lastInputHash: inputHash || prev.lastInputHash || '',
        introSent: true,
        stopNoticeSent: false,
        lastPromptAtMs: nowMs,
        updatedAtMs: nowMs,
      };
    }
  }

  if (!instruction) {
    return {};
  }

  writeJsonAtomicSync(perConvPath, nextConvState);
  pruneOldConvStates(path.dirname(perConvPath), path.basename(perConvPath), nowMs);

  return {
    injectSteps: [
      {
        systemMessage: {
          systemMessage: instruction,
        },
      },
    ],
  };
}

function main() {
  try {
    const raw = readStdinUtf8();
    const payload = raw && raw.trim() ? JSON.parse(raw) : {};
    const out = evaluateMasteryHook(payload);
    process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch {
    process.stdout.write('{}\n');
  }
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]).toLowerCase().endsWith('mastery_summary_hook.mjs');

if (isEntrypoint) {
  main();
}
