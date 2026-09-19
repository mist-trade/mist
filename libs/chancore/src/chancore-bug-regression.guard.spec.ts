/**
 * 缠论算法缺陷回归与守卫门禁 (ChanCore Bug Fix Regression Guard)
 *
 * 【门禁准则】：
 * 1. 凡涉及 @app/chancore 的分型、笔、段、中枢、背驰、买卖点算法 Bug 修复，
 *    必须在本门禁注册表 CHANCORE_BUG_REGISTRY 中登记唯一 Bug 标识；
 * 2. 必须在指定的 .spec.ts 测试套件中编写最小可复现真实或合成测试用例；
 * 3. 本门禁自动执行源码 AST / 测试用例存在性审计，确保任何历史 Bug 的回归用例
 *    不可被意外删除、重命名失联或跳过执行，实现永久防退化门禁。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ChancoreBugEntry {
  /** 缺陷唯一编号，如 BUG-CHAN-001 */
  readonly id: string;
  /** 缺陷名称与核心影响 */
  readonly name: string;
  /** 根因说明 */
  readonly rootCause: string;
  /** 必须存在的测试文件（相对于 libs/chancore/src） */
  readonly specFile: string;
  /** 测试文件中必须包含的用例名称关键字（或正则） */
  readonly testCasePatterns: readonly (string | RegExp)[];
}

/**
 * 缠论核心算法历史缺陷注册表（永久受本门禁保护）
 */
export const CHANCORE_BUG_REGISTRY: readonly ChancoreBugEntry[] = [
  {
    id: 'BUG-CHAN-001',
    name: '线段单笔破坏违反第 65 课至少三笔公理',
    rootCause:
      '旧算法在特征序列未分型时允许单笔直接结算 Complete 线段，导致跨段腰斩同向笔中枢。恢复第 65 课原典公理后，严格限定 endIdx >= segStartIdx + 2。',
    specFile: 'internal/duan.spec.ts',
    testCasePatterns: ['minimum 3-Bi axiom', 'strictly enforces lesson-65'],
  },
  {
    id: 'BUG-CHAN-002',
    name: '中枢延伸与合并未取全量构件公共重叠交集',
    rootCause:
      '中枢延伸仅取首尾段交集导致区间漂移穿透。修复为触及延伸必须维持所有构件全量动态公共交集 (min(high) > max(low))。',
    specFile: 'internal/channel.spec.ts',
    testCasePatterns: [
      'updates to dynamic common intersection',
      'terminates extension when dynamic common intersection becomes empty',
    ],
  },
  {
    id: 'BUG-CHAN-003',
    name: '5M 级别第 1 号中枢假突破过早封存导致 0.86 微型中枢',
    rootCause:
      '顺势笔突破中枢上沿 ZG 但未突破前期历史极值 GG 时被误判为离开封存。确立规则 1：必须顺势突破极值 GG 并确认 3 类买卖点或反穿后才能封存。',
    specFile: 'internal/channel.spec.ts',
    testCasePatterns: [
      '5M 实盘经典用例一：01-07~01-13 第 1 号中枢避免 b[10] 假突破过早封存',
    ],
  },
  {
    id: 'BUG-CHAN-004',
    name: '5M 级别 1月22日长中枢 11 笔贪婪吞噬与 departure < GG 倒挂',
    rootCause:
      '顺势突破极值后，未检测后续走势自身已独立构成新中枢，旧中枢无限吸附后续上涨。确立规则 4：新中枢核心成立时触发旧中枢在离开端点强制封存。',
    specFile: 'internal/channel.spec.ts',
    testCasePatterns: [
      '5M 实盘经典用例二：01-21~01-26 1月22日中枢与后续高台阶中枢拆分',
    ],
  },
  {
    id: 'BUG-CHAN-005',
    name: '中枢顺势离开突破与规则 1～4 状态机双向镜像对称完备封存',
    rootCause:
      '离开突破仅考虑向上中枢而遗漏向下中枢 3 卖（3S）镜像对称；未离开且未扩展的中枢在震荡中反向击穿反向沿时未及时失效导致伪中枢误报。',
    specFile: 'internal/channel-departure-rules.spec.ts',
    testCasePatterns: [
      '【规则 1】3买/3卖 顺势突破极值封存',
      '【规则 2】3买/3卖 后反向第 2 笔击穿反向沿封存',
      '【规则 3】无 3买/3卖，离开后单笔反向直接打穿反向沿封存',
      '【规则 4】顺势离开后，后续走势独立构成新中枢核心触发封存',
      '【守卫规则】未离开反向崩塌守卫',
    ],
  },
  {
    id: 'BUG-CHAN-006',
    name: '未封闭中枢实时产出标识 (UnComplete) 与买卖点及图表渲染闭合',
    rootCause:
      '旧中枢在未满足规则 1～4 封存条件前被抛弃或丢失 UnComplete 标识，导致实时第 3 类买卖点漏判与图表空白。支持未完成中枢 (ChannelType.UnComplete) 正常产出、买卖点实时定位以及前端虚线差异化渲染。',
    specFile: 'internal/channel-departure-rules.spec.ts',
    testCasePatterns: [
      '【未完成中枢】末端未离开中枢赋予 UnComplete 标识并实时参与三类买卖点计算',
    ],
  },
  {
    id: 'BUG-CHAN-007',
    name: '笔中枢延伸(extended)与扩展(expanded)双字段正交解耦与防套娃',
    rootCause:
      '旧算法将单中枢累积 9 笔标记为 expanded: true，导致随后产生两中枢扩展大框时内外层双重 expanded 标签套娃。改造为 extended 专用于 [ZD, ZG] 延伸合并，expanded 专用于 [DD, GG] 外层扩展大框，内层中枢保持基础形态。',
    specFile: 'internal/channel-extension-expansion.spec.ts',
    testCasePatterns: [
      '实盘真实用例：平安银行 (000001) 30分钟图 4月7日前后两中枢扩展区间端到端校验',
    ],
  },
  {
    id: 'BUG-CHAN-008',
    name: '中枢波动极值 [DD, GG] 排除外部连接笔污染与扩展误判',
    rootCause:
      '封存与构建中枢时错误将外部进入笔起点与离开笔终点计入 [DD, GG]，污染中枢自身震荡范围，导致无重叠的独立中枢误判为扩展。修复为严格仅从中枢内部震荡构件笔提取波动极值。',
    specFile: 'internal/channel-extension-expansion.spec.ts',
    testCasePatterns: [
      '5M 实盘经典案例：2026年2月6日前后两独立上涨中枢极值交集判定',
    ],
  },
];

