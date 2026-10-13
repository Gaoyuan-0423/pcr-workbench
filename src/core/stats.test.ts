import { describe, expect, it } from 'vitest';
import {
  betaInc,
  fCdf,
  mean,
  oneWayAnova,
  sd,
  significanceStars,
  studentTCdf,
  welchTTest,
} from './stats';

describe('基础统计量', () => {
  it('均值与样本标准差对照手算值', () => {
    expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(sd([3])).toBeNaN();
  });
});

describe('t 分布累积概率（对照统计表）', () => {
  it('t=2.228139, df=10 → CDF=0.975', () => {
    expect(studentTCdf(2.228138852, 10)).toBeCloseTo(0.975, 5);
  });
  it('t=1.812461, df=10 → CDF=0.95', () => {
    expect(studentTCdf(1.812461123, 10)).toBeCloseTo(0.95, 5);
  });
  it('对称性：CDF(-t) = 1 - CDF(t)', () => {
    const t = 1.5;
    expect(studentTCdf(-t, 8)).toBeCloseTo(1 - studentTCdf(t, 8), 10);
  });
});

describe('F 分布累积概率（对照统计表）', () => {
  it('F=3.238872, df=3/16 → CDF=0.95', () => {
    expect(fCdf(3.238871524, 3, 16)).toBeCloseTo(0.95, 4);
  });
  it('F=4.256495, df=2/9 → CDF=0.95', () => {
    expect(fCdf(4.256494711, 2, 9)).toBeCloseTo(0.95, 4);
  });
});

describe('不完全贝塔函数', () => {
  it('I_x(2,3) 对照积分值', () => {
    // I_0.5(2,3) = 0.6875（多项式可手算验证）
    expect(betaInc(2, 3, 0.5)).toBeCloseTo(0.6875, 6);
    expect(betaInc(2, 3, 0)).toBe(0);
    expect(betaInc(2, 3, 1)).toBe(1);
  });
});

describe('Welch t 检验', () => {
  it('相同分布两组 → p 大', () => {
    const a = [1.2, 0.9, 1.1, 1.0, 1.3];
    const b = [1.1, 0.8, 1.2, 1.0, 0.9];
    const r = welchTTest(a, b);
    expect(r.p).toBeGreaterThan(0.3);
  });
  it('明显偏移两组 → p 极小，交换两组 p 不变', () => {
    const a = [1.0, 1.1, 0.9, 1.05, 0.95];
    const b = [2.0, 2.1, 1.9, 2.05, 2.15];
    const r1 = welchTTest(a, b);
    const r2 = welchTTest(b, a);
    expect(r1.p).toBeLessThan(0.001);
    expect(r1.p).toBeCloseTo(r2.p, 10);
  });
  it('样本不足 → NaN', () => {
    expect(Number.isNaN(welchTTest([1], [1, 2, 3]).p)).toBe(true);
  });
});

describe('单因素 ANOVA', () => {
  it('组间差异大 → p 小', () => {
    const r = oneWayAnova([
      [1, 1.1, 0.9],
      [2, 2.1, 1.9],
      [3, 3.1, 2.9],
    ]);
    expect(r.p).toBeLessThan(0.01);
    expect(r.df1).toBe(2);
    expect(r.df2).toBe(6);
  });
  it('组间无差异 → p 接近 1', () => {
    const r = oneWayAnova([
      [1, 2, 3],
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(r.p).toBe(1);
  });
});

describe('显著性星号', () => {
  it('阈值分级', () => {
    expect(significanceStars(0.0001)).toBe('***');
    expect(significanceStars(0.005)).toBe('**');
    expect(significanceStars(0.03)).toBe('*');
    expect(significanceStars(0.2)).toBe('ns');
    expect(significanceStars(null)).toBe('');
  });
});
