import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const devServerPath = join(
  repositoryRoot,
  'tools',
  'strategy-dev',
  'server.ts',
);

describe('Dev Server Architecture & Boundary Guard (本地开发服务门禁)', () => {
  it('server.ts 必须存在且非空', () => {
    expect(existsSync(devServerPath)).toBe(true);
    const content = readFileSync(devServerPath, 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });

  describe('1. 核心能力复用守门 (禁止自己手写功能，必须使用项目内核心底座)', () => {
    const serverSource = readFileSync(devServerPath, 'utf8');

    it('缠论几何必须使用 @app/chancore 与 ChanVisualAdapter，严禁私自手写几何算法', () => {
      // 必须引用官方库
      expect(serverSource).toMatch(/from ['"]@app\/chancore['"]/);
      expect(serverSource).toMatch(/ChanVisualAdapter\.convert/);

      // 严禁自己私自手写分型比较或包含合并循环
      expect(serverSource).not.toMatch(/function\s+mergeK/);
      expect(serverSource).not.toMatch(/function\s+detectFenxing/);
      expect(serverSource).not.toMatch(/function\s+findFenxings/);
      expect(serverSource).not.toMatch(/function\s+createBi/);
    });

    it('回测推进与买卖点检测必须复用 @app/signal 标准生产流水线与游标，严禁私自手写信号检测', () => {
      // 必须复用生产流水线 runChanBspPipeline 与 ChanBspEpisodeCursor
      expect(serverSource).toMatch(/runChanBspPipeline/);
      expect(serverSource).toMatch(/ChanBspEpisodeCursor/);

      // 严禁私自手写买卖点检测器或背驰遍历循环
      expect(serverSource).not.toMatch(/function\s+detectBuySellPoints/);
      expect(serverSource).not.toMatch(/function\s+detectDivergence/);
      expect(serverSource).not.toMatch(/function\s+runChanBspPipeline/); // 必须是 import，不可自己声明同名函数
    });

    it('绘图指令接口 (/v1/visual/commands) 必须回归纯几何，严禁私自拼接注入 backtest_signals', () => {
      // 严禁私自在 commands 中注入 backtest_signals 图元
      expect(serverSource).not.toMatch(/layer:\s*['"]backtest_signals['"]/);
      expect(serverSource).not.toMatch(
        /commands\.push\(\s*\{[\s\S]*?id:\s*`sig-icon-/,
      );
      expect(serverSource).not.toMatch(
        /commands\.push\(\s*\{[\s\S]*?id:\s*`sig-text-/,
      );
    });

    it('严禁引入已退役或未治理的第三方遗留计算库 (如 technicalindicators 等)', () => {
      const forbiddenLibraries = [
        'technicalindicators',
        'tulind',
        'talib',
        'pandas-js',
      ];
      for (const lib of forbiddenLibraries) {
        expect(serverSource).not.toContain(lib);
      }
    });

    it('必须使用统一 Envelope 契约输出，严禁裸数据响应', () => {
      expect(serverSource).toMatch(/function\s+wrapEnvelope/);
      expect(serverSource).toMatch(/function\s+sendJson/);
    });
  });

  describe('2. AST 语法树深度检测 (检查 import 规范与函数结构)', () => {
    const serverSource = readFileSync(devServerPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      'server.ts',
      serverSource,
      ts.ScriptTarget.Latest,
      true,
    );

    const importDeclarations: string[] = [];
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node)) {
        importDeclarations.push(
          node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, ''),
        );
      }
    });

    it('必须从系统核心库引入必要的领域能力', () => {
      const requiredModules = ['@app/chancore'];
      for (const req of requiredModules) {
        expect(importDeclarations).toContain(req);
      }
      // 检查是否从 signal 路径或别名引入了 pipeline
      const hasSignalImport = importDeclarations.some(
        (m) => m.includes('signal') || m === '@app/signal',
      );
      expect(hasSignalImport).toBe(true);

      // 检查是否引入了 visual-command 适配器
      const hasVisualCommandImport = importDeclarations.some(
        (m) => m.includes('visual-command') || m === '@app/visual-command',
      );
      expect(hasVisualCommandImport).toBe(true);
    });

    it('evaluateSignals 必须是逐 Bar 滑窗推进结构 (包含 advance 时序游标)', () => {
      let foundEvaluateSignals = false;
      let hasCursorAdvance = false;
      let hasPipelineCall = false;

      function visit(node: ts.Node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name &&
          node.name.text === 'evaluateSignals'
        ) {
          foundEvaluateSignals = true;
          const bodyText = node.body ? node.body.getText(sourceFile) : '';
          if (bodyText.includes('.advance(')) {
            hasCursorAdvance = true;
          }
          if (bodyText.includes('runChanBspPipeline(')) {
            hasPipelineCall = true;
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      expect(foundEvaluateSignals).toBe(true);
      expect(hasCursorAdvance).toBe(true);
      expect(hasPipelineCall).toBe(true);
    });
  });
});
