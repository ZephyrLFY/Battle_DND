import { describe, it, expect } from 'vitest';
import { SKILLS, ALL_SKILL_IDS, skillDef, isSkillId } from './skills.js';

describe('技能池静态定义', () => {
  it('恰好 7 个技能（生命汲取已改为 CON 被动吸血，移出技能池）', () => {
    expect(ALL_SKILL_IDS).toHaveLength(7);
  });

  it('每个技能 id 与 key 一致、字段完整，cost 0~3，unlockLevel≥1', () => {
    for (const id of ALL_SKILL_IDS) {
      const def = SKILLS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect([0, 1, 2, 3]).toContain(def.cost);
      expect(def.unlockLevel).toBeGreaterThanOrEqual(1);
      expect(def.desc.length).toBeGreaterThan(0);
    }
  });

  it('分阶：3 戏法(cost0,Lv1) / 1 低阶(cost1) / 2 中阶(cost2) / 1 高阶(cost3)', () => {
    const byCost = (c: number) => ALL_SKILL_IDS.filter((id) => SKILLS[id].cost === c);
    expect(byCost(0)).toHaveLength(3);
    expect(byCost(1)).toHaveLength(1);
    expect(byCost(2)).toHaveLength(2);
    expect(byCost(3)).toHaveLength(1);
    // 戏法都是 Lv1 解锁
    for (const id of byCost(0)) expect(SKILLS[id].unlockLevel).toBe(1);
  });

  it('cost 越高解锁等级越晚（强技能更晚）', () => {
    // 高阶(cost3)解锁等级 > 戏法(cost0)
    const cost3 = ALL_SKILL_IDS.filter((id) => SKILLS[id].cost === 3);
    for (const id of cost3) expect(SKILLS[id].unlockLevel).toBeGreaterThan(1);
  });

  it('skillDef 未知 id 抛错；isSkillId 正确判别', () => {
    expect(() => skillDef('nope')).toThrow();
    expect(isSkillId('brave_strike')).toBe(true);
    expect(isSkillId('nope')).toBe(false);
  });
});
