import { describe, it, expect } from 'vitest';
import { newPokemon } from './pokemon.js';
import {
  totalPoints,
  spentPoints,
  availablePoints,
  allocate,
  respec,
  learnableSkills,
  learnSkill,
  gainExp,
  hasPendingGrowth,
} from './leveling.js';

describe('属性点预算', () => {
  it('totalPoints：1级0点，每级+2', () => {
    expect(totalPoints(1)).toBe(0);
    expect(totalPoints(2)).toBe(2);
    expect(totalPoints(15)).toBe(28);
  });

  it('新精灵已花0点、可用点=totalPoints', () => {
    const p = { ...newPokemon('Onix'), level: 5 };
    expect(spentPoints(p)).toBe(0);
    expect(availablePoints(p)).toBe(totalPoints(5));
  });
});

describe('allocate — 加点', () => {
  it('加点消耗可用点、提升属性', () => {
    const p = { ...newPokemon('Onix'), level: 3 }; // 4 点可用
    const p2 = allocate(p, 'str', 2);
    expect(p2.abilities.str).toBe(p.abilities.str + 2);
    expect(availablePoints(p2)).toBe(availablePoints(p) - 2);
  });

  it('点数不足时抛错', () => {
    const p = { ...newPokemon('Onix'), level: 2 }; // 仅 2 点
    expect(() => allocate(p, 'str', 3)).toThrow();
  });

  it('属性不能超过 20', () => {
    const p = { ...newPokemon('Muk'), level: 15 }; // CON 已 20
    expect(() => allocate(p, 'con', 1)).toThrow();
  });

  it('不修改入参（纯函数）', () => {
    const p = { ...newPokemon('Onix'), level: 3 };
    const before = JSON.stringify(p);
    allocate(p, 'dex', 1);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('respec — 洗点', () => {
  it('属性回到天赋、点全退回、等级技能不变', () => {
    let p = learnSkill({ ...newPokemon('Pikachu'), level: 6 }, 'flurry');
    p = allocate(p, 'str', 4);
    expect(spentPoints(p)).toBe(4);
    const r = respec(p);
    expect(spentPoints(r)).toBe(0);
    expect(r.abilities).toEqual(newPokemon('Pikachu').abilities);
    expect(r.level).toBe(6);
    expect(r.skills).toEqual(['flurry']);
  });
});

describe('技能学习', () => {
  it('learnableSkills 初始为全部 7 个', () => {
    expect(learnableSkills(newPokemon('Onix'))).toHaveLength(7);
  });

  it('学技能后从可学列表移除', () => {
    const p = learnSkill(newPokemon('Onix'), 'brave_strike');
    expect(p.skills).toContain('brave_strike');
    expect(learnableSkills(p)).toHaveLength(6);
  });

  it('重复学 / 未知技能抛错', () => {
    const p = learnSkill(newPokemon('Onix'), 'brave_strike');
    expect(() => learnSkill(p, 'brave_strike')).toThrow();
    expect(() => learnSkill(p, 'nope')).toThrow();
  });
});

describe('gainExp — 经验升级', () => {
  it('够经验则升级，返回升了几级', () => {
    const p = newPokemon('Onix'); // Lv1，升级需 5*1=5
    const r = gainExp(p, 5);
    expect(r.pokemon.level).toBe(2);
    expect(r.leveledUp).toBe(1);
  });

  it('一次大经验可连升多级', () => {
    const p = newPokemon('Onix');
    const r = gainExp(p, 100);
    expect(r.leveledUp).toBeGreaterThan(1);
  });

  it('满级不再囤经验', () => {
    const p = { ...newPokemon('Onix'), level: 15 };
    const r = gainExp(p, 999);
    expect(r.pokemon.level).toBe(15);
    expect(r.pokemon.exp).toBe(0);
    expect(r.leveledUp).toBe(0);
  });
});

describe('hasPendingGrowth', () => {
  it('有剩余点或可学技能时为 true', () => {
    expect(hasPendingGrowth({ ...newPokemon('Onix'), level: 3 })).toBe(true);
  });
});
