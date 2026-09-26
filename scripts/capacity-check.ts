import { UniversalChatParserAdapter } from '../src/adapters/chat-parser.adapter';
import { analyzeChatStrata } from '../src/core/archaeology-engine';
import { buildReportExport } from '../src/core/report-export';
import { CAPACITY_LIMITS, byteLength } from '../src/core/capacity-limits';

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log('  ✓', label);
  else { console.error('  ✗ FAIL:', label); failures++; }
}

const parser = new UniversalChatParserAdapter();

// --- Case 1: normal small file still parses, stats unchanged ---
{
  const raw = [
    '2023-01-01 10:00:00 张三',
    '你好呀',
    '2023-01-01 10:01:00 李四：晚安宝贝',
    '[2023-01-02 09:00] 张三: 哈哈哈下班了'
  ].join('\n');
  const { messages, capacityNotices } = await parser.parse(raw);
  assert(messages.length === 3, `普通文件解析 3 条 (实际 ${messages.length})`);
  assert(capacityNotices.length === 0, '普通文件无容量告警');
  const report = analyzeChatStrata(messages, '测试遗址');
  assert(report.totalMessages === 3, '报告总数 = 3');
  assert(report.strata.reduce((s, l) => s + l.messageCount, 0) === 3, '各层条数之和 = 总数');
}

// --- Case 2: super long single message clipped, wordCount intact ---
{
  const longText = '爱'.repeat(100_000);
  const raw = `2023-01-01 10:00:00 张三：${longText}`;
  const { messages } = await parser.parse(raw);
  assert(messages.length === 1, '超长消息仍为 1 条');
  assert(messages[0].content.length === CAPACITY_LIMITS.maxMessageChars, `展示内容截断到 ${CAPACITY_LIMITS.maxMessageChars} 字 (实际 ${messages[0].content.length})`);
  assert(messages[0].wordCount === 100_000, 'wordCount 仍按原文 100000 统计');
  assert(messages[0].truncated === true, 'truncated 标记为 true');
  const report = analyzeChatStrata(messages, '超长遗址');
  const allQuotes = report.notableRelics.map(r => r.quote);
  assert(allQuotes.every(q => q.length <= CAPACITY_LIMITS.maxQuoteChars), '所有化石引用均不超过引用上限');
  assert(report.strata.every(l => l.dominantTopics.every(t => t.length <= CAPACITY_LIMITS.maxTopicChars + 1)), '话题标签长度受控');
}

// --- Case 3: message-count cap (force a tiny limit via raw with no headers => fallback lines) ---
{
  const lineCount = CAPACITY_LIMITS.maxMessages + 500;
  const raw = Array.from(
    { length: lineCount },
    (_, i) => `[2023-01-02 ${String(10 + Math.floor(i / 60) % 12).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}] 张三: 第${i}句对话内容哈哈哈`
  ).join('\n');
  const t0 = Date.now();
  const { messages, capacityNotices } = await parser.parse(raw);
  const ms = Date.now() - t0;
  assert(messages.length === CAPACITY_LIMITS.maxMessages, `消息条数封顶 ${CAPACITY_LIMITS.maxMessages} (实际 ${messages.length})`);
  assert(capacityNotices.some(n => n.kind === 'message-count'), '产生 message-count 告警');
  assert(ms < 10_000, `解析在 ${ms}ms 内完成 (<10s)`);
  const t1 = Date.now();
  const report = analyzeChatStrata(messages, '超大遗址', capacityNotices);
  const ms2 = Date.now() - t1;
  assert(report.totalMessages === CAPACITY_LIMITS.maxMessages, '报告总数 = 封顶条数，统计一致');
  assert(report.strata.reduce((s, l) => s + l.messageCount, 0) === CAPACITY_LIMITS.maxMessages, '各层之和 = 总数');
  assert(report.capacityNotices.length >= 1, '报告透传容量记录');
  assert(ms2 < 10_000, `地层分析在 ${ms2}ms 内完成 (<10s，无全量排序卡顿)`);
}

// --- Case 4: export bounded ---
{
  const raw = Array.from({ length: 300 }, (_, i) =>
    `2023-01-01 10:${String(i % 60).padStart(2, '0')}:00 张三：对不起我们又吵架了我真的好累但我还爱你承诺以后一直在一起${'长'.repeat(5000)}`
  ).join('\n');
  const { messages, capacityNotices } = await parser.parse(raw);
  assert(capacityNotices.some(n => n.kind === 'message-length'), '300 条超长消息触发 message-length 告警');
  const report = analyzeChatStrata(messages, '导出测试遗址', capacityNotices);
  const exported = buildReportExport(report);
  assert(byteLength(exported.text) <= CAPACITY_LIMITS.maxExportBytes, `导出体积 ≤ ${CAPACITY_LIMITS.maxExportBytes} 字节 (实际 ${byteLength(exported.text)})`);
  assert(exported.text.includes('出土总话语标本'), '导出含核心统计');
  assert(exported.text.includes('容量保护说明'), '导出含容量说明');
}

// --- Case 5: long unbroken token (no separators) does not overflow topics ---
{
  const blob = 'a'.repeat(50_000);
  const raw = `2023-01-01 10:00:00 张三：${blob}`;
  const { messages } = await parser.parse(raw);
  const report = analyzeChatStrata(messages, '无分隔超长遗址');
  assert(report.strata.every(l => l.dominantTopics.every(t => t.startsWith('#') && t.length <= 22)), '无分隔超长串生成的话题标签受控');
}

// --- Case 6: long sender name clipped ---
{
  const longSender = '张'.repeat(200);
  const raw = `2023-01-01 10:00:00 ${longSender}：你好`;
  const { messages } = await parser.parse(raw);
  assert(messages[0].sender.length <= CAPACITY_LIMITS.maxSenderChars, `发送者名称截断到 ${CAPACITY_LIMITS.maxSenderChars} 字 (实际 ${messages[0].sender.length})`);
}

// --- Case 7: bedrock origin relic quote clipped (previously unbounded) ---
{
  const longOrigin = '最初的话'.repeat(1000);
  const events = [
    `2020-01-01 08:00:00 甲：${longOrigin}`,
    '2020-06-01 08:00:00 甲：今天天气不错哈哈哈吃饭了吗',
    '2021-06-01 08:00:00 乙：晚安宝贝想你爱你',
    '2022-06-01 08:00:00 甲：嗯好的',
    '2023-06-01 08:00:00 乙：行吧先忙了'
  ].join('\n');
  const { messages } = await parser.parse(events);
  const report = analyzeChatStrata(messages, '基岩遗址');
  const origin = report.notableRelics.find(r => r.id === 'relic-origin');
  assert(!!origin, '基岩原点化石存在');
  assert(origin!.quote.length <= CAPACITY_LIMITS.maxQuoteChars, `原点化石引用受控 (${origin!.quote.length})`);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
