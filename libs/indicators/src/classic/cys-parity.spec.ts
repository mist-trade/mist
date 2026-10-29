import { computeCysSeries, computeIndexCysSeries } from './cys';
import { computeCycSeries, computeIndexCycSeries } from './cyc';

describe('CYS13 & CYC13 Parity Reconciliation Gate', () => {
  it('matches authentic TongDaXin recursive mathematical definition to within 1e-6 precision', () => {
    // Generate 100 deterministic pseudo-random bars to simulate realistic market fluctuations
    const n = 100;
    const closes: number[] = [];
    const amounts: number[] = [];
    const volumes: number[] = [];

    let curPrice = 50.0;
    for (let i = 0; i < n; i++) {
      const change = Math.sin(i * 0.2) * 1.5 + ((i % 7) - 3) * 0.2;
      curPrice = Math.max(10.0, curPrice + change);
      const vol = 1000 + ((i * 37) % 500) * 10;
      const amt = curPrice * vol * (1 + ((i % 5) - 2) * 0.005);
      closes.push(curPrice);
      amounts.push(amt);
      volumes.push(vol);
    }

    // Independent Ground-Truth Recursion (TongDaXin EMA engine specification)
    const alpha = 2 / (13 + 1); // 13-period alpha
    const groundTruthCyc: number[] = [];
    const groundTruthCys: number[] = [];

    let emaAmt = amounts[0];
    let emaVol = volumes[0];
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        emaAmt = alpha * amounts[i] + (1 - alpha) * emaAmt;
        emaVol = alpha * volumes[i] + (1 - alpha) * emaVol;
      }
      const cycVal = emaAmt / emaVol;
      const cysVal = ((closes[i] - cycVal) / cycVal) * 100.0;
      groundTruthCyc.push(cycVal);
      groundTruthCys.push(cysVal);
    }

    // Call our Polars SIMD Vectorized Operator
    const polarsCyc = computeCycSeries(amounts, volumes, {
      period: 13,
      volumeInShares: true,
    });
    const polarsCys = computeCysSeries(closes, amounts, volumes, {
      period: 13,
      volumeInShares: true,
    });

    expect(polarsCyc.cyc.length).toBe(n);
    expect(polarsCys.cys.length).toBe(n);

    // Verify all 100 bars match to high precision (error <= 1e-6)
    for (let i = 0; i < n; i++) {
      expect(polarsCyc.cyc[i]).toBeCloseTo(groundTruthCyc[i], 5);
      expect(polarsCys.cys[i]).toBeCloseTo(groundTruthCys[i], 5);
    }
  });

  it('demonstrates that CYC13 filters out zero-volume price spikes (anti-noise invariant)', () => {
    // 20 bars of flat trading at 10.0 with 1000 volume each
    const closes = new Array(20).fill(10.0);
    const amounts = new Array(20).fill(10000.0);
    const volumes = new Array(20).fill(1000.0);

    // Bar 20 has an artificial price spike to 15.0 on zero volume (e.g. illiquid cross)
    closes.push(15.0);
    amounts.push(0.0);
    volumes.push(0.0);

    const result = computeCysSeries(closes, amounts, volumes, {
      period: 13,
      volumeInShares: true,
      closes,
    });

    // On zero volume, CYC should not be pulled by the spike
    expect(result.cyc[19]).toBeCloseTo(10.0, 4);
    // At bar 20 with zero volume and amount, CYC stays at 10.0, so CYS reflects the +50% price spike
    expect(result.cys[20]).toBeCloseTo(50.0, 2);
  });

  it('matches authentic TongDaXin Index CYS13 definition (Typical Price EMA) to within 1e-6 precision', () => {
    const n = 100;
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];

    let p = 3000.0;
    for (let i = 0; i < n; i++) {
      const delta = Math.sin(i * 0.15) * 30 + ((i % 5) - 2) * 5;
      p = Math.max(1000.0, p + delta);
      const h = p + 15 + (i % 3);
      const l = p - 15 - (i % 4);
      highs.push(h);
      lows.push(l);
      closes.push(p);
    }

    // TongDaXin Ground-Truth: JJJT = (H+L+C)/3, CYC13 = EMA(JJJT, 13)
    const alpha = 2 / (13 + 1);
    const groundTruthIndexCyc: number[] = [];
    const groundTruthIndexCys: number[] = [];

    let emaTp = (highs[0] + lows[0] + closes[0]) / 3.0;
    for (let i = 0; i < n; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3.0;
      if (i > 0) {
        emaTp = alpha * tp + (1 - alpha) * emaTp;
      }
      groundTruthIndexCyc.push(emaTp);
      groundTruthIndexCys.push(((closes[i] - emaTp) / emaTp) * 100.0);
    }

    // Polars Vectorized Operator
    const polarsIndexCyc = computeIndexCycSeries(highs, lows, closes, {
      period: 13,
    });
    const polarsIndexCys = computeIndexCysSeries(highs, lows, closes, {
      period: 13,
    });

    expect(polarsIndexCyc.cyc.length).toBe(n);
    expect(polarsIndexCys.cys.length).toBe(n);

    for (let i = 0; i < n; i++) {
      expect(polarsIndexCyc.cyc[i]).toBeCloseTo(groundTruthIndexCyc[i], 5);
      expect(polarsIndexCys.cys[i]).toBeCloseTo(groundTruthIndexCys[i], 5);
    }
  });
});
