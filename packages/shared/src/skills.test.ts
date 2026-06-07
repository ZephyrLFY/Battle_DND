import { describe, it, expect } from 'vitest';
import { SKILLS, ALL_SKILL_IDS, skillDef, isSkillId } from './skills.js';

describe('技能池静态定义', () => {
  it('恰好 7 个技能（生命汲取已改为 CON 被动吸血，移出技能池）', () => {
    expect(ALL_SKILL_IDS).toHaveLength(7);
  });

  it('每个技能 id 与 key 一致、字段完整，cost 为 0 或 1', () => {
    for (const id of ALL_SKILL_IDS) {
      const def = SKILLS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect([0, 1]).toContain(def.cost);
      expect(def.desc.length).toBeGreaterThan(0);
    }
  });

  it('耗位法术 4 个、免费戏法 3 个', () => {
    const paid = ALL_SKILL_IDS.filter((id) => SKILLS[id].cost === 1);
    const free = ALL_SKILL_IDS.filter((id) => SKILLS[id].cost === 0);
    expect(paid).toHaveLength(4);
    expect(free).toHaveLength(3);
  });

  it('skillDef 未知 id 抛错；isSkillId 正确判别', () => {
    expect(() => skillDef('nope')).toThrow();
    expect(isSkillId('brave_strike')).toBe(true);
    expect(isSkillId('nope')).toBe(false);
  });
});
