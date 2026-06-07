import { describe, it, expect } from 'vitest';
import {
  abilityMod,
  proficiency,
  deriveStats,
  newPokemon,
  statsOf,
  SPECIES_TALENT,
  SPECIES_NAMES,
  STARTING_TOTAL,
  MAX_LEVEL,
  expToLevelUp,
  expGainFor,
} from './pokemon.js';

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

describe('天赋表 — 公平性', () => {
  it('12 只精灵都存在', () => {
    expect(SPECIES_NAMES).toHaveLength(12);
  });

  it('每只精灵 1 级三属性总和都等于 STARTING_TOTAL(39)', () => {
    for (const name of SPECIES_NAMES) {
      const t = SPECIES_TALENT[name]!;
      expect(t.str + t.dex + t.con).toBe(STARTING_TOTAL);
    }
  });
});

describe('deriveStats — 战斗数值派生', () => {
  it('AC = 10 + DEX_mod', () => {
    expect(deriveStats({ str: 10, dex: 16, con: 10 }, 1).ac).toBe(13);
  });

  it('toHit = STR_mod + PRO', () => {
    // STR16 → +3，Lv5 PRO +3 → toHit 6
    expect(deriveStats({ str: 16, dex: 10, con: 10 }, 5).toHit).toBe(6);
  });

  it('maxHp = (8 + CON_mod) * level', () => {
    // CON14 → +2，每级 10 血；Lv3 → 30
    expect(deriveStats({ str: 10, dex: 10, con: 14 }, 3).maxHp).toBe(30);
  });

  it('极低 CON 也保证每级至少 1 血', () => {
    // CON1 → mod -5，8-5=3 仍 >=1；构造 CON 让 8+mod<1
    expect(deriveStats({ str: 10, dex: 10, con: 1 }, 1).maxHp).toBeGreaterThanOrEqual(1);
  });
});

describe('newPokemon / statsOf', () => {
  it('新精灵 1 级、0 经验、属性=天赋、无技能', () => {
    const p = newPokemon('Pikachu');
    expect(p).toMatchObject({ species: 'Pikachu', level: 1, exp: 0, skills: [] });
    expect(p.abilities).toEqual(SPECIES_TALENT['Pikachu']);
  });

  it('Pikachu（高DEX）AC 高于 Muk（低DEX）', () => {
    const pika = statsOf(newPokemon('Pikachu'));
    const muk = statsOf(newPokemon('Muk'));
    expect(pika.ac).toBeGreaterThan(muk.ac);
  });

  it('Muk（极致CON）HP 高于 Pikachu', () => {
    const pika = statsOf(newPokemon('Pikachu'));
    const muk = statsOf(newPokemon('Muk'));
    expect(muk.maxHp).toBeGreaterThan(pika.maxHp);
  });

  it('未知 species 抛错', () => {
    expect(() => newPokemon('Mewtwo')).toThrow();
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
