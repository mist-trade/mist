import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DecisionFlowNode } from '../../libs/strategy/src/decision-flow/decision-flow.types';
import { PRIVATE_DATA_DIR } from './provider';

/**
 * 内置预设目录优先级（先命中先得）：
 * 1. `MIST_TACTICAL_PRESETS_DIR`（显式覆盖）
 * 2. 私有仓 `market-data/presets`（策略树与参数属私有资产）
 * 3. 开源仓 `tools/strategy-dev/data/presets`（仅纯公开预设，如纯原典缠论）
 */
const PUBLIC_PRESET_DIR = path.join(__dirname, 'data', 'presets');
const PRIVATE_PRESET_DIR = path.join(PRIVATE_DATA_DIR, 'presets');
const PRESET_DIR_ENV_KEY = 'MIST_TACTICAL_PRESETS_DIR';

interface PresetFileShape {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly legacyDefinitionId?: unknown;
  readonly decisionFlow?: unknown;
}

let presetIndex: Map<number, DecisionFlowNode> | null = null;

function isDecisionFlowNode(value: unknown): value is DecisionFlowNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === 'string' && typeof node.type === 'string';
}

function presetDirs(): readonly string[] {
  const dirs: string[] = [];
  const override = process.env[PRESET_DIR_ENV_KEY];
  if (override && override.trim().length > 0) {
    dirs.push(override.trim());
  }
  dirs.push(PRIVATE_PRESET_DIR, PUBLIC_PRESET_DIR);
  return [...new Set(dirs)];
}

function buildIndex(): Map<number, DecisionFlowNode> {
  const index = new Map<number, DecisionFlowNode>();
  for (const dir of presetDirs()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort();
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let raw: PresetFileShape;
      try {
        raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as PresetFileShape;
      } catch (error) {
        throw new Error(
          `preset file ${fullPath} is not valid JSON: ${(error as Error).message}`,
        );
      }
      const legacyId = raw.legacyDefinitionId;
      if (typeof legacyId !== 'number') continue;
      if (!isDecisionFlowNode(raw.decisionFlow)) {
        throw new Error(
          `preset file ${fullPath} declares legacyDefinitionId=${legacyId} but has no decisionFlow`,
        );
      }
      if (!index.has(legacyId)) {
        index.set(legacyId, raw.decisionFlow);
      }
    }
  }
  return index;
}

/** 按内置预设编号解析决策流树；未命中返回 null，由调用方决定 fail-closed 还是兜底。 */
export function loadLegacyPresetFlow(
  definitionId: number,
): DecisionFlowNode | null {
  if (!presetIndex) presetIndex = buildIndex();
  return presetIndex.get(definitionId) ?? null;
}

export function resetLegacyPresetCache(): void {
  presetIndex = null;
}

export function legacyPresetDirs(): readonly string[] {
  return presetDirs();
}
