#!/usr/bin/env node
/**
 * tools/audit/scan-magic-literals.mjs
 *
 * 自研 TypeScript AST 魔法数字与魔法字符串扫描与门禁引擎。
 *
 * 功能：
 * 1. 遍历 apps/、libs/、tools/ 完整 TypeScript 源码；
 * 2. 基于 AST 深度解析语法上下文，自动豁免：
 *    - import/export 路径
 *    - TS 纯类型定义 (TypeAlias, Interface, TypeNode)
 *    - 顶层大写常量声明 (const FOO = ...)
 *    - 枚举成员 (enum Foo { BAR = 1 })
 *    - 装饰器注解 (@Inject, @Get, @Column, @ApiProperty)
 *    - Logger/console 打印文案 (logger.info, this.logger.debug, console.log)
 *    - 数学与语法白名单 (-1, 0, 1, 2, 100, 空串, 标点)
 *    - 单测与基准用例 (*.spec.ts, *.test.ts, test/fixtures/**)
 *    - 已有 constants/config/entity 文件
 * 3. 模式支持：
 *    - 默认 / --report: 生成 .data/audit-magic-literals.json 与 docs/audit-magic-literals-report.md
 *    - --check: CI 门禁模式，存在未豁免硬编码则以非 0 退出
 *    - --json: 控制台仅输出纯 JSON
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// ======================== 白名单与豁免规则 ========================

const WHITELIST_NUMBERS = new Set([-1, 0, 1, 2, 100]);

const WHITELIST_STRINGS = new Set([
  // JavaScript / Intl / Date 平台原语
  '2-digit',
  'numeric',
  'narrow',
  'short',
  'long',
  'full',
  'year',
  'month',
  'day',
  'hour',
  'minute',
  'second',

  // SQL 查询排序原语
  'ASC',
  'DESC',
  'asc',
  'desc',

  // 标准 Node 进程与流事件
  'SIGINT',
  'SIGTERM',
  'error',
  'close',
  'open',
  'data',
  'message',
  'drain',
  'finish',
  'end',
  'start',
  'pause',
  'resume',
  'production',
  'development',
  'test',

  // 标准 HTTP 头与通配符
  '*',
  'Content-Type',
  'content-type',
  'Authorization',
  'authorization',
  'Accept',
  'accept',
  'Cache-Control',
  'cache-control',
  'no-cache',
  'keep-alive',

  '',
  ' ',
  ',',
  ':',
  ';',
  '-',
  '/',
  '_',
  '.',
  '|',
  '\n',
  '\r\n',
  '\t',
  'utf-8',
  'utf8',
  'ascii',
  'binary',
  'hex',
  'base64',
  'application/json',
  'text/plain',
  'text/event-stream',
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
  'default',
  'true',
  'false',
  'null',
  'undefined',
  'string',
  'number',
  'boolean',
  'object',
  'function',
  'unknown',
  'any',
  'never',
  '0',
  '1',
  '2',
]);

const IGNORED_PATH_PATTERNS = [
  /\/node_modules\//,
  /\/dist\//,
  /\/\.git\//,
  /\/\.data\//,
  /\/coverage\//,
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\/test\/fixtures\//,
  /\/test\/mocks\//,
  /\.constants\.ts$/,
  /\.config\.ts$/,
  /\/constants\//,
  /\/validation\.schema\.ts$/,
  /\.entity\.ts$/,
  /\/deploy\/database\/migrations\//,
  /\/tools\/audit\//,
];

// ======================== 辅助函数 ========================

function shouldIgnorePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectTsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldIgnorePath(fullPath + '/')) {
        results.push(...collectTsFiles(fullPath));
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      if (!shouldIgnorePath(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function isLoggerCall(callExpr) {
  const expr = callExpr.expression;
  let text = '';
  if (ts.isPropertyAccessExpression(expr)) {
    text = expr.getText();
  } else if (ts.isIdentifier(expr)) {
    text = expr.getText();
  }
  return (
    text.includes('logger.') ||
    text.includes('Logger.') ||
    text.includes('this.logger.') ||
    text.startsWith('console.')
  );
}

function isTopLevelConstOrEnum(node) {
  let curr = node.parent;
  while (curr) {
    if (ts.isEnumDeclaration(curr) || ts.isEnumMember(curr)) {
      return true;
    }
    if (ts.isVariableDeclaration(curr)) {
      const varName = curr.name.getText();
      // 全大写或者 CONSTANTS 命名风格视作显式常量定义
      if (/^[A-Z0-9_]+$/.test(varName)) {
        return true;
      }
    }
    if (ts.isPropertyDeclaration(curr) && curr.modifiers) {
      const isReadonly = curr.modifiers.some(
        (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword,
      );
      const isStatic = curr.modifiers.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword,
      );
      if (isReadonly || isStatic) {
        return true;
      }
    }
    curr = curr.parent;
  }
  return false;
}

function isTypeContext(node) {
  let curr = node.parent;
  while (curr) {
    if (
      ts.isTypeNode(curr) ||
      ts.isTypeAliasDeclaration(curr) ||
      ts.isInterfaceDeclaration(curr) ||
      ts.isTypeReferenceNode(curr) ||
      ts.isLiteralTypeNode(curr)
    ) {
      return true;
    }
    if (ts.isImportDeclaration(curr) || ts.isExportDeclaration(curr)) {
      return true;
    }
    if (ts.isDecorator(curr)) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

// ======================== 核心 AST 分析器 ========================

export function analyzeSourceFile(sourceFile, filePath) {
  const findings = [];
  const text = sourceFile.text;

  function getNodeLocation(node) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(),
    );
    return {
      line: line + 1,
      column: character + 1,
    };
  }

  function getContextSnippet(node) {
    const parent = node.parent;
    if (!parent) return node.getText();
    const start = Math.max(0, parent.getStart());
    const end = Math.min(text.length, parent.getEnd());
    return text.substring(start, end).replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function visit(node) {
    // 检查是否在安全语境中（类型定义、装饰器、导入导出等）
    if (isTypeContext(node)) {
      return;
    }

    // 检查是否已经在顶级大写常量或枚举中
    if (isTopLevelConstOrEnum(node)) {
      return;
    }

    // 检查数字字面量
    if (ts.isNumericLiteral(node)) {
      const rawText = node.getText(sourceFile);
      // 豁免 POSIX 8 进制文件权限掩码 (例如 0o700, 0o600 等)
      if (rawText.startsWith('0o') || rawText.startsWith('0O')) {
        return;
      }

      const numVal = Number(node.text);
      if (!WHITELIST_NUMBERS.has(numVal)) {
        // 判断是否为负数的前缀表达式 parent
        let finalVal = numVal;
        let targetNode = node;
        if (
          node.parent &&
          ts.isPrefixUnaryExpression(node.parent) &&
          node.parent.operator === ts.SyntaxKind.MinusToken
        ) {
          finalVal = -numVal;
          targetNode = node.parent;
        }

        if (!WHITELIST_NUMBERS.has(finalVal)) {
          const loc = getNodeLocation(targetNode);
          findings.push({
            type: 'number',
            value: finalVal,
            raw: targetNode.getText(),
            file: path.relative(REPO_ROOT, filePath),
            line: loc.line,
            column: loc.column,
            context: getContextSnippet(targetNode),
          });
        }
      }
    }

    // 检查字符串字面量
    else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      const strVal = node.text;

      // 基础白名单
      if (!WHITELIST_STRINGS.has(strVal)) {
        // 过滤 Logger 内部调用实参
        let curr = node.parent;
        let isLog = false;
        while (curr) {
          if (ts.isCallExpression(curr) && isLoggerCall(curr)) {
            isLog = true;
            break;
          }
          if (ts.isFunctionDeclaration(curr) || ts.isMethodDeclaration(curr)) {
            break;
          }
          curr = curr.parent;
        }

        if (!isLog) {
          // 精准捕获高危语境：
          // 1. 比较运算 (===, !==, ==, !=)
          // 2. 函数实参 (CallExpression arguments)
          // 3. 业务对象属性赋值 (PropertyAssignment)
          // 4. 二元加法/拼接 (BinaryExpression +)
          let isDangerous = false;
          let category = 'other';

          const parent = node.parent;
          if (parent) {
            if (ts.isBinaryExpression(parent)) {
              const op = parent.operatorToken.kind;
              if (
                op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
                op === ts.SyntaxKind.EqualsEqualsToken ||
                op === ts.SyntaxKind.ExclamationEqualsToken
              ) {
                isDangerous = true;
                category = 'comparison';
              } else if (op === ts.SyntaxKind.PlusToken) {
                isDangerous = true;
                category = 'string-concatenation';
              }
            } else if (
              ts.isCallExpression(parent) &&
              parent.arguments.includes(node)
            ) {
              isDangerous = true;
              category = 'function-argument';
            } else if (
              ts.isPropertyAssignment(parent) &&
              parent.initializer === node
            ) {
              isDangerous = true;
              category = 'object-property';
            } else if (ts.isCaseClause(parent)) {
              isDangerous = true;
              category = 'switch-case';
            }
          }

          if (isDangerous) {
            const loc = getNodeLocation(node);
            findings.push({
              type: 'string',
              value: strVal,
              raw: node.getText(),
              category,
              file: path.relative(REPO_ROOT, filePath),
              line: loc.line,
              column: loc.column,
              context: getContextSnippet(node),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return findings;
}

// ======================== 主执行入口 ========================

export function runScan(targetDirs = ['apps', 'libs', 'tools']) {
  const allFiles = [];
  for (const d of targetDirs) {
    const fullDir = path.join(REPO_ROOT, d);
    allFiles.push(...collectTsFiles(fullDir));
  }

  console.log(
    `[scan-magic] 正在解析 ${allFiles.length} 个 TypeScript 源码文件...`,
  );

  const allFindings = [];
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const fileFindings = analyzeSourceFile(sourceFile, filePath);
    allFindings.push(...fileFindings);
  }

  return {
    scannedFilesCount: allFiles.length,
    findings: allFindings,
  };
}

function generateReport(scanResult) {
  const { findings, scannedFilesCount } = scanResult;

  // 聚类统计
  const numberStats = new Map();
  const stringStats = new Map();
  const fileStats = new Map();

  for (const f of findings) {
    // 按文件
    fileStats.set(f.file, (fileStats.get(f.file) || 0) + 1);

    // 按数值/字符串聚类
    if (f.type === 'number') {
      const entry = numberStats.get(f.value) || {
        value: f.value,
        count: 0,
        occurrences: [],
      };
      entry.count++;
      entry.occurrences.push(f);
      numberStats.set(f.value, entry);
    } else if (f.type === 'string') {
      const entry = stringStats.get(f.value) || {
        value: f.value,
        count: 0,
        occurrences: [],
      };
      entry.count++;
      entry.occurrences.push(f);
      stringStats.set(f.value, entry);
    }
  }

  const sortedNumbers = Array.from(numberStats.values()).sort(
    (a, b) => b.count - a.count,
  );
  const sortedStrings = Array.from(stringStats.values()).sort(
    (a, b) => b.count - a.count,
  );
  const sortedFiles = Array.from(fileStats.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  // Markdown Report 生成
  let md = `# Mist 全仓硬编码数字与字符串（魔法值）审计盘点报告\n\n`;
  md += `> 生成时间：${new Date().toISOString()}\n`;
  md += `> 扫描文件总数：${scannedFilesCount} 个\n`;
  md += `> 检出硬编码总量：${findings.length} 处（数字 ${findings.filter((f) => f.type === 'number').length} 处，字符串 ${findings.filter((f) => f.type === 'string').length} 处）\n\n`;

  md += `## 一、高频魔法数字汇总（Top 30）\n\n`;
  md += `| 排名 | 硬编码数值 | 出现频次 | 典型分布位置 | 建议归宿分类 |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;

  for (let i = 0; i < Math.min(30, sortedNumbers.length); i++) {
    const item = sortedNumbers[i];
    const topFiles = Array.from(
      new Set(item.occurrences.map((o) => `\`${o.file}:${o.line}\``)),
    )
      .slice(0, 3)
      .join(', ');
    const recommendation =
      item.value >= 1000
        ? '环境超时/系统参数 (.env / @app/config)'
        : item.value < 1 && item.value > 0
          ? '算法比例系数 (*.constants.ts)'
          : '领域常量 (*.constants.ts)';
    md += `| ${i + 1} | \`${item.value}\` | ${item.count} 次 | ${topFiles} | ${recommendation} |\n`;
  }

  md += `\n## 二、高频魔法字符串汇总（Top 30）\n\n`;
  md += `| 排名 | 硬编码字符串 | 出现频次 | 语法语境类别 | 典型分布位置 | 建议归宿分类 |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (let i = 0; i < Math.min(30, sortedStrings.length); i++) {
    const item = sortedStrings[i];
    const topFiles = Array.from(
      new Set(item.occurrences.map((o) => `\`${o.file}:${o.line}\``)),
    )
      .slice(0, 3)
      .join(', ');
    const categories = Array.from(
      new Set(item.occurrences.map((o) => o.category)),
    ).join(', ');
    const recommendation =
      item.value.includes(':') || item.value.includes('.')
        ? '协议键/事件名 (*.constants.ts)'
        : /^[A-Z_]+$/.test(item.value)
          ? '业务状态枚举 (Enums / *.constants.ts)'
          : '契约字面量 (*.constants.ts)';
    md += `| ${i + 1} | \`${item.value.replace(/\|/g, '\\|')}\` | ${item.count} 次 | ${categories} | ${topFiles} | ${recommendation} |\n`;
  }

  md += `\n## 三、硬编码重灾区文件列表（Top 20）\n\n`;
  md += `| 排名 | 文件路径 | 硬编码总数 |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (let i = 0; i < Math.min(20, sortedFiles.length); i++) {
    const [file, count] = sortedFiles[i];
    md += `| ${i + 1} | \`${file}\` | ${count} 处 |\n`;
  }

  md += `\n## 四、完整明细清单\n\n`;
  md += `<details>\n<summary>展开查看全部 ${findings.length} 处详细命中文档</summary>\n\n`;
  md += `| 类型 | 数值/字符串 | 文件位置 | 上下文代码片段 |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  for (const f of findings) {
    const val = String(f.value).replace(/\|/g, '\\|');
    const ctx = f.context.replace(/\|/g, '\\|');
    md += `| ${f.type} | \`${val}\` | \`${f.file}:${f.line}:${f.column}\` | \`${ctx}\` |\n`;
  }
  md += `\n</details>\n`;

  return {
    md,
    jsonData: {
      generatedAt: new Date().toISOString(),
      summary: {
        totalFiles: scannedFilesCount,
        totalFindings: findings.length,
        numberFindings: findings.filter((f) => f.type === 'number').length,
        stringFindings: findings.filter((f) => f.type === 'string').length,
      },
      topNumbers: sortedNumbers.slice(0, 50),
      topStrings: sortedStrings.slice(0, 50),
      topFiles: sortedFiles.slice(0, 50),
      allFindings: findings,
    },
  };
}

// 命令行参数处理
const args = process.argv.slice(2);
const isCheckMode = args.includes('--check');
const isJsonMode = args.includes('--json');

const defaultTrackedBaseline = path.resolve(
  REPO_ROOT,
  'tools/audit/baseline-magic-literals.json',
);
const defaultLocalBaseline = path.resolve(
  REPO_ROOT,
  '.data/audit-magic-literals.json',
);

const baselineArgIdx = args.indexOf('--baseline');
const baselinePath =
  baselineArgIdx !== -1 && args[baselineArgIdx + 1]
    ? path.resolve(REPO_ROOT, args[baselineArgIdx + 1])
    : fs.existsSync(defaultTrackedBaseline)
      ? defaultTrackedBaseline
      : defaultLocalBaseline;

const maxViolationsIdx = args.indexOf('--max-violations');
const maxViolations =
  maxViolationsIdx !== -1 && args[maxViolationsIdx + 1]
    ? parseInt(args[maxViolationsIdx + 1], 10)
    : null;

const scanResult = runScan(['apps', 'libs', 'tools']);
const report = generateReport(scanResult);

if (isCheckMode) {
  const count = scanResult.findings.length;

  if (maxViolations !== null) {
    if (count > maxViolations) {
      console.error(
        `\n❌ [AST Gate] 硬编码违规数量 (${count}) 超过允许的最大上限 (${maxViolations})！`,
      );
      for (const f of scanResult.findings.slice(0, 20)) {
        console.error(
          `  - [${f.type.toUpperCase()}] ${f.file}:${f.line}:${f.column} => \`${f.value}\` in "${f.context}"`,
        );
      }
      if (count > 20) {
        console.error(
          `  ... 还有 ${count - 20} 处未显示，请运行 npm run audit:magic 查看完整报告。`,
        );
      }
      process.exit(1);
    } else {
      console.log(
        `\n✅ [AST Gate] 校验通过：当前硬编码数量 (${count}) 未超过上限 (${maxViolations})！`,
      );
      process.exit(0);
    }
  }

  // 尝试读取基线快照防恶化门禁
  if (fs.existsSync(baselinePath)) {
    try {
      const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      const baselineCount = baselineData.summary?.totalFindings ?? 0;

      if (count > baselineCount) {
        const diff = count - baselineCount;
        console.error(
          `\n❌ [AST Gate] 检出新增硬编码违规！当前数量 (${count}) 比基线快照 (${baselineCount}) 增加了 ${diff} 处！`,
        );
        console.error(
          `门禁规则：新增硬编码零容忍。请提取为常量或配置，严禁引入新的魔法值。`,
        );

        // 查找新增的违规项
        const baselineSet = new Set(
          (baselineData.allFindings || []).map(
            (f) => `${f.file}:${f.line}:${f.value}`,
          ),
        );
        const newFindings = scanResult.findings.filter(
          (f) => !baselineSet.has(`${f.file}:${f.line}:${f.value}`),
        );

        console.error(`\n疑似新增的违规项（前 20 条）：`);
        for (const f of newFindings.slice(0, 20)) {
          console.error(
            `  + [${f.type.toUpperCase()}] ${f.file}:${f.line}:${f.column} => \`${f.value}\` in "${f.context}"`,
          );
        }
        process.exit(1);
      } else {
        console.log(
          `\n✅ [AST Gate] 校验通过：当前硬编码数量 (${count}) <= 基线快照 (${baselineCount})，未引入新增魔法值！`,
        );
        process.exit(0);
      }
    } catch (err) {
      console.warn(
        `[AST Gate] 基线文件解析失败: ${err.message}，回退至绝对零容忍校验`,
      );
    }
  }

  if (count > 0) {
    console.error(
      `\n❌ [AST Gate] 检测到 ${count} 处未经提取的硬编码数字/字符串！`,
    );
    for (const f of scanResult.findings.slice(0, 20)) {
      console.error(
        `  - [${f.type.toUpperCase()}] ${f.file}:${f.line}:${f.column} => \`${f.value}\` in "${f.context}"`,
      );
    }
    if (count > 20) {
      console.error(
        `  ... 还有 ${count - 20} 处未显示，请运行 npm run audit:magic 生成基线或查看完整报告。`,
      );
    }
    process.exit(1);
  } else {
    console.log(`\n✅ [AST Gate] 校验通过：全仓无未经提取的硬编码值！`);
    process.exit(0);
  }
} else if (isJsonMode) {
  console.log(JSON.stringify(report.jsonData, null, 2));
} else {
  // 默认写出报告
  const dataDir = path.join(REPO_ROOT, '.data');
  const docsDir = path.join(REPO_ROOT, 'docs');
  const auditDir = path.join(REPO_ROOT, 'tools/audit');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const jsonContent = JSON.stringify(report.jsonData, null, 2);
  const jsonPath = path.join(dataDir, 'audit-magic-literals.json');
  const baselinePath = path.join(auditDir, 'baseline-magic-literals.json');
  const mdPath = path.join(docsDir, 'audit-magic-literals-report.md');

  fs.writeFileSync(jsonPath, jsonContent, 'utf-8');
  fs.writeFileSync(baselinePath, jsonContent, 'utf-8');
  fs.writeFileSync(mdPath, report.md, 'utf-8');

  console.log(`\n======================================================`);
  console.log(`📊 扫描盘点完成！统计结果：`);
  console.log(`- 扫描源码文件：${scanResult.scannedFilesCount} 个`);
  console.log(`- 检出硬编码总量：${scanResult.findings.length} 处`);
  console.log(`  * 数字类：${report.jsonData.summary.numberFindings} 处`);
  console.log(`  * 字符串类：${report.jsonData.summary.stringFindings} 处`);
  console.log(
    `- 结构化 JSON 报告已持久化至：.data/audit-magic-literals.json & tools/audit/baseline-magic-literals.json`,
  );
  console.log(
    `- Markdown 盘点汇总报告已生成至：docs/audit-magic-literals-report.md`,
  );
  console.log(`======================================================\n`);
}
