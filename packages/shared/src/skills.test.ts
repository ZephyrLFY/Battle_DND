import { describe, it, expect } from 'vitest';
import { SKILLS, ALL_SKILL_IDS, skillDef, isSkillId } from './skills.js';

describe('技能池静态定义', () => {
  it('恰好 8 个技能', () => {
    expect(ALL_SKILL_IDS).toHaveLength(8);
  });

  it('每个技能 id 与 key 一致、字段完整', () => {
    for (const id of ALL_SKILL_IDS) {
      const def = SKILLS[id];
      expect(def.id).toBe(id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.cooldown).toBeGreaterThanOrEqual(0);
      expect(def.desc.length).toBeGreaterThan(0);
    }
  });

  it('skillDef 未知 id 抛错；isSkillId 正确判别', () => {
    expect(() => skillDef('nope')).toThrow();
    expect(isSkillId('brave_strike')).toBe(true);
    expect(isSkillId('nope')).toBe(false);
  });
});
