import { describe, it, expect } from 'vitest';
import {
  abilityMod,
  proficiency,
  deriveStats,
  newCombatant,
  statsOf,
  abilitiesOf,
  MAX_LEVEL,
  expToLevelUp,
  expGainFor,
} from './combatant.js';
import { ROSTER, ARCHETYPE_IDS, STARTING_TOTAL } from './roster.js';

describe('abilityMod — 5e 调整值公式', () => {
  it('标准映射', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(12)).toBe(1);
    expect(abilityMod(16)).toBe(3);
    expect(abilityMod(20)).toBe(5);
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(6)).toBe(-2);
  });
});

describe('proficiency — 随等级', () => {
  it('5e 曲线 +2/+3/+4/+5', () => {
    expect(proficiency(1)).toBe(2);
    expect(proficiency(4)).toBe(2);
    expect(proficiency(5)).toBe(3);
    expect(proficiency(9)).toBe(4);
    expect(proficiency(15)).toBe(5);
  });
});

describe('名册 — 公平性', () => {
  it('12 个角色都存在', () => {
    expect(ARCHETYPE_IDS).toHaveLength(12);
  });

  it('每个角色 1 级天赋三属性总和都等于 STARTING_TOTAL(39)', () => {
    for (const id of ARCHETYPE_IDS) {
      const t = ROSTER[id]!.talent;
      expect(t.str + t.dex + t.con).toBe(STARTING_TOTAL);
    }
  });
});

describe('deriveStats — 战斗数值派生', () => {
  it('AC = 10 + DEX_mod + floor(DEX_mod/2)（DEX 加成放大）', () => {
    // DEX16 → mod+3 → AC = 10+3+1 = 14
    expect(deriveStats({ str: 10, dex: 16, con: 10 }, 1).ac).toBe(14);
    // DEX10 → mod0 → AC 10
    expect(deriveStats({ str: 10, dex: 10, con: 10 }, 1).ac).toBe(10);
  });

  it('toHit = STR_mod + PRO', () => {
    // STR16 → +3，Lv5 PRO +3 → toHit 6
    expect(deriveStats({ str: 16, dex: 10, con: 10 }, 5).toHit).toBe(6);
  });

  it('dmgBonus = ceil(STR_mod/2)（STR 伤害减半）', () => {
    // STR30 → mod+10 → dmgBonus ceil(10/2) = 5
    expect(deriveStats({ str: 30, dex: 10, con: 10 }, 1).dmgBonus).toBe(5);
    // STR16 → mod+3 → ceil(3/2) = 2
    expect(deriveStats({ str: 16, dex: 10, con: 10 }, 1).dmgBonus).toBe(2);
  });

  it('maxHp = (8 + CON_mod) * level', () => {
    // CON14 → +2，每级 10 血；Lv3 → 30
    expect(deriveStats({ str: 10, dex: 10, con: 14 }, 3).maxHp).toBe(30);
  });

  it('极低 CON 也保证每级至少 1 血', () => {
    // CON1 → mod -5，8-5=3 仍 >=1；构造 CON 让 8+mod<1
    expect(deriveStats({ str: 10, dex: 10, con: 1 }, 1).maxHp).toBeGreaterThanOrEqual(1);
  });

  it('maxEnergy = 3 + floor(level/4)', () => {
    const ab = { str: 10, dex: 10, con: 10 };
    expect(deriveStats(ab, 1).maxEnergy).toBe(3);
    expect(deriveStats(ab, 4).maxEnergy).toBe(4);
    expect(deriveStats(ab, 8).maxEnergy).toBe(5);
    expect(deriveStats(ab, 15).maxEnergy).toBe(6);
  });

  it('lifestealRate = max(0, CON_mod) * 5%；低 CON 为 0', () => {
    expect(deriveStats({ str: 10, dex: 10, con: 14 }, 1).lifestealRate).toBeCloseTo(0.1, 5); // +2
    expect(deriveStats({ str: 10, dex: 10, con: 20 }, 1).lifestealRate).toBeCloseTo(0.25, 5); // +5
    expect(deriveStats({ str: 10, dex: 10, con: 8 }, 1).lifestealRate).toBe(0); // -1 → 0
  });
});

describe('newCombatant / statsOf', () => {
  it('新角色 1 级、0 经验、属性=天赋、无技能', () => {
    const c = newCombatant('TralaleroTralala');
    expect(c).toMatchObject({ archetypeId: 'TralaleroTralala', level: 1, exp: 0, skills: [] });
    expect(c.allocations).toEqual({ str: 0, dex: 0, con: 0 });
    // 当前属性 = 天赋（未加点）
    expect(abilitiesOf(c)).toEqual(ROSTER['TralaleroTralala']!.talent);
  });

  it('Tralalero（高DEX）AC 高于 Lirilì（低DEX）', () => {
    const pika = statsOf(newCombatant('TralaleroTralala'));
    const muk = statsOf(newCombatant('LiriliLarila'));
    expect(pika.ac).toBeGreaterThan(muk.ac);
  });

  it('Lirilì（极致CON）HP 高于 Tralalero', () => {
    const pika = statsOf(newCombatant('TralaleroTralala'));
    const muk = statsOf(newCombatant('LiriliLarila'));
    expect(muk.maxHp).toBeGreaterThan(pika.maxHp);
  });

  it('未知 archetypeId 抛错', () => {
    expect(() => newCombatant('Mewtwo')).toThrow();
  });
});

describe('经验公式（沿用原版）', () => {
  it('升级所需 = 5*level，击败获得 = 10*level', () => {
    expect(expToLevelUp(3)).toBe(15);
    expect(expGainFor(7)).toBe(70);
  });
  it('MAX_LEVEL = 15', () => {
    expect(MAX_LEVEL).toBe(15);
  });
});
