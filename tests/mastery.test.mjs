import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { evaluateMasteryHook } from '../hooks/mastery_summary_hook.mjs';
import {
  COMPACT_TRANSCRIPT_TAIL_BYTES,
  buildMasterySnapshot,
  classifyToolCall,
  openLocalPathTarget,
  parseAgentJourney,
  parseProgressTag,
  pruneCompactProgressCache,
  queryCompactSessionProgress,
  resolveLocalTargetPath,
  sanitizeTimelineMarkdown,
  stripMarkdownForPlainLine,
} from '../sidecars/agy_monitor/backend/mastery.mjs';
import { createHudTelemetryPublisher } from '../sidecars/agy_monitor/main.mjs';
import { resolvePaths } from '../sidecars/agy_monitor/backend/paths.mjs';
import { createStorage } from '../sidecars/agy_monitor/backend/storage.mjs';

function makeTempEnv(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-mastery-test-'));
  const paths = resolvePaths({
    appDataDir: path.join(root, 'appData'),
    geminiConfigDir: path.join(root, 'config'),
    pluginDataDir: path.join(root, 'pluginData'),
    sidecarDataDir: path.join(root, 'sidecarData'),
    brainDir: path.join(root, 'brain'),
  });
  const storage = createStorage(paths);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, paths, storage };
}

