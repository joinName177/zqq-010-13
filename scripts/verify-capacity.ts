import { UniversalChatParserAdapter, assertFileSizeAllowed } from '../src/adapters/chat-parser.adapter';
import { ArchaeologyEngineAdapter } from '../src/adapters/archaeology-engine.adapter';
import { ReportExportAdapter } from '../src/adapters/report-export.adapter';
import { analyzeChatStrata } from '../src/core/archaeology-engine';
import { CAPACITY_LIMITS, CapacityError, clipText } from '../src/core/capacity-limits';
import { ChatMessage } from '../src/core/models';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

function mkMsg(i: number, content: string, sender = 'A'): ChatMessage {
  return {
    id: `t-${i}`,
    timestamp: new Date(Date.now() - i * 3600_000),
    sender,
    content,
    sentimentScore: 0,
    wordCount: content.length
  };
}

async function main() {
  // 1. 文件边界
  console.log('[文件边界]');
  assertFileSizeAllowed(CAPACITY_LIMITS.MAX_FILE_BYTES);
  let fileThrew = false;
  try {
    assertFileSizeAllowed(CAPACITY_LIMITS.MAX_FILE_BYTES + 1);
  } catch (e) {
    fileThrew = e instanceof CapacityError && e.code === 'FILE_TOO_LARGE';
  }
  check('超限文件抛 FILE_TOO_LARGE', fileThrew);

  // 2. 单条超长消息：内容裁剪、wordCount 保留真实字数
  console.log('[消息边界]');
  const parser = new UniversalChatParserAdapter();
  const huge = 'x'.repeat(CAPACITY_LIMITS.MAX_MESSAGE_CHARS * 3);
  const res1 = await parser.parse(
    `2024-01-01 10:00:00 张三: ${huge}`
  );
  check('超长消息被解析为 1 条', res1.messages.length === 1);
  check(
    '展示内容不超过单条上限',
    res1.messages[0].content.length <= CAPACITY_LIMITS.MAX_MESSAGE_CHARS
  );
  check('wordCount 保留真实字数', res1.messages[0].wordCount === huge.length);

  // 3. 消息条数上限
  console.log('[条数边界]');
  const lines: string[] = [];
  for (let i = 0; i < CAPACITY_LIMITS.MAX_MESSAGES + 500; i++) {
    lines.push(`2024-01-01 10:${String(i % 60).padStart(2, '0')}:00 张三: 消息${i}`);
  }
  const res2 = await parser.parse(lines.join('\n'));
  check('消息数不超过上限', res2.messages.length === CAPACITY_LIMITS.MAX_MESSAGES);
  check('报告超限丢弃计数 > 0', res2.droppedMessages > 0, `dropped=${res2.droppedMessages}`);
  check('超限丢弃计数精确', res2.droppedMessages === 500, `dropped=${res2.droppedMessages}, 期望 500`);

  // 4. 原始字符上限
  const giant = 'a'.repeat(CAPACITY_LIMITS.MAX_RAW_CHARS + 10);
  const res3 = await parser.parse(giant);
  check('原始文本超限被标记', res3.sourceTruncated === true);

  // 5. 引擎核心闸门
  console.log('[引擎闸门]');
  const engineAdapter = new ArchaeologyEngineAdapter();
  const many = Array.from({ length: CAPACITY_LIMITS.MAX_MESSAGES + 10 }, (_, i) =>
    mkMsg(i, `内容${i}`, '非常长的发送者名字'.repeat(20))
  );
  const { messages: accepted, guard } = engineAdapter.enforceCapacity(many);
  check('闸门收敛条数', accepted.length === CAPACITY_LIMITS.MAX_MESSAGES);
  check('闸门报告丢弃数', guard.droppedMessages === 10);
  check('发送者名被裁剪', accepted[0].sender.length <= CAPACITY_LIMITS.MAX_SENDER_CHARS);

  // 6. 引用边界（含原始化石首条不截断的旧漏洞）
  console.log('[引用边界]');
  const longOrigin = mkMsg(0, '原点'.repeat(100));
  const longOther = mkMsg(1, '对不起' + '裂'.repeat(500));
  const report = analyzeChatStrata([longOrigin, longOther], '测试遗址');
  const allQuotes = report.notableRelics.map(r => r.quote);
  check(
    '所有化石引文不超过引文上限',
    allQuotes.every(q => q.length <= CAPACITY_LIMITS.MAX_QUOTE_CHARS),
    allQuotes.map(q => q.length).join(',')
  );
  check(
    '每层化石数量封顶',
    report.strata.every(s => s.fossilRelics.length <= CAPACITY_LIMITS.MAX_RELICS_PER_LAYER)
  );

  // 7. 核心统计一致性：分层计数之和 === 总消息数
  console.log('[统计正确性]');
  const normalMsgs = Array.from({ length: 103 }, (_, i) =>
    mkMsg(i, i % 3 === 0 ? '我喜欢你宝贝晚安' : `日常碎片${i}`, i % 2 ? '甲' : '乙')
  );
  const r2 = analyzeChatStrata(normalMsgs);
  const layerSum = r2.strata.reduce((s, l) => s + l.messageCount, 0);
  check('分层计数之和 === 总消息数', layerSum === r2.totalMessages && r2.totalMessages === 103, `${layerSum}/${r2.totalMessages}`);
  const guardedReport = analyzeChatStrata(accepted.slice(0, 1000), 'G');
  const layerSum2 = guardedReport.strata.reduce((s, l) => s + l.messageCount, 0);
  check('截断样本统计自洽', layerSum2 === guardedReport.totalMessages);

  // 8. 导出边界与统计一致
  console.log('[导出边界]');
  const exporter = new ReportExportAdapter();
  const doc = exporter.exportReport(report);
  const bytes = new TextEncoder().encode(doc.content).length;
  check('导出产物不超过字节上限', bytes <= CAPACITY_LIMITS.MAX_EXPORT_BYTES, `${bytes}`);
  check('导出包含真实总条数', doc.content.includes(`${report.totalMessages} 条`));
  check(
    '超长引文在导出中被裁剪',
    report.notableRelics.some(r => r.quote.endsWith('…')) &&
      report.notableRelics.every(r => r.quote.length <= CAPACITY_LIMITS.MAX_QUOTE_CHARS)
  );
  check('文件名安全', /^archaeology-report-[\w-]+\.txt$/.test(doc.filename), doc.filename);

  let exportThrew = false;
  try {
    // 构造条目数量级超限的异常快照（绕过构建器裁剪），验证导出适配器的字节闸门
    const huge = analyzeChatStrata([mkMsg(0, '基准消息')], 'X');
    huge.strata = Array.from({ length: 4000 }, (_, i) => ({
      ...huge.strata[0],
      depthLevel: (i % 5) + 1,
      epochName: '层'.repeat(500),
      lithology: '岩'.repeat(500),
      fossilRelics: [
        {
          id: `f-${i}`,
          name: '名'.repeat(200),
          category: '深夜篝火',
          depthMeters: 1,
          dateStr: '2024-01-01',
          sender: '人'.repeat(200),
          quote: '引'.repeat(2000),
          archaeologicalNotes: '注'.repeat(500),
          preservationScore: 80
        }
      ]
    }));
    exporter.exportReport(huge);
  } catch (e) {
    exportThrew = e instanceof CapacityError && e.code === 'EXPORT_TOO_LARGE';
  }
  check('超限导出抛 EXPORT_TOO_LARGE', exportThrew);

  // 9. clipText 基础性质
  console.log('[clipText]');
  check('短文本不变', clipText('abc', 10) === 'abc');
  check('长文本精确裁剪', clipText('abcdef', 4) === 'abc…' && clipText('abcdef', 4).length === 4);
  check('零长度安全', clipText('abc', 0) === '');

  console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
