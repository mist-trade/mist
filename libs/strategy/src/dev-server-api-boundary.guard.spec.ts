import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Dev Server API & Confidentiality Boundary Guard (本地开发服务器与保密门禁)', () => {
  const repositoryRoot = process.cwd();
  const serverPath = join(repositoryRoot, 'tools', 'strategy-dev', 'server.ts');
  const activeOpenspecDir = join(
    repositoryRoot,
    'openspec',
    'changes',
    'evaluate-private-tactical-strategies',
  );
  const archivedOpenspecDir = join(
    repositoryRoot,
    'openspec',
    'changes',
    'archive',
    '2026-10-28-evaluate-private-tactical-strategies',
  );
  const openspecDir = existsSync(activeOpenspecDir)
    ? activeOpenspecDir
    : archivedOpenspecDir;

  it('1. server.ts 必须存在且提供标准 POST /v1/strategy-backtests 接口', () => {
    expect(existsSync(serverPath)).toBe(true);
    const content = readFileSync(serverPath, 'utf8');
    expect(content).toMatch(/['"]\/v1\/strategy-backtests['"]/);
    expect(content).toMatch(/req\.method === ['"]POST['"]/);
  });

  it('2. server.ts 回测接口必须接入统一因果撮合 (SimulatedBroker) 与纯数学夏普率算子，禁止手写伪撮合', () => {
    const content = readFileSync(serverPath, 'utf8');
    // 必须复用生产执行与撮合引擎
    expect(content).toMatch(/SimulatedBroker/);
    expect(content).toMatch(/PositionStateMachine/);
    // 必须复用纯数学 Rust Polars 绩效算子
    expect(content).toMatch(
      /computeComprehensiveRiskPerformance|computePerformanceSummary/,
    );
    // 必须支持极端压力测试沙盒
    expect(content).toMatch(/StressTestingSuiteOrchestrator/);
  });

  it('3. 严禁外部评估直接调用底层未暴露函数，必须严格走开发服务器接口或统一内核', () => {
    const content = readFileSync(serverPath, 'utf8');
    // 网关必须通过统一求值内核驱动
    expect(content).toMatch(/StrategyEvaluationKernel/);
    // 严禁自行实例化私有插件的具体实现，必须通过外部插件加载机制或标准注册表
    expect(content).not.toMatch(/new\s+BullLeftRightBspPlugin/);
    expect(content).not.toMatch(/new\s+BearLeftRightBspPlugin/);
  });

  it('4. 保密门禁：OpenSpec 文档与公仓规格中严禁泄露私有插件的专有逻辑与参数细节', () => {
    const proposalPath = join(openspecDir, 'proposal.md');
    const designPath = join(openspecDir, 'design.md');
    const specPath = join(openspecDir, 'specs', 'dev-backtest-api', 'spec.md');
    const tasksPath = join(openspecDir, 'tasks.md');

    for (const file of [proposalPath, designPath, specPath, tasksPath]) {
      expect(existsSync(file)).toBe(true);
      const text = readFileSync(file, 'utf8');

      // 严禁包含私有插件的内部源码路径或私有计算公式细节
      expect(text).not.toMatch(/mist-alpha-private\/src\/plugins\/.*\.ts/);
      expect(text).not.toMatch(/subBars\[lastBarIdx - confirmedIdx <= 25\]/);
      expect(text).not.toMatch(/oversoldThreshold.*0\.05/);
      expect(text).not.toMatch(/slopeThreshold.*0\.005/);
    }
  });
});
