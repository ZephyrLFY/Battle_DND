import { describe, it, expect } from 'vitest';
import {
  computeStats,
  speciesType,
  expToLevelUp,
  expGainFor,
  SPECIES_NAMES,
  MAX_LEVEL,
} from './pokemon.js';

describe('computeStats — 1 级基础值（对照原版 changetype 出生修正）', () => {
  // 原版 BASE: atk15 def7 hp300 interval1.0
  it('str 型 1 级：atk19 def5 hp300 interval1.0', () => {
    const s = computeStats('Hitmonlee', 1);
    expect(s).toMatchObject({ atk: 19, def: 5, hp: 300, fullHp: 300, interval: 1.0 });
  });

  it('fat 型 1 级：atk14 def8 hp320', () => {
    const s = computeStats('Muk', 1);
    expect(s).toMatchObject({ atk: 14, def: 8, hp: 320, fullHp: 320, interval: 1.0 });
  });

  it('def 型 1 级：atk13 def10 hp300', () => {
    const s = computeStats('Onix', 1);
    expect(s).toMatchObject({ atk: 13, def: 10, hp: 300, interval: 1.0 });
  });

  it('agi 型 1 级：atk16 def6 hp300 interval0.9', () => {
    const s = computeStats('Pikachu', 1);
    expect(s).toMatchObject({ atk: 16, def: 6, hp: 300, interval: 0.9 });
  });
});

describe('computeStats — 成长（新版平衡后的每级增量）', () => {
  it('str 型 2 级 = 1 级 + (atk12 def5 hp60)', () => {
    const s = computeStats('Hitmonlee', 2);
    expect(s).toMatchObject({ atk: 19 + 12, def: 5 + 5, hp: 300 + 60 });
  });

  it('agi 型攻速随等级递减 0.03/级', () => {
    const l1 = computeStats('Pikachu', 1).interval;
    const l5 = computeStats('Pikachu', 5).interval;
    expect(l1 - l5).toBeCloseTo(0.03 * 4, 5);
  });

  it('满级被 clamp 在 15', () => {
    const at15 = computeStats('Onix', 15);
    const at99 = computeStats('Onix', 99);
    expect(at99).toEqual(at15);
  });
});

describe('类型与经验公式（对照原版 gain/upornot）', () => {
  it('全部 12 只精灵都有合法类型', () => {
    expect(SPECIES_NAMES).toHaveLength(12);
    for (const name of SPECIES_NAMES) {
      expect(['str', 'fat', 'def', 'agi']).toContain(speciesType(name));
    }
  });

  it('升级所需经验 = 5*level（原版）', () => {
    expect(expToLevelUp(3)).toBe(15);
  });

  it('击败 level 级获得经验 = 10*level（原版）', () => {
    expect(expGainFor(7)).toBe(70);
  });

  it('MAX_LEVEL 为 15', () => {
    expect(MAX_LEVEL).toBe(15);
  });
});