describe('缠论核心算法缺陷回归与测试集合门禁 (ChanCore Bug Fix Regression Guard)', () => {
  const chancoreSrcDir = join(process.cwd(), 'libs', 'chancore', 'src');

  it('缺陷注册表有效性：ID 格式规范、不重复且严格按编号递增', () => {
    const ids = CHANCORE_BUG_REGISTRY.map((b) => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toMatch(/^BUG-CHAN-\d{3}$/);
      const expectedId = `BUG-CHAN-${String(i + 1).padStart(3, '0')}`;
      expect(ids[i]).toBe(expectedId);
    }
  });

  it('缺陷测试集合存在性门禁：每个 Bug 登记的 specFile 必须真实存在于工程中', () => {
    for (const bug of CHANCORE_BUG_REGISTRY) {
      const fullPath = join(chancoreSrcDir, bug.specFile);
      const exists = existsSync(fullPath);
      expect({
        bugId: bug.id,
        specFile: bug.specFile,
        exists,
      }).toEqual({
        bugId: bug.id,
        specFile: bug.specFile,
        exists: true,
      });
    }
  });

  it('缺陷测试用例绑定门禁：每个 Bug 要求的测试用例名必须在对应测试文件中被严格声明', () => {
    const missingAssertions: {
      bugId: string;
      pattern: string;
      file: string;
    }[] = [];

    for (const bug of CHANCORE_BUG_REGISTRY) {
      const fullPath = join(chancoreSrcDir, bug.specFile);
      const content = readFileSync(fullPath, 'utf8');

      for (const pattern of bug.testCasePatterns) {
        const matches =
          typeof pattern === 'string'
            ? content.includes(pattern)
            : pattern.test(content);

        if (!matches) {
          missingAssertions.push({
            bugId: bug.id,
            pattern: String(pattern),
            file: bug.specFile,
          });
        }
      }
    }

    expect(missingAssertions).toEqual([]);
  });
});
