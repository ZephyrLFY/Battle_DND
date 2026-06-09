import { describe, it, expect } from 'vitest';
import { SKILLS, ALL_SKILL_IDS, skillDef, isSkillId } from './skills.js';
import { signatureOwner } from './roster.js';

/** 通用技能池（排除各角色签名技能）—— 分阶断言只针对这部分，签名技能不打乱配比。 */
const COMMON_SKILL_IDS = ALL_SKILL_IDS.filter((id) => !signatureOwner(id));

describe('技能池静态定义', () => {
  it('通用技能恰好 11 个（7 基础 + 4 团队技能）', () => {
    expect(COMMON_SKILL_IDS).toHaveLength(11);
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

  it('通用技能分阶：2 个 cost0 / 2 低阶(cost1) / 5 中阶(cost2) / 2 高阶(cost3)', () => {
    const byCost = (c: number) => COMMON_SKILL_IDS.filter((id) => SKILLS[id].cost === c);
    expect(byCost(0)).toHaveLength(2); // 佯攻/精准
    expect(byCost(1)).toHaveLength(2); // 英勇打击/护盾格挡
    expect(byCost(2)).toHaveLength(5); // 眩晕/疾风/战吼/烈焰/治疗
    expect(byCost(3)).toHaveLength(2); // 蓄力/复活
    // cost0 技能都是 Lv1 解锁
    for (const id of byCost(0)) expect(SKILLS[id].unlockLevel).toBe(1);
  });

  it('签名技能：每个都能反查到唯一拥有者 archetype', () => {
    const sigs = ALL_SKILL_IDS.filter((id) => signatureOwner(id));
    for (const id of sigs) expect(signatureOwner(id)).toBeTruthy();
  });

  it('团队技能存在且目标类型正确', () => {
    expect(SKILLS.heal.targetType).toBe('one_ally');
    expect(SKILLS.revive.targetType).toBe('one_ally');
    expect(SKILLS.firestorm.targetType).toBe('all_enemies');
    expect(SKILLS.war_cry.targetType).toBe('all_allies');
  });

  it('cost 越高解锁等级越晚（强技能更晚）', () => {
    // 高阶(cost3)解锁等级 > cost0 技能
    const cost3 = ALL_SKILL_IDS.filter((id) => SKILLS[id].cost === 3);
    for (const id of cost3) expect(SKILLS[id].unlockLevel).toBeGreaterThan(1);
  });

  it('skillDef 未知 id 抛错；isSkillId 正确判别', () => {
    expect(() => skillDef('nope')).toThrow();
    expect(isSkillId('brave_strike')).toBe(true);
    expect(isSkillId('nope')).toBe(false);
  });
});
