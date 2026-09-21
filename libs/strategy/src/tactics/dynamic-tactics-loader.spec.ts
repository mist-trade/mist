import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DynamicTacticsLoader } from './dynamic-tactics-loader';
import {
  ChanTacticsContext,
  TacticalAction,
  TacticalQuadrant,
} from './contracts/chan-four-quadrant-tactics.interface';

describe('DynamicTacticsLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    DynamicTacticsLoader.resetConfiguration();
  });

  afterEach(() => {
    DynamicTacticsLoader.resetConfiguration();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to StandardChanTactics when disabled', () => {
    DynamicTacticsLoader.setDisabled(true);
    const tactics = DynamicTacticsLoader.reloadTactics();
    expect(tactics.id).toBe('standard-chan-tactics');
    expect(tactics.name).toBe('Standard Chan Baseline Tactics');

    const meta = DynamicTacticsLoader.getActiveMetadata();
    expect(meta.isPrivate).toBe(false);

    const dummyCtx: ChanTacticsContext = {
      symbol: '000001',
      period: 30,
      klines: [],
      bis: [],
      zhongshus: [],
      timestamp: new Date(),
    };

    const leftBuy = tactics.evaluateLeftBuy(dummyCtx);
    expect(leftBuy.triggered).toBe(false);
    expect(leftBuy.quadrant).toBe(TacticalQuadrant.LeftBuy);
  });

  it('dynamically loads the workspace private tactics when present, or falls back to standard', () => {
    const tactics = DynamicTacticsLoader.reloadTactics();
    const meta = DynamicTacticsLoader.getActiveMetadata();
    const hasLocalPrivate = fs.existsSync(path.join(__dirname, 'private'));

    if (hasLocalPrivate) {
      expect(meta.isPrivate).toBe(true);
      expect(tactics.id).toBe('mist-alpha-core');
      expect(tactics.name).toBe('Mist Private Alpha & Four-Quadrant Tactics');
    } else {
      expect(meta.isPrivate).toBe(false);
      expect(tactics.id).toBe('standard-chan-tactics');
    }
  });

  it('dynamically loads private tactics when custom candidate paths contain a secret tactics module', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-tactics-test-'));
    const privateFile = path.join(tempDir, 'my-secret-tactics.js');

    const code = `
      class MySecretTactics {
        constructor() {
          this.id = 'my-secret-alpha';
          this.name = 'Legendary Four-Quadrant Edge';
          this.version = '2.0.0';
          this.author = 'Anonymous Master';
        }
        evaluateLeftBuy(ctx) {
          return {
            triggered: true,
            quadrant: 'left_buy',
            price: 18.88,
            time: ctx.timestamp,
            confidence: 99,
            action: 'open_long',
            reason: '底分型确立且次级别MACD突破0轴'
          };
        }
        evaluateRightBuy(ctx) {
          return {
            triggered: false,
            quadrant: 'right_buy',
            price: 0,
            time: ctx.timestamp,
            confidence: 0,
            action: 'none',
            reason: '无二买'
          };
        }
        evaluateLeftSell(ctx) {
          return {
            triggered: false,
            quadrant: 'left_sell',
            price: 0,
            time: ctx.timestamp,
            confidence: 0,
            action: 'none',
            reason: '未见顶'
          };
        }
        evaluateRightSell(ctx) {
          return {
            triggered: false,
            quadrant: 'right_sell',
            price: 0,
            time: ctx.timestamp,
            confidence: 0,
            action: 'none',
            reason: '未破位'
          };
        }
      }
      module.exports = { MySecretTactics };
    `;
    fs.writeFileSync(privateFile, code, 'utf-8');

    DynamicTacticsLoader.setCustomPaths([privateFile]);
    const tactics = DynamicTacticsLoader.reloadTactics();

    expect(tactics.id).toBe('my-secret-alpha');
    expect(tactics.name).toBe('Legendary Four-Quadrant Edge');

    const meta = DynamicTacticsLoader.getActiveMetadata();
    expect(meta.isPrivate).toBe(true);
    expect(meta.loadedFromPath).toBe(privateFile);

    const dummyCtx: ChanTacticsContext = {
      symbol: '000001',
      period: 30,
      subPeriod: 5,
      klines: [],
      bis: [],
      zhongshus: [],
      timestamp: new Date('2026-09-21T10:00:00.000Z'),
    };

    const leftBuy = tactics.evaluateLeftBuy(dummyCtx);
    expect(leftBuy.triggered).toBe(true);
    expect(leftBuy.price).toBe(18.88);
    expect(leftBuy.confidence).toBe(99);
    expect(leftBuy.action).toBe(TacticalAction.OpenLong);
    expect(leftBuy.reason).toContain('底分型确立且次级别MACD突破0轴');
  });

  it('safely falls back if the private module throws or is invalid', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mist-tactics-broken-'));
    const brokenFile = path.join(tempDir, 'my-secret-tactics.js');
    fs.writeFileSync(brokenFile, 'module.exports = { Invalid: 123 };', 'utf-8');

    DynamicTacticsLoader.setCustomPaths([brokenFile]);
    const tactics = DynamicTacticsLoader.reloadTactics();

    expect(tactics.id).toBe('standard-chan-tactics');
    const meta = DynamicTacticsLoader.getActiveMetadata();
    expect(meta.isPrivate).toBe(false);
  });
});
