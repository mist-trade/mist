// mist/tools/smoke/lib/yaml-loader.mjs
// 解析 inventory.yaml：注入 defaults、拓扑排序 prereq、解析 _from_prereq_response 占位。

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// inventory.yaml 相对于本文件的路径：mist/tools/smoke/lib/ -> mist-deploy/smoke/inventory.yaml
const INVENTORY_PATH = resolve(
  __dirname,
  '../../../../mist-deploy/smoke/inventory.yaml',
);

/**
 * @typedef {Object} SmokeEndpoint
 * @property {string} id
 * @property {string} repo - 'mist' | 'mist-datasource'
 * @property {string} method - GET|POST|PUT|DELETE
 * @property {string} path
 * @property {Object} [body]
 * @property {string[]} [prereq]
 * @property {boolean} [skip]
 * @property {Object} expect
 */

/**
 * 读 inventory.yaml，注入 defaults，按 repo 过滤，返回拓扑排序后的端点列表。
 * @param {Object} opts
 * @param {string} opts.repo - 'mist' | 'mist-datasource'
 * @param {Object} [opts.baseOverride] - 覆盖默认 base url
 * @returns {SmokeEndpoint[]}
 */
export function loadInventory({ repo, baseOverride = {} }) {
  const raw = readFileSync(INVENTORY_PATH, 'utf8');
  const doc = parse(raw);
  const defaults = doc.defaults || {};

  const base =
    baseOverride.base ||
    (repo === 'mist' ? defaults.mist_base : defaults.datasource_base);

  let endpoints = (doc.endpoints || []).filter(
    (e) => e.repo === repo && !e.skip,
  );

  // 注入完整 url
  endpoints = endpoints.map((e) => ({ ...e, url: base + e.path }));

  // 拓扑排序（按 prereq）
  endpoints = topoSort(endpoints);

  return endpoints;
}

/**
 * 拓扑排序：确保 prereq 中的 id 排在前面。
 * skip 的端点不参与执行但可作为 prereq 来源（runner 跳过它时记录占位响应）。
 * 这里只对非 skip 的排序；若 prereq 指向被 skip 的 id，runner 在运行时记录并复用其响应。
 */
function topoSort(endpoints) {
  const byId = new Map(endpoints.map((e) => [e.id, e]));
  const visited = new Set();
  const result = [];

  function visit(ep) {
    if (visited.has(ep.id)) return;
    visited.add(ep.id);
    for (const depId of ep.prereq || []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    result.push(ep);
  }

  // 先按原顺序 visit，保持稳定
  for (const ep of endpoints) visit(ep);
  return result;
}

/**
 * 解析 body 中的 _from_prereq_response 占位符，用已执行的响应数据填充。
 *
 * 支持两种 inventory 写法：
 *
 * 1. 顶层占位（整个 body 从 prereq 响应派生）：
 *    body: { _from_prereq_response: { prereq: 'security_get_sources', take_first: [id, securityId] } }
 *    -> { id: <responses.get('security_get_sources')[0].id>, securityId: <...[0].securityId> }
 *
 * 2. 嵌套占位（body 的某个 key 从 prereq 派生，key 名须在 take_first 中）：
 *    body: { id: { _from_prereq_response: { prereq: 'x', take_first: ['id'] } }, foo: 'bar' }
 *    -> { id: <...>, foo: 'bar' }
 *
 * @param {Object} body
 * @param {Map<string, any>} responses - 已执行端点的 data（按 id 索引）
 * @returns {Object} 填充后的 body
 */
export function resolveBodyPlaceholders(body, responses) {
  if (!body || typeof body !== 'object') return body;

  // 形状 1：body 本身就是顶层占位
  if (body._from_prereq_response) {
    const { prereq, take_first = [] } = body._from_prereq_response;
    const prereqData = responses.get(prereq);
    if (!Array.isArray(prereqData) || prereqData.length === 0) return {};
    const first = prereqData[0];
    const out = {};
    for (const field of take_first) {
      if (first && typeof first === 'object' && field in first)
        out[field] = first[field];
    }
    return out;
  }

  // 形状 2：body 的某些 key 是嵌套占位
  const out = {};
  for (const [key, val] of Object.entries(body)) {
    if (val && typeof val === 'object' && val._from_prereq_response) {
      const { prereq, take_first = [] } = val._from_prereq_response;
      const prereqData = responses.get(prereq);
      if (
        Array.isArray(prereqData) &&
        prereqData.length > 0 &&
        take_first.includes(key)
      ) {
        const first = prereqData[0];
        if (first && typeof first === 'object' && key in first)
          out[key] = first[key];
      }
      // 若取不到，保持 undefined（runner 会报告"prereq 数据不足"）
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = resolveBodyPlaceholders(val, responses);
    } else {
      out[key] = val;
    }
  }
  return out;
}