test('PreInvocation mastery_summary_hook respects default-off, PLUGIN_DATA fallback, one-shot stop notice, opening 30-char prompt, and frequency throttling', async (t) => {
  const { root, paths, storage } = makeTempEnv(t);

  // 0. Missing mastery_config.json -> Default OFF & zero injection
  const outMissing = evaluateMasteryHook(
    { conversationId: 'conv-0', invocationNum: 1, lastUserInput: '你好' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 900_000 },
  );
  assert.deepEqual(outMissing, {});

  // 1. Seeded default config -> Default OFF, self mode preset ready
  const cfgDefault = await storage.getMasteryConfig();
  assert.equal(cfgDefault.enabled, false);
  assert.equal(cfgDefault.source, 'self');
  assert.equal(cfgDefault.frequency, '1m');
  assert.equal(cfgDefault.thinking, 'low');

  const outOff = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 1, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_000_000 },
  );
  assert.deepEqual(outOff, {});

  // 2. Thirdparty mode -> zero injection into host prompt
  await storage.updateMasteryConfig({ enabled: true, source: 'thirdparty', frequency: '30s' });
  const outTp = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 1, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_000_000 },
  );
  assert.deepEqual(outTp, {});

  // 3. Self mode -> opening ~30-char prompt on new user input
  await storage.updateMasteryConfig({ enabled: true, source: 'self', frequency: '30s' });
  const outIntro = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 1, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_000_000 },
  );
  assert.equal(outIntro.injectSteps?.length, 1);
  assert.match(outIntro.injectSteps[0].systemMessage.systemMessage, /30字/);
  assert.match(outIntro.injectSteps[0].systemMessage.systemMessage, /AGY_PROGRESS\|10%/);
  assert.match(outIntro.injectSteps[0].systemMessage.systemMessage, /空一行/);

  // 4. Within frequency window (15s < 30s) -> zero injection (cache untouched)
  const outSkipped = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 2, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_015_000 },
  );
  assert.deepEqual(outSkipped, {});

  // 5. After frequency window (35s >= 30s) -> periodic <=10-char summary + % prompt
  const outPeriodic = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 3, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_035_000 },
  );
  assert.equal(outPeriodic.injectSteps?.length, 1);
  assert.match(outPeriodic.injectSteps[0].systemMessage.systemMessage, /10字以内/);
  assert.match(outPeriodic.injectSteps[0].systemMessage.systemMessage, /AGY_PROGRESS/);
  assert.match(outPeriodic.injectSteps[0].systemMessage.systemMessage, /空一行/);

  // 6. Turning OFF mid-conversation -> emits ONE-SHOT stop notice to break format inertia, then {} forever
  await storage.updateMasteryConfig({ enabled: false });
  assert.equal((await storage.getMasteryConfig()).enabled, false);
  const outStopOnce = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 4, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_080_000 },
  );
  assert.equal(outStopOnce.injectSteps?.length, 1);
  assert.match(outStopOnce.injectSteps[0].systemMessage.systemMessage, /已关闭/);
  assert.match(outStopOnce.injectSteps[0].systemMessage.systemMessage, /停止输出/);

  const outAfterStop = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 5, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_160_000 },
  );
  assert.deepEqual(outAfterStop, {});

  // New conversation while OFF -> zero stop notice, strictly {}
  const outNewConvOff = evaluateMasteryHook(
    { conversationId: 'conv-brand-new', invocationNum: 1, lastUserInput: '新任务' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_170_000 },
  );
  assert.deepEqual(outNewConvOff, {});

  // 7. Re-enabling after stop -> immediately resumes opening prompt cleanly
  await storage.updateMasteryConfig({ enabled: true, source: 'self', frequency: '30s' });
  const outResumed = evaluateMasteryHook(
    { conversationId: 'conv-1', invocationNum: 6, lastUserInput: '修一下登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 1_180_000 },
  );
  assert.equal(outResumed.injectSteps?.length, 1);
  assert.match(outResumed.injectSteps[0].systemMessage.systemMessage, /AGY_PROGRESS\|10%/);

  // 8. PLUGIN_DATA vs canonical plugin_data/agy-monitor mismatch (e.g. non-default folder install):
  //    Hook must probe both and respect the canonical config written by sidecar instead of defaulting ON.
  const prevEnv = {
    AGY_MONITOR_PLUGIN_DATA_DIR: process.env.AGY_MONITOR_PLUGIN_DATA_DIR,
    AGY_MONITOR_APP_DATA_DIR: process.env.AGY_MONITOR_APP_DATA_DIR,
    PLUGIN_DATA: process.env.PLUGIN_DATA,
  };
  try {
    const fakeAppData = path.join(root, 'mismatchAppData');
    const canonicalDir = path.join(fakeAppData, 'plugin_data', 'agy-monitor');
    const altPluginData = path.join(fakeAppData, 'plugin_data', 'agy-monitor-main');
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.mkdirSync(altPluginData, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalDir, 'mastery_config.json'),
      JSON.stringify({ enabled: true, source: 'self', frequency: '1m' }),
      'utf8',
    );
    delete process.env.AGY_MONITOR_PLUGIN_DATA_DIR;
    process.env.AGY_MONITOR_APP_DATA_DIR = fakeAppData;
    process.env.PLUGIN_DATA = altPluginData;

    const outEnabledCanonical = evaluateMasteryHook(
      { conversationId: 'conv-mismatch', invocationNum: 1, lastUserInput: '测试跨目录' },
      { nowMs: 2_000_000 },
    );
    assert.equal(outEnabledCanonical.injectSteps?.length, 1);

    // Sidecar turns OFF in canonical dir -> hook still sees OFF despite empty PLUGIN_DATA
    fs.writeFileSync(
      path.join(canonicalDir, 'mastery_config.json'),
      JSON.stringify({ enabled: false, source: 'self', frequency: '1m' }),
      'utf8',
    );
    const outDisabledStop = evaluateMasteryHook(
      { conversationId: 'conv-mismatch', invocationNum: 2, lastUserInput: '测试跨目录' },
      { nowMs: 2_070_000 },
    );
    assert.match(outDisabledStop.injectSteps?.[0]?.systemMessage?.systemMessage || '', /已关闭/);
    const outDisabledNext = evaluateMasteryHook(
      { conversationId: 'conv-mismatch', invocationNum: 3, lastUserInput: '测试跨目录' },
      { nowMs: 2_140_000 },
    );
    assert.deepEqual(outDisabledNext, {});
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('PreInvocation mastery_summary_hook skips /compact context-compaction invocations', async (t) => {
  const { paths, storage } = makeTempEnv(t);
  await storage.updateMasteryConfig({ enabled: true, source: 'self', frequency: '30s' });

  const statePath = (convId) => path.join(paths.pluginDataDir, 'hook_state', `${convId}.json`);

  // 1. /compact must not inject the opening report, and must not create hook state
  const outCompact = evaluateMasteryHook(
    { conversationId: 'conv-compact', invocationNum: 0, lastUserInput: '/compact' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_000 },
  );
  assert.deepEqual(outCompact, {});
  assert.equal(fs.existsSync(statePath('conv-compact')), false, 'compaction must not write hook state');

  // 2. Trailing instructions, surrounding whitespace and any casing are still the compaction command
  for (const [i, input] of ['  /compact 保留 API 设计  ', '/COMPACT', '/compact\n'].entries()) {
    const out = evaluateMasteryHook(
      { conversationId: 'conv-compact', invocationNum: 0, lastUserInput: input },
      { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_100 + i },
    );
    assert.deepEqual(out, {}, `expected ${JSON.stringify(input)} to be treated as compaction`);
  }
  assert.equal(fs.existsSync(statePath('conv-compact')), false, 'compaction must not write hook state');

  // 3. A normal message that merely mentions /compact is still a user task
  const outMention = evaluateMasteryHook(
    { conversationId: 'conv-compact', invocationNum: 1, lastUserInput: '解释一下 /compact 有什么用' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_300 },
  );
  assert.equal(outMention.injectSteps?.length, 1);
  assert.match(outMention.injectSteps[0].systemMessage.systemMessage, /AGY_PROGRESS\|10%/);

  // 4. Compacting an ongoing task must not rewrite the conversation state
  const conv2 = 'conv-compact-after-task';
  const first = evaluateMasteryHook(
    { conversationId: conv2, invocationNum: 0, lastUserInput: '修复登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_400 },
  );
  assert.equal(first.injectSteps?.length, 1);
  const beforeState = fs.readFileSync(statePath(conv2), 'utf8');
  const outMidTask = evaluateMasteryHook(
    { conversationId: conv2, invocationNum: 1, lastUserInput: '/compact' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_500 },
  );
  assert.deepEqual(outMidTask, {});
  assert.equal(fs.readFileSync(statePath(conv2), 'utf8'), beforeState, 'compaction must not rewrite state');

  // 5. After a compaction the next real user input still gets the opening report
  const conv3 = 'conv-compact-then-task';
  const outCompactFresh = evaluateMasteryHook(
    { conversationId: conv3, invocationNum: 0, lastUserInput: '/compact' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_600 },
  );
  assert.deepEqual(outCompactFresh, {});
  const afterCompact = evaluateMasteryHook(
    { conversationId: conv3, invocationNum: 1, lastUserInput: '继续修复登录超时' },
    { pluginDataDir: paths.pluginDataDir, nowMs: 3_000_700 },
  );
  assert.equal(afterCompact.injectSteps?.length, 1);
  assert.match(afterCompact.injectSteps[0].systemMessage.systemMessage, /AGY_PROGRESS\|10%/);
});

test('parseProgressTag, classifyToolCall, and buildMasterySnapshot align total progress with Main Agent & classify Codex actions', async (t) => {
  const { paths } = makeTempEnv(t);

  // Tag parsing + 10-char cap
  const parsed = parseProgressTag(
    '[AGY_PROGRESS|68%|修好登录掉线准备跑全量测试验证] 我已经定位到刷新令牌没有排队锁，正加锁并跑测试。',
  );
  assert.equal(parsed.percent, 68);
  assert.equal(Array.from(parsed.summary).length <= 10, true);
  assert.equal(parsed.narrative, '我已经定位到刷新令牌没有排队锁，正加锁并跑测试。');

  // Tool classifications
  assert.equal(classifyToolCall({ name: 'run_command', args: { CommandLine: 'npm test' } }).categoryLabel, '运行了命令');
  const editCls = classifyToolCall({
    name: 'edit_file',
    args: { Path: 'd:/repo/src/auth.js', Target: 'a\nb', Replacement: 'a\nb\nc\nd' },
  });
  assert.equal(editCls.categoryLabel, '编辑了文件');
  assert.equal(editCls.add, '+4');
  assert.equal(editCls.del, '-2');
  assert.equal(
    classifyToolCall({ name: 'read_file', args: { Path: 'd:/repo/src/auth.js', StartLine: 1, EndLine: 20 } }).categoryLabel,
    '读取了文件',
  );

  // Synthetic master + subagent transcript & swarm board
  const masterId = 'conv-master-001';
  const subAId = 'conv-sub-aaa';
  const subBId = 'conv-sub-bbb';

  const masterSys = path.join(paths.brainDir, masterId, '.system_generated');
  fs.mkdirSync(path.join(masterSys, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(masterSys, 'swarm'), { recursive: true });
  fs.mkdirSync(path.join(masterSys, 'subagents'), { recursive: true });

  const masterTranscript = [
    {
      step_index: 1,
      type: 'USER_INPUT',
      created_at: '2026-11-20T00:00:00Z',
      content: '<USER_REQUEST>修复登录令牌并发覆盖问题</USER_REQUEST>',
    },
    {
      step_index: 2,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-20T00:00:05Z',
      content: '[AGY_PROGRESS|15%|看懂需求查日志] 我明白了，你想修好并发刷新导致掉线的问题，我先查日志并拆任务。',
      tool_calls: [
        { name: 'read_file', args: { Path: 'd:/repo/src/auth.js', StartLine: 1, EndLine: 40 } },
        { name: 'run_command', args: { CommandLine: 'npm test' } },
      ],
    },
    {
      step_index: 3,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-20T00:01:00Z',
      content: '[AGY_PROGRESS|72%|加好排队锁复测] 并发锁已写完，正跑回归验证。',
      tool_calls: [
        { name: 'edit_file', args: { Path: 'd:/repo/src/auth.js', Target: 'old()', Replacement: 'lock();\nold();' } },
      ],
    },
  ];
  fs.writeFileSync(
    path.join(masterSys, 'logs', 'transcript.jsonl'),
    masterTranscript.map((l) => JSON.stringify(l)).join('\n') + '\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(masterSys, 'swarm', 'members.json'),
    JSON.stringify({
      title: '鉴权竞态修复',
      members: {
        coordinator: { conversation_id: masterId, role: 'coordinator', phase: 'RUNNING' },
        patcher: { conversation_id: subAId, role: 'worker', phase: 'RUNNING' },
        verifier: { conversation_id: subBId, role: 'worker', phase: 'WAITING' },
      },
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(masterSys, 'swarm', 'board.jsonl'),
    JSON.stringify({ seq: 1, agent: 'patcher', text: '@verifier 补丁落盘，等你回归' }) + '\n',
    'utf8',
  );

  // Subagent A transcript (progress 40% - different from Main Agent's 72%)
  const subASys = path.join(paths.brainDir, subAId, '.system_generated', 'logs');
  fs.mkdirSync(subASys, { recursive: true });
  fs.writeFileSync(
    path.join(subASys, 'transcript.jsonl'),
    JSON.stringify({
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      created_at: '2026-11-20T00:00:50Z',
      content: '[AGY_PROGRESS|40%|改鉴权代码中] 正在加锁。',
      tool_calls: [{ name: 'edit_file', args: { Path: 'd:/repo/src/auth.js', Target: 'x', Replacement: 'y\nz' } }],
    }) + '\n',
    'utf8',
  );

  const journey = await parseAgentJourney(paths.brainDir, masterId, {
    isMaster: true,
    isCompleted: false,
    nowMs: Date.parse('2026-11-20T00:01:20Z'),
  });
  assert.equal(journey.progress, 72);
  assert.equal(journey.shortStatus, '加好排队锁复测');
  assert.ok(journey.steps.some((s) => s.type === 'actions' && s.label.includes('读取了文件')));
  assert.ok(journey.steps.some((s) => s.type === 'actions' && s.label === '编辑了文件' && s.defaultOpen === false));
  assert.equal(
    journey.steps.filter((s) => s.type === 'actions').every((s) => s.defaultOpen === false),
    true,
  );

  const snap = await buildMasterySnapshot(
    paths,
    {
      active: [{ id: masterId, title: '修复登录令牌并发覆盖', workspace: 'agy-plugin', modifiedMs: Date.parse('2026-11-20T00:01:10Z'), agoText: '1m' }],
      waiting: [],
      unread: [],
      recent: [],
    },
    { selectedSessionId: masterId, nowMs: Date.parse('2026-11-20T00:01:20Z') },
  );

  // Total progress MUST follow Main Agent (72%), NOT averaged with SubAgent (40%)
  assert.equal(snap.sessions.length, 1);
  assert.equal(snap.sessions[0].progress, 72);
  assert.equal(snap.sessions[0].tag, '加好排队锁复测');
  assert.equal(snap.detailSession.progress, 72);
  assert.equal(snap.detailSession.master.progress, 72);
  assert.equal(snap.detailSession.subs.length, 2);
  assert.ok(snap.detailSession.edges.some((e) => e.type === 'peer'));

  // Marking a completed session/agent read flips "任务结束未读" -> "任务结束"
  const doneSnapUnread = await buildMasterySnapshot(
    paths,
    {
      active: [],
      waiting: [],
      unread: [{ id: masterId, title: '修复登录令牌并发覆盖', workspace: 'agy-plugin', modifiedMs: Date.parse('2026-11-20T00:01:10Z'), agoText: '1m' }],
      recent: [],
    },
    { selectedSessionId: masterId, sessionsMeta: { lastSeenByConv: {}, lastSeenByAgent: {} }, nowMs: Date.parse('2026-11-20T00:01:20Z') },
  );
  assert.equal(doneSnapUnread.detailSession.master.stateLabel, '任务结束未读');
  assert.equal(doneSnapUnread.sessions[0].tag, '结束未读');

  const doneSnapRead = await buildMasterySnapshot(
    paths,
    {
      active: [],
      waiting: [],
      unread: [{ id: masterId, title: '修复登录令牌并发覆盖', workspace: 'agy-plugin', modifiedMs: Date.parse('2026-11-20T00:01:10Z'), agoText: '1m' }],
      recent: [],
    },
    {
      selectedSessionId: masterId,
      sessionsMeta: {
        lastSeenByConv: { [masterId]: Date.parse('2026-11-20T00:02:00Z') },
        lastSeenByAgent: { [masterId]: Date.parse('2026-11-20T00:02:00Z'), [subAId]: Date.parse('2026-11-20T00:02:00Z') },
      },
      nowMs: Date.parse('2026-11-20T00:02:00Z'),
    },
  );
  assert.equal(doneSnapRead.detailSession.master.stateLabel, '任务结束');
  assert.equal(doneSnapRead.detailSession.master.stateKind, 'done');
  assert.equal(doneSnapRead.sessions[0].tag, '任务结束');
  assert.equal(doneSnapRead.sessions[0].status, 'done');
  assert.equal(doneSnapRead.detailSession.subs.every((sub) => sub.stateLabel === '任务结束' && sub.stateKind === 'done'), true);
});

test('mastery strips Markdown from overview cards, keeps file:/// links intact in timeline, and strips stray path quotes', async (t) => {
  const { paths } = makeTempEnv(t);

  // Stray surrounding quotes in tool path arguments should be cleaned
  const quotedRead = classifyToolCall({
    name: 'read_file',
    args: { Path: '"d:\\workspace\\agy-plugin\\sidecars\\agy_monitor\\backend\\mastery.mjs"', StartLine: 10, EndLine: 20 },
  });
  assert.equal(quotedRead.text, '读取 backend/mastery.mjs L10-20');

  // Linear-time ReDoS safety: malformed/unclosed Markdown links must finish in < 50ms
  const t0 = Date.now();
  const pathological = `[broken](file:///d:/${'a'.repeat(400)} unclosed_link_without_paren`;
  assert.ok(stripMarkdownForPlainLine(pathological).length > 0);
  assert.ok(sanitizeTimelineMarkdown(pathological, 120).length > 0);
  assert.ok(Date.now() - t0 < 200, 'Markdown sanitizer must remain linear-time on unclosed links');

  // Markdown plain-line stripping for overview cards
  const richReply = [
    '已修复，把 **「任务结束（已读）」** 独立拆成 `done`（沉静灰）：',
    '- **四态视觉区分**：`运行中` / `休眠` / `任务结束未读` / `任务结束`。',
    '- **改动范围**：',
    '  - [mastery.mjs](file:///d:/AAA%E5%85%A8%E6%A0%88%E5%AD%A6%E4%B9%A0/AI%E7%A8%8B%E5%BA%8F/agy-plugin/sidecars/agy_monitor/backend/mastery.mjs#L913-L1035)：返回 `stateKind: "done"`。',
    '  - [mastery_hub.js](file:///d:/AAA%E5%85%A8%E6%A0%88%E5%AD%A6%E4%B9%A0/AI%E7%A8%8B%E5%BA%8F/agy-plugin/sidecars/agy_monitor/frontend/components/mastery_hub.js#L1-L20)：同步灰态徽章。',
  ].join('\n');

  const plain = stripMarkdownForPlainLine(richReply);
  assert.equal(plain.includes('**'), false);
  assert.equal(plain.includes('`'), false);
  assert.equal(plain.includes('file:///'), false);
  assert.ok(plain.includes('mastery.mjs'));
  assert.ok(plain.includes('mastery_hub.js'));

  // Timeline Markdown sanitizer measures visible length, so long percent-encoded file:/// links stay intact
  const sanitized = sanitizeTimelineMarkdown(richReply);
  assert.ok(sanitized.includes('[mastery.mjs](file:///d:/AAA%E5%85%A8'));
  assert.ok(sanitized.includes('[mastery_hub.js](file:///d:/AAA%E5%85%A8'));
  assert.ok(sanitized.includes('同步灰态徽章。'));

  // Oversized single-line text truncates cleanly without slicing inside a Markdown link
  const singleLineHuge = `已完成 ${'说明'.repeat(120)} 并修改 [mastery.mjs](file:///d:/AAA%E5%85%A8%E6%A0%88%E5%AD%A6%E4%B9%A0/mastery.mjs#L1-L10) 结束`;
  const truncated = sanitizeTimelineMarkdown(singleLineHuge, 80);
  assert.equal(truncated.includes('file:///'), false);
  assert.ok(truncated.endsWith('…'));

  // Full parseAgentJourney integration: clean overview taskLine + intact timeline steps
  const convId = 'conv-md-001';
  const logsDir = path.join(paths.brainDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, 'transcript.jsonl'),
    [
      { step_index: 1, type: 'USER_INPUT', created_at: '2026-11-20T01:00:00Z', content: '<USER_REQUEST>修好排版</USER_REQUEST>' },
      { step_index: 2, type: 'PLANNER_RESPONSE', created_at: '2026-11-20T01:00:10Z', content: richReply },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
    'utf8',
  );
  const journey = await parseAgentJourney(paths.brainDir, convId, { isMaster: true, isCompleted: true });
  assert.equal(journey.taskLine.includes('**'), false);
  assert.equal(journey.taskLine.includes('`'), false);
  assert.equal(journey.taskLine.includes('file:///'), false);
  const msgSteps = journey.steps.filter((s) => s.type === 'msg');
  assert.equal(msgSteps.length, 1);
  assert.ok(msgSteps[0].text.includes('[mastery_hub.js](file:///d:/AAA%E5%85%A8'));

  // Multi-turn & mid-run supplement preservation: sending a follow-up while running must NOT wipe prior history
  const multiConvId = 'conv-multi-002';
  const multiLogsDir = path.join(paths.brainDir, multiConvId, '.system_generated', 'logs');
  fs.mkdirSync(multiLogsDir, { recursive: true });
  fs.writeFileSync(
    path.join(multiLogsDir, 'transcript.jsonl'),
    [
      { step_index: 1, type: 'USER_INPUT', created_at: '2026-11-20T01:00:00Z', content: '<USER_REQUEST>先解释一下报错原因</USER_REQUEST>' },
      { step_index: 2, type: 'PLANNER_RESPONSE', created_at: '2026-11-20T01:00:10Z', content: '原因是路径被直接截断。', tool_calls: [] },
      { step_index: 3, type: 'USER_INPUT', created_at: '2026-11-20T01:01:00Z', content: '<USER_REQUEST>修掉</USER_REQUEST>' },
      {
        step_index: 4,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-20T01:01:05Z',
        content: '[AGY_PROGRESS|45%|正在修排版渲染] 正在修改前后端文件。',
        tool_calls: [{ name: 'edit_file', args: { Path: 'd:/repo/mastery.mjs', Target: 'a', Replacement: 'b' } }],
      },
      { step_index: 5, type: 'USER_INPUT', created_at: '2026-11-20T01:01:20Z', content: '<USER_REQUEST>顺便把操作列表默认收起</USER_REQUEST>' },
      {
        step_index: 6,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-20T01:01:25Z',
        content: '已一并收起操作列表。',
        tool_calls: [{ name: 'read_file', args: { Path: 'd:/repo/mastery_hub.js', StartLine: 1, EndLine: 10 } }],
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
    'utf8',
  );
  const multiJourney = await parseAgentJourney(paths.brainDir, multiConvId, {
    isMaster: true,
    isCompleted: false,
    nowMs: Date.parse('2026-11-20T01:01:30Z'),
  });
  const userSteps = multiJourney.steps.filter((s) => s.type === 'user');
  assert.equal(userSteps.length, 3);
  assert.equal(userSteps[0].text, '先解释一下报错原因');
  assert.equal(userSteps[0].isFollowup, false);
  assert.equal(userSteps[1].text, '修掉');
  assert.equal(userSteps[1].isFollowup, false);
  assert.equal(userSteps[2].text, '顺便把操作列表默认收起');
  assert.equal(userSteps[2].isFollowup, true);
  assert.equal(userSteps[2].label, '用户补充');
  // Mid-run supplement keeps current run's progress & prior steps intact
  assert.equal(multiJourney.progress, 45);
  assert.ok(multiJourney.steps.some((s) => s.type === 'msg' && s.text.includes('原因是路径被直接截断')));
  assert.ok(multiJourney.steps.some((s) => s.type === 'actions' && s.label === '编辑了文件' && s.defaultOpen === false));
});

test('openLocalPathTarget enters directories, opens parent dir for files, extracts user images, and separates progress tag from headings', async (t) => {
  const { root, paths } = makeTempEnv(t);
  const subDir = path.join(root, 'demo-folder');
  const sampleFile = path.join(subDir, 'report.md');
  const samplePng = path.join(subDir, 'shot.png');
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(sampleFile, '# ok\n', 'utf8');
  fs.writeFileSync(samplePng, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]));

  // Security rejections
  assert.equal(resolveLocalTargetPath('https://example.com/a.png'), '');
  assert.equal(resolveLocalTargetPath('javascript:alert(1)'), '');
  assert.equal(resolveLocalTargetPath('relative/path.txt'), '');
  assert.equal(resolveLocalTargetPath('D:\\bad"quote\\file.txt'), '');

  // Windows file:/// URI decoding & line anchor stripping
  assert.equal(
    resolveLocalTargetPath('file:///D:/codex-tools/app.js#L10-L20', { platform: 'win32' }),
    'D:\\codex-tools\\app.js',
  );

  // Directory -> enters itself; File -> opens parent directory & selects file
  const calls = [];
  const fakeSpawn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { unref() {} };
  };

  const dirRes = await openLocalPathTarget(subDir, { platform: 'win32', spawnImpl: fakeSpawn });
  assert.equal(dirRes.ok, true);
  assert.equal(dirRes.kind, 'directory');
  assert.equal(dirRes.openedPath, path.win32.resolve(subDir));
  assert.equal(calls[0].cmd, 'explorer.exe');
  assert.deepEqual(calls[0].args, [path.win32.resolve(subDir)]);

  const fileRes = await openLocalPathTarget(sampleFile, { platform: 'win32', spawnImpl: fakeSpawn });
  assert.equal(fileRes.ok, true);
  assert.equal(fileRes.kind, 'file');
  assert.equal(fileRes.openedPath, path.win32.resolve(subDir));
  assert.equal(calls[1].cmd, 'explorer.exe');
  assert.equal(calls[1].args[0], `/select,"${path.win32.resolve(sampleFile)}"`);

  // Direct open-file mode (from lightbox "打开文件")
  const directOpenRes = await openLocalPathTarget(samplePng, { mode: 'file', platform: 'win32', spawnImpl: fakeSpawn });
  assert.equal(directOpenRes.ok, true);
  assert.equal(directOpenRes.kind, 'file_open');
  assert.equal(directOpenRes.openedPath, path.win32.resolve(samplePng));
  assert.equal(calls[2].cmd, 'rundll32.exe');
  assert.deepEqual(calls[2].args, ['url.dll,FileProtocolHandler', path.win32.resolve(samplePng)]);

  // Deleted target -> falls back to nearest existing parent directory
  const missingChild = path.join(subDir, 'deleted-cache', 'temp.bin');
  const fallbackRes = await openLocalPathTarget(missingChild, { platform: 'win32', spawnImpl: fakeSpawn });
  assert.equal(fallbackRes.ok, true);
  assert.equal(fallbackRes.kind, 'parent_fallback');
  assert.equal(fallbackRes.openedPath, path.win32.resolve(subDir));

  // Progress tag stays separated from leading heading & user images are extracted
  const convId = 'conv-rich-003';
  const logsDir = path.join(paths.brainDir, convId, '.system_generated', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(
    path.join(logsDir, 'transcript.jsonl'),
    [
      {
        step_index: 1,
        type: 'USER_INPUT',
        created_at: '2026-11-20T02:00:00Z',
        content: `<USER_REQUEST>检查截图</USER_REQUEST><ADDITIONAL_METADATA>\n- ${samplePng}\n</ADDITIONAL_METADATA>`,
      },
      {
        step_index: 2,
        type: 'PLANNER_RESPONSE',
        created_at: '2026-11-20T02:00:05Z',
        content: `[AGY_PROGRESS|100%|已清理完毕并列出缓存]\n\n### 一、已完成清理结果\n1. **[demo](file:///${subDir.replace(/\\/g, '/')})**: 完成`,
      },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n') + '\n',
    'utf8',
  );
  const richJourney = await parseAgentJourney(paths.brainDir, convId, { isMaster: true, isCompleted: true });
  const uStep = richJourney.steps.find((s) => s.type === 'user');
  assert.deepEqual(uStep?.images, [samplePng]);
  const mStep = richJourney.steps.find((s) => s.type === 'msg');
  assert.equal(mStep?.statusTag, '已清理完毕并列出缓存');
  assert.equal(mStep?.progressPct, 100);
  assert.ok(mStep?.text.startsWith('### 一、已完成清理结果'), 'Heading must start cleanly without glued tag prefix');
});

test('buildMasterySnapshot always pins favorite sessions at top in saved order and exposes favorite flags', async (t) => {
  const { paths } = makeTempEnv(t);
  const baseMs = Date.parse('2026-11-21T10:00:00Z');

  const sessionsHub = {
    active: [
      { id: 'sess-active-1', title: '普通运行会话', workspace: 'proj-a', modifiedMs: baseMs + 5000, agoText: '1m' },
      { id: 'sess-fav-active', title: '常用运行会话', workspace: 'proj-b', modifiedMs: baseMs + 2000, agoText: '2m' },
    ],
    waiting: [],
    unread: [
      { id: 'sess-unread-1', title: '未读会话', workspace: 'proj-c', modifiedMs: baseMs + 4000, agoText: '3m' },
    ],
    recent: [
      { id: 'sess-active-1', title: '普通运行会话', workspace: 'proj-a', modifiedMs: baseMs + 5000, agoText: '1m' },
      { id: 'sess-fav-idle', title: '常用静默会话', workspace: 'proj-fav', modifiedMs: baseMs - 60_000, agoText: '1h' },
    ],
    favorites: [
      { id: 'sess-fav-idle', title: '常用静默会话', workspace: 'proj-fav', status: 'done', modifiedMs: baseMs - 60_000 },
      { id: 'sess-fav-active', title: '常用运行会话', workspace: 'proj-b', status: 'running', modifiedMs: baseMs + 2000 },
    ],
    allSelectable: [],
    subStatusById: {},
  };

  const snap = await buildMasterySnapshot(paths, sessionsHub, {
    sessionsMeta: {
      favoriteIds: ['sess-fav-idle', 'sess-fav-active'],
    },
    nowMs: baseMs + 10_000,
  });

  // Pinned favorites MUST appear first in exact saved favoriteIds order, followed by non-favorite active then unread
  assert.deepEqual(
    snap.sessions.map((s) => s.id),
    ['sess-fav-idle', 'sess-fav-active', 'sess-active-1', 'sess-unread-1'],
  );
  assert.deepEqual(snap.favoriteIds, ['sess-fav-idle', 'sess-fav-active']);
  assert.equal(snap.favoriteCount, 2);
  assert.equal(snap.sessions[0].isFavorite, true);
  assert.equal(snap.sessions[0].status, 'done');
  assert.equal(snap.sessions[1].isFavorite, true);
  assert.equal(snap.sessions[1].status, 'active');
  assert.equal(snap.sessions[2].isFavorite, false);
  assert.equal(snap.sessions[3].isFavorite, false);
  assert.equal(snap.activeCount, 2);
  assert.equal(snap.unreadCount, 1);

  // When no active/unread sessions exist, pinned favorites stay on top and non-favorite recent sessions follow below
  const idleSnap = await buildMasterySnapshot(
    paths,
    {
      active: [],
      waiting: [],
      unread: [],
      recent: [
        { id: 'sess-recent-a', title: '最近A', workspace: 'w1', modifiedMs: baseMs + 3000, agoText: '2m' },
        { id: 'sess-fav-idle', title: '常用静默会话', workspace: 'proj-fav', modifiedMs: baseMs - 60_000, agoText: '1h' },
        { id: 'sess-recent-b', title: '最近B', workspace: 'w2', modifiedMs: baseMs + 1000, agoText: '5m' },
      ],
      favorites: [
        { id: 'sess-fav-idle', title: '常用静默会话', workspace: 'proj-fav', status: 'done', modifiedMs: baseMs - 60_000 },
      ],
      allSelectable: [],
      subStatusById: {},
    },
    {
      sessionsMeta: { favoriteIds: ['sess-fav-idle'] },
      nowMs: baseMs + 10_000,
    },
  );
  assert.deepEqual(
    idleSnap.sessions.map((s) => s.id),
    ['sess-fav-idle', 'sess-recent-a', 'sess-recent-b'],
  );
  assert.equal(idleSnap.sessions[0].isFavorite, true);
  assert.equal(idleSnap.sessions[1].isFavorite, false);
  assert.equal(idleSnap.favoriteCount, 1);
});

test('queryCompactSessionProgress uses per-convId LRU cache, skips unchanged files, and uses 128 KB compact window with fallback', async (t) => {
  const { paths, storage } = makeTempEnv(t);
  const nowMs = Date.parse('2026-11-27T04:00:00Z');

  const writeTr = (convId, lines) => {
    const dir = path.join(paths.brainDir, convId, '.system_generated', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, 'transcript.jsonl');
    fs.writeFileSync(fp, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
    return fp;
  };

  // 1. Per-convId caching: only changed convId is re-read
  const trA = writeTr('conv-cache-a', [
    { step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:59:00Z', content: '[AGY_PROGRESS|25%|阶段一处理] 正在做A' },
  ]);
  const trB = writeTr('conv-cache-b', [
    { step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:59:10Z', content: '[AGY_PROGRESS|30%|阶段一开始] 正在做B' },
  ]);
  const fixedSec = 1795751000;
  fs.utimesSync(trA, fixedSec, fixedSec);

  const cache = new Map();
  const hub = {
    active: [
      { id: 'conv-cache-a', title: '任务A', modifiedMs: nowMs - 2000 },
      { id: 'conv-cache-b', title: '任务B', modifiedMs: nowMs - 1000 },
    ],
    waiting: [],
    unread: [],
  };

  const pass1 = await queryCompactSessionProgress(paths, hub, { nowMs, cache, maxCacheEntries: 3 });
  assert.equal(pass1.length, 2);
  assert.equal(pass1[0].progress, 25);
  assert.equal(pass1[1].progress, 30);
  assert.equal(cache.size, 2);

  // Overwrite conv-cache-a with exact same byte size & preserved exact-second mtime -> cache hit MUST skip disk read
  const origA = fs.readFileSync(trA, 'utf8');
  const stealthA = origA.replace('25%', '99%');
  assert.equal(Buffer.byteLength(stealthA, 'utf8'), Buffer.byteLength(origA, 'utf8'));
  fs.writeFileSync(trA, stealthA, 'utf8');
  fs.utimesSync(trA, fixedSec, fixedSec);

  // Modify conv-cache-b genuinely (new size + mtime) -> ONLY conv-cache-b re-reads
  fs.appendFileSync(
    trB,
    JSON.stringify({ step_index: 2, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:59:50Z', content: '[AGY_PROGRESS|80%|已完成核心] B已更新' }) + '\n',
    'utf8',
  );

  const pass2 = await queryCompactSessionProgress(paths, hub, { nowMs: nowMs + 500, cache, maxCacheEntries: 3 });
  assert.equal(pass2[0].progress, 25, 'Unchanged convId must hit per-convId cache without re-reading disk');
  assert.equal(pass2[1].progress, 80, 'Changed convId must re-read and return fresh progress');

  // 2. LRU bounding: adding 3 more sessions evicts oldest beyond maxCacheEntries=3
  for (const id of ['conv-lru-1', 'conv-lru-2', 'conv-lru-3']) {
    writeTr(id, [{ step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:59:55Z', content: '[AGY_PROGRESS|50%|推进中] ok' }]);
  }
  await queryCompactSessionProgress(
    paths,
    {
      active: [
        { id: 'conv-lru-1', title: 'L1', modifiedMs: nowMs },
        { id: 'conv-lru-2', title: 'L2', modifiedMs: nowMs },
        { id: 'conv-lru-3', title: 'L3', modifiedMs: nowMs },
      ],
      waiting: [],
      unread: [],
    },
    { nowMs: nowMs + 1000, cache, maxCacheEntries: 3 },
  );
  assert.equal(cache.size, 3);
  assert.equal(cache.has('conv-cache-a'), false, 'Oldest LRU entry must be evicted');
  assert.equal(cache.has('conv-lru-3'), true);

  // 3. pruneCompactProgressCache removes entries outside keepIds
  const removed = pruneCompactProgressCache(cache, { keepIds: ['conv-lru-3'], nowMs: nowMs + 2000 });
  assert.equal(removed, 2);
  assert.equal(cache.size, 1);

  // 4. Compact 128 KB tail window fast path vs automatic fallback to 1.5 MB when tail has huge tool output
  assert.equal(COMPACT_TRANSCRIPT_TAIL_BYTES, 128 * 1024);
  const padPayload = 'x'.repeat(20_000);
  const fastLines = [
    { step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:50:00Z', content: '[AGY_PROGRESS|12%|旧阶段] 早期' },
    ...Array.from({ length: 8 }, (_, i) => ({ step_index: i + 2, type: 'GENERIC', created_at: '2026-11-27T03:55:00Z', content: padPayload })),
    { step_index: 10, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:59:00Z', content: '[AGY_PROGRESS|88%|尾窗口直出] 最新进展' },
  ];
  writeTr('conv-compact-fast', fastLines);
  const fastRes = await queryCompactSessionProgress(
    paths,
    { active: [{ id: 'conv-compact-fast', title: 'Fast', modifiedMs: nowMs }], waiting: [], unread: [] },
    { nowMs },
  );
  assert.equal(fastRes[0].progress, 88);
  assert.equal(fastRes[0].tag, '尾窗口直出');

  const fallbackLines = [
    { step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-27T03:50:00Z', content: '[AGY_PROGRESS|55%|回退大窗口] 大输出前的进展' },
    ...Array.from({ length: 8 }, (_, i) => ({ step_index: i + 2, type: 'GENERIC', created_at: '2026-11-27T03:59:00Z', content: padPayload })),
  ];
  const trFallback = writeTr('conv-compact-fallback', fallbackLines);
  assert.ok(fs.statSync(trFallback).size > COMPACT_TRANSCRIPT_TAIL_BYTES);
  const fallbackRes = await queryCompactSessionProgress(
    paths,
    { active: [{ id: 'conv-compact-fallback', title: 'Fallback', modifiedMs: nowMs }], waiting: [], unread: [] },
    { nowMs },
  );
  assert.equal(fallbackRes[0].progress, 55);
  assert.equal(fallbackRes[0].tag, '回退大窗口');

  // 5. createHudTelemetryPublisher.resolveSessionProgress + pruneProgressCache integration
  const pub = createHudTelemetryPublisher(paths, storage);
  const p1 = await pub.resolveSessionProgress({
    active: [{ id: 'conv-compact-fast', title: 'Fast', modifiedMs: nowMs }],
    waiting: [],
    unread: [],
  });
  assert.equal(p1[0].progress, 88);
  assert.equal(pub.getProgressCacheSize(), 1);
  await pub.resolveSessionProgress({
    active: [{ id: 'conv-compact-fallback', title: 'Fallback', modifiedMs: nowMs }],
    waiting: [],
    unread: [],
  });
  assert.equal(pub.getProgressCacheSize(), 2);
  pub.pruneProgressCache();
  assert.equal(pub.getProgressCacheSize(), 1, 'pruneProgressCache drops sessions no longer in active candidate set');
});
