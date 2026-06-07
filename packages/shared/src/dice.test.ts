import { describe, it, expect } from 'vitest';
import { Rng } from './rng.js';
import {
  roll,
  d20,
  doubleDice,
  attackRoll,
  attackRollAdvantage,
  formatRoll,
} from './dice.js';

describe('roll — 解析与范围', () => {
  it('2d6 落在 [2,12]，含两颗骰', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const r = roll(rng, '2d6');
      expect(r.rolls).toHaveLength(2);
      expect(r.total).toBeGreaterThanOrEqual(2);
      expect(r.total).toBeLessThanOrEqual(12);
    }
  });

  it('"d20" 等价 "1d20"', () => {
    const r = roll(new Rng(5), 'd20');
    expect(r.rolls).toHaveLength(1);
  });

  it('带 bonus：total = sum(rolls) + bonus', () => {
    const r = roll(new Rng(3), '3d4', 5);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) + 5);
  });

  it('非法 spec 抛错', () => {
    expect(() => roll(new Rng(1), 'abc')).toThrow();
    expect(() => roll(new Rng(1), '2x6')).toThrow();
  });
});

describe('确定性', () => {
  it('相同种子 => 相同序列', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(d20(a)).toBe(d20(b));
  });

  it('cursor 可保存/恢复，恢复后序列一致', () => {
    const rng = new Rng(7);
    d20(rng);
    d20(rng);
    const saved = rng.cursor;
    const a = [d20(rng), d20(rng), d20(rng)];
    rng.cursor = saved;
    const b = [d20(rng), d20(rng), d20(rng)];
    expect(a).toEqual(b);
  });
});

describe('doubleDice — 5e 暴击', () => {
  it('1d6 → 2d6，2d8 → 4d8', () => {
    expect(doubleDice('1d6')).toBe('2d6');
    expect(doubleDice('d6')).toBe('2d6');
    expect(doubleDice('2d8')).toBe('4d8');
  });
});

describe('attackRoll — 自然20/1', () => {
  it('total = natural + bonus，并正确标记 nat20/nat1', () => {
    // 扫足够多次确保覆盖到 20 和 1
    let saw20 = false;
    let saw1 = false;
    const rng = new Rng(123);
    for (let i = 0; i < 500; i++) {
      const r = attackRoll(rng, 4);
      expect(r.total).toBe(r.natural + 4);
      if (r.natural === 20) {
        expect(r.nat20).toBe(true);
        saw20 = true;
      }
      if (r.natural === 1) {
        expect(r.nat1).toBe(true);
        saw1 = true;
      }
    }
    expect(saw20 && saw1).toBe(true);
  });

  it('优势取高、劣势取低（统计上优势均值更高）', () => {
    const adv = new Rng(1);
    const dis = new Rng(1);
    let advSum = 0;
    let disSum = 0;
    for (let i = 0; i < 300; i++) {
      advSum += attackRollAdvantage(adv, 0, 'adv').natural;
      disSum += attackRollAdvantage(dis, 0, 'dis').natural;
    }
    expect(advSum).toBeGreaterThan(disSum);
  });
});

describe('formatRoll', () => {
  it('渲染成跑团风片段', () => {
    expect(formatRoll({ spec: '2d6', rolls: [5, 6], bonus: 3, total: 14 })).toBe('[5,6]+3 = 14');
    expect(formatRoll({ spec: '1d6', rolls: [4], bonus: 0, total: 4 })).toBe('[4] = 4');
    expect(formatRoll({ spec: '1d6', rolls: [4], bonus: -2, total: 2 })).toBe('[4]-2 = 2');
  });
});
