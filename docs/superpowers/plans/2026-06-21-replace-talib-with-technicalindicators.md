# Replace Talib With Technicalindicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Windows-native `talib` dependency while preserving the existing indicator service API used by indicator controllers and Chan Theory flows.

**Architecture:** Replace the `talib.execute(...)` adapter in `IndicatorService` with direct calls to `technicalindicators`. Keep public service method names, return field names, and `begIndex` alignment semantics unchanged so `formatIndicator(...)` continues to map sparse leading values to `NaN`.

**Tech Stack:** NestJS, TypeScript, Jest, pnpm, `technicalindicators`.

---

### Task 1: Lock Indicator Return Contracts

**Files:**

- Modify: `apps/mist/src/indicator/indicator.service.spec.ts`

- [x] **Step 1: Write failing tests**

Add tests that call `runMACD`, `runRSI`, `runKDJ`, `runADX`, `runDualMA`, and `runATR` and assert their existing return shapes:

```ts
expect(macd).toEqual({
  begIndex: expect.any(Number),
  nbElement: macd.macd.length,
  macd: expect.any(Array),
  signal: expect.any(Array),
  histogram: expect.any(Array),
});
expect(macd.macd.length).toBe(macd.signal.length);
expect(macd.signal.length).toBe(macd.histogram.length);
```

The tests must also assert that `runKDJ` returns `K`, `D`, and `J` arrays with identical lengths and that `runRSI` keeps `begIndex` equal to the configured period.

- [x] **Step 2: Run tests to verify RED**

Run: `PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm test -- indicator.service.spec.ts --runInBand --no-watchman`

Expected: at least one test fails because the current spec still exercises fallback behavior instead of the non-native indicator contract.

### Task 2: Replace Native Indicator Engine

**Files:**

- Modify: `apps/mist/src/indicator/indicator.service.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Swap dependencies**

Run: `PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm remove talib && PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm add technicalindicators@3.1.0`

Expected: `package.json` removes `talib` and adds `technicalindicators`; the lockfile no longer contains `talib@`.

- [x] **Step 2: Implement the adapter**

Import `MACD`, `RSI`, `Stochastic`, `ADX`, `SMA`, and `ATR` from `technicalindicators`. Remove runtime `require('talib')`, `initTalib`, and fallback helpers. Keep these public method outputs unchanged:

```ts
runMACD(prices): { begIndex, nbElement, macd, signal, histogram }
runRSI(prices, period): { begIndex, nbElement, rsi }
runKDJ(data): { begIndex, nbElement, K, D, J }
runADX(data): number[]
runDualMA(data): { shortMA, longMA }
runATR(data): number[]
```

For direct array-returning methods, continue returning only the computed indicator values. For controller-aligned methods, compute `begIndex` from the input length and output length.

- [x] **Step 3: Run tests to verify GREEN**

Run: `PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm test -- indicator.service.spec.ts --runInBand --no-watchman`

Expected: PASS.

### Task 3: Update Appliance Build Design

**Files:**

- Modify: `.github/workflows/windows-appliance.yml`
- Modify: `openspec/changes/package-windows-api-appliance/design.md`

- [x] **Step 1: Remove native-build assumptions**

Remove `npm_config_msvs_version` and Python setup from the backend Node dependency path if no remaining backend dependency needs native compilation. Keep Python only for `mist-datasource` and uv.

- [x] **Step 2: Update OpenSpec**

Change the dependency strategy from native `talib` fallback to pure JavaScript `technicalindicators`. State that service output contracts stay stable for indicator and Chan Theory consumers.

- [x] **Step 3: Validate workflow and OpenSpec**

Run:

```bash
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH node -e "const fs=require('fs'); const yaml=require('yaml'); yaml.parse(fs.readFileSync('.github/workflows/windows-appliance.yml','utf8')); console.log('yaml ok')"
PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH openspec validate package-windows-api-appliance --strict
```

Expected: both commands pass.

### Task 4: Full Verification

**Files:**

- Read: changed files from Tasks 1-3

- [x] **Step 1: Build**

Run: `PATH=/Users/moyui/.nvm/versions/node/v22.12.0/bin:$PATH pnpm run build`

Expected: build completes successfully.

- [x] **Step 2: Check dependency removal**

Run: `rg -n "talib|fallback indicator|native talib|MSBuild 14.0" package.json pnpm-lock.yaml apps/mist/src/indicator openspec/changes/package-windows-api-appliance .github/workflows/windows-appliance.yml`

Expected: no production dependency or design path still depends on `talib` or fallback indicators.
