// mist/tools/smoke/lib/assertions.mjs
// 形状级断言：status / envelope / data_shape / data_fields（required/optional）

/**
 * 单条断言结果
 * @typedef {Object} AssertionResult
 * @property {boolean} passed
 * @property {string} message
 */

/**
 * 对一个 HTTP 响应做形状级断言。
 * @param {number} status
 * @param {any} body - 解析后的 JSON body
 * @param {Object} expect
 * @param {number} expect.status
 * @param {Object} [expect.envelope] - 如 {success: true}
 * @param {string} [expect.data_shape] - 'array'|'object'|'scalar'|'null'|'any'
 * @param {Object} [expect.data_fields] - {required: [], optional: []}
 * @returns {AssertionResult[]}
 */
export function assertResponse(status, body, expect) {
  const results = [];

  // 1. status
  const wantStatus = expect.status || 200;
  results.push({
    passed: status === wantStatus,
    message: `status: got ${status}, want ${wantStatus}`,
  });

  // envelope 字段（只校验指定的子集，如 {success: true}）
  if (expect.envelope) {
    for (const [k, v] of Object.entries(expect.envelope)) {
      const got = body?.[k];
      results.push({
        passed: got === v,
        message: `envelope.${k}: got ${JSON.stringify(got)}, want ${JSON.stringify(v)}`,
      });
    }
  }

  const data = body?.data;

  // 2. data_shape
  if (expect.data_shape) {
    const shape = expect.data_shape;
    let actualShape;
    if (data === null || data === undefined) actualShape = 'null';
    else if (Array.isArray(data)) actualShape = 'array';
    else if (typeof data === 'object') actualShape = 'object';
    else actualShape = 'scalar';
    const ok = shape === 'any' || shape === actualShape;
    results.push({
      passed: ok,
      message: `data_shape: got ${actualShape}, want ${shape}`,
    });
  }

  // 3. data_fields（只对 object/array 有意义）
  if (
    expect.data_fields &&
    (Array.isArray(data) || (typeof data === 'object' && data !== null))
  ) {
    const items = Array.isArray(data) ? data : [data];
    const { required = [], optional = [] } = expect.data_fields;

    // required：每个 item 都必须有这些字段
    for (const item of items) {
      for (const f of required) {
        const has = item !== null && typeof item === 'object' && f in item;
        results.push({
          passed: has,
          message: `data_fields.required.${f}: ${has ? 'present' : 'MISSING'}`,
        });
      }
      // optional：存在则记录类型，缺失不报错
      for (const f of optional) {
        const has = item !== null && typeof item === 'object' && f in item;
        // optional 字段不产生失败断言，只在报告中标注（passed: true）
        results.push({
          passed: true,
          message: `data_fields.optional.${f}: ${has ? 'present' : 'absent (ok)'}`,
        });
      }
    }
  }

  return results;
}
