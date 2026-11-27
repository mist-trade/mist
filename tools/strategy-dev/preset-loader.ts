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

export interface LegacyPresetMeta {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly kind: 'decision_flow';
  readonly status: 'active';
  readonly periods: number[];
  readonly targetUniverse?: string[];
  readonly version: string;
  readonly requiredBarCount?: number;
  readonly surveillancePeriods?: readonly number[];
}

export interface LegacyPresetConfig {
  readonly flow: DecisionFlowNode;
  readonly requiredBarCount?: number;
  readonly surveillancePeriods?: readonly number[];
}

interface PresetFileShape {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly legacyDefinitionId?: unknown;
  readonly decisionFlow?: unknown;
  readonly description?: unknown;
  readonly kind?: unknown;
  readonly status?: unknown;
  readonly supportedPeriods?: unknown;
  readonly targetUniverse?: unknown;
  readonly version?: unknown;
  readonly requiredBarCount?: unknown;
  readonly surveillancePeriods?: unknown;
}

let presetIndex: Map<number, DecisionFlowNode> | null = null;
let presetMetaIndex: Map<number, LegacyPresetMeta> | null = null;

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

function buildIndex(): {
  flows: Map<number, DecisionFlowNode>;
  metas: Map<number, LegacyPresetMeta>;
} {
  const flows = new Map<number, DecisionFlowNode>();
  const metas = new Map<number, LegacyPresetMeta>();
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
      if (!flows.has(legacyId)) {
        flows.set(legacyId, raw.decisionFlow);
        const requiredBarCount =
          typeof raw.requiredBarCount === 'number' &&
          Number.isSafeInteger(raw.requiredBarCount) &&
          raw.requiredBarCount > 0
            ? raw.requiredBarCount
            : undefined;
        const surveillancePeriods = Array.isArray(raw.surveillancePeriods)
          ? raw.surveillancePeriods.filter(
              (p): p is number =>
                typeof p === 'number' && Number.isSafeInteger(p) && p > 0,
            )
          : undefined;
        metas.set(legacyId, {
          id: legacyId,
          name:
            typeof raw.name === 'string' ? raw.name : `策略预设 #${legacyId}`,
          description:
            typeof raw.description === 'string' ? raw.description : '',
          kind: 'decision_flow',
          status: 'active',
          periods: Array.isArray(raw.supportedPeriods)
            ? raw.supportedPeriods.filter(
                (p): p is number => typeof p === 'number',
              )
            : [5, 15, 30, 60, 1440],
          targetUniverse: Array.isArray(raw.targetUniverse)
            ? raw.targetUniverse.filter(
                (t): t is string => typeof t === 'string',
              )
            : ['000001'],
          version: typeof raw.version === 'string' ? raw.version : '1.0.0',
          ...(requiredBarCount !== undefined ? { requiredBarCount } : {}),
          ...(surveillancePeriods && surveillancePeriods.length > 0
            ? { surveillancePeriods }
            : {}),
        });
      }
    }
  }
  return { flows, metas };
}

function ensureIndexBuilt(): void {
  if (!presetIndex || !presetMetaIndex) {
    const { flows, metas } = buildIndex();
    presetIndex = flows;
    presetMetaIndex = metas;
  }
}

/** 按内置预设编号解析决策流树；未命中返回 null，由调用方决定 fail-closed 还是兜底。 */
export function loadLegacyPresetFlow(
  definitionId: number,
): DecisionFlowNode | null {
  ensureIndexBuilt();
  return presetIndex!.get(definitionId) ?? null;
}

/** 按内置预设编号解析决策流及预算/监控周期元数据；未命中返回 null。 */
export function loadLegacyPresetConfig(
  definitionId: number,
): LegacyPresetConfig | null {
  ensureIndexBuilt();
  const flow = presetIndex!.get(definitionId);
  if (!flow) return null;
  const meta = presetMetaIndex!.get(definitionId);
  return {
    flow,
    ...(meta?.requiredBarCount !== undefined
      ? { requiredBarCount: meta.requiredBarCount }
      : {}),
    ...(meta?.surveillancePeriods !== undefined
      ? { surveillancePeriods: meta.surveillancePeriods }
      : {}),
  };
}

/** 获取所有可用的预设策略元信息列表（按 ID 升序排列） */
export function loadLegacyPresetMetas(): readonly LegacyPresetMeta[] {
  ensureIndexBuilt();
  return Array.from(presetMetaIndex!.values()).sort((a, b) => a.id - b.id);
}

export function resetLegacyPresetCache(): void {
  presetIndex = null;
  presetMetaIndex = null;
}

export function legacyPresetDirs(): readonly string[] {
  return presetDirs();
}
