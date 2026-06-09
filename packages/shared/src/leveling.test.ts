import { describe, it, expect } from 'vitest';
import { newCombatant, abilitiesOf, MAX_ABILITY } from './combatant.js';
import {
  totalPoints,
  spentPoints,
  availablePoints,
  allocate,
  respec,
  learnableSkills,
  learnSkill,
  forgetSkill,
  canLearn,
  learnBlockReason,
  skillBarFull,
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
    const p = { ...newCombatant('TrippiTroppi'), level: 5 };
    expect(spentPoints(p)).toBe(0);
    expect(availablePoints(p)).toBe(totalPoints(5));
  });
});

describe('allocate — 加点', () => {
  it('加点消耗可用点、提升属性', () => {
    const p = { ...newCombatant('TrippiTroppi'), level: 3 }; // 4 点可用
    const p2 = allocate(p, 'str', 2);
    expect(abilitiesOf(p2).str).toBe(abilitiesOf(p).str + 2);
    expect(p2.allocations.str).toBe(2);
    expect(availablePoints(p2)).toBe(availablePoints(p) - 2);
  });

  it('点数不足时抛错', () => {
    const p = { ...newCombatant('TrippiTroppi'), level: 2 }; // 仅 2 点
    expect(() => allocate(p, 'str', 3)).toThrow();
  });

  it('属性不能超过上限 MAX_ABILITY', () => {
    // Lirilì Larilà 天赋 CON 20；加到上限（30）后再加应抛错
    let p = { ...newCombatant('LiriliLarila'), level: 15 }; // Lv15 → 28 点足够把 CON 顶满
    while (20 + p.allocations.con < MAX_ABILITY) p = allocate(p, 'con', 1);
    expect(() => allocate(p, 'con', 1)).toThrow();
  });

  it('不修改入参（纯函数）', () => {
    const p = { ...newCombatant('TrippiTroppi'), level: 3 };
    const before = JSON.stringify(p);
    allocate(p, 'dex', 1);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('respec — 洗点', () => {
  it('属性回到天赋、点全退回、等级技能不变', () => {
    let p = learnSkill({ ...newCombatant('TralaleroTralala'), level: 8 }, 'flurry'); // flurry 需 Lv8
    p = allocate(p, 'str', 4);
    expect(spentPoints(p)).toBe(4);
    const r = respec(p);
    expect(spentPoints(r)).toBe(0);
    expect(r.allocations).toEqual({ str: 0, dex: 0, con: 0 });
    expect(abilitiesOf(r)).toEqual(abilitiesOf(newCombatant('TralaleroTralala')));
    expect(r.level).toBe(8);
    expect(r.skills).toEqual(['flurry']);
  });
});

describe('技能学习', () => {
  it('learnableSkills 初始为 11 通用 + 1 自己的签名 = 12（未学过的）', () => {
    // 拥有者能看到自己的签名技能；他人签名不出现在池里。
    expect(learnableSkills(newCombatant('TrippiTroppi'))).toHaveLength(12);
  });

  it('Lv1 戏法可学；学后从可学列表移除', () => {
    const p = learnSkill(newCombatant('TrippiTroppi'), 'stone_skin'); // 戏法 Lv1
    expect(p.skills).toContain('stone_skin');
    expect(learnableSkills(p)).toHaveLength(11);
  });

  it('未达解锁等级不可学', () => {
    const p = newCombatant('TrippiTroppi'); // Lv1
    expect(canLearn(p, 'brave_strike')).toBe(false); // 需 Lv3
    expect(learnBlockReason(p, 'brave_strike')).toBe('需 Lv3');
    expect(() => learnSkill(p, 'brave_strike')).toThrow();
  });

  it('达到等级后可学', () => {
    const p = { ...newCombatant('TrippiTroppi'), level: 3 };
    expect(canLearn(p, 'brave_strike')).toBe(true);
    expect(learnSkill(p, 'brave_strike').skills).toContain('brave_strike');
  });

  it('技能栏最多 4 个，满了不可学', () => {
    let p = { ...newCombatant('TrippiTroppi'), level: 8 };
    p = learnSkill(p, 'shield_block');
    p = learnSkill(p, 'stone_skin');
    p = learnSkill(p, 'precise_aim');
    p = learnSkill(p, 'brave_strike');
    expect(skillBarFull(p)).toBe(true);
    expect(canLearn(p, 'stun_strike')).toBe(false);
    expect(learnBlockReason(p, 'stun_strike')).toContain('技能栏已满');
    expect(() => learnSkill(p, 'stun_strike')).toThrow();
  });

  it('卸下技能后腾出栏位可再学', () => {
    let p = { ...newCombatant('TrippiTroppi'), level: 8 };
    p = learnSkill(p, 'shield_block');
    p = learnSkill(p, 'stone_skin');
    p = learnSkill(p, 'precise_aim');
    p = learnSkill(p, 'brave_strike');
    p = forgetSkill(p, 'brave_strike');
    expect(p.skills).not.toContain('brave_strike');
    expect(canLearn(p, 'stun_strike')).toBe(true);
  });

  it('重复学 / 未知技能抛错', () => {
    const p = learnSkill(newCombatant('TrippiTroppi'), 'stone_skin');
    expect(() => learnSkill(p, 'stone_skin')).toThrow();
    expect(() => learnSkill(p, 'nope')).toThrow();
  });
});

describe('gainExp — 经验升级', () => {
  it('够经验则升级，返回升了几级', () => {
    const p = newCombatant('TrippiTroppi'); // Lv1，升级需 5*1=5
    const r = gainExp(p, 5);
    expect(r.combatant.level).toBe(2);
    expect(r.leveledUp).toBe(1);
  });

  it('一次大经验可连升多级', () => {
    const p = newCombatant('TrippiTroppi');
    const r = gainExp(p, 100);
    expect(r.leveledUp).toBeGreaterThan(1);
  });

  it('满级不再囤经验', () => {
    const p = { ...newCombatant('TrippiTroppi'), level: 15 };
    const r = gainExp(p, 999);
    expect(r.combatant.level).toBe(15);
    expect(r.combatant.exp).toBe(0);
    expect(r.leveledUp).toBe(0);
  });
});

describe('hasPendingGrowth', () => {
  it('有剩余点或可学技能时为 true', () => {
    expect(hasPendingGrowth({ ...newCombatant('TrippiTroppi'), level: 3 })).toBe(true);
  });
});
