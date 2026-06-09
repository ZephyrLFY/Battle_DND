import { describe, it, expect } from 'vitest';
import {
  LINEUP_SIZE,
  hasUniqueMembers,
  canAddMember,
  isLineupValid,
  lineupMembers,
  generateEnemyTeam,
  type Team,
} from './team.js';
import { newCombatant } from './combatant.js';

function team(ids: string[], lineup: number[]): Team {
  return { members: ids.map((id) => newCombatant(id)), lineup };
}

describe('队伍约束', () => {
  it('hasUniqueMembers：重复 archetypeId 为 false', () => {
    expect(hasUniqueMembers(team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila'], [0, 1, 2]))).toBe(true);
    expect(hasUniqueMembers(team(['TrippiTroppi', 'TrippiTroppi'], [0, 1]))).toBe(false);
  });

  it('canAddMember：已有的不能再加', () => {
    const t = team(['TrippiTroppi', 'TralaleroTralala'], [0, 1]);
    expect(canAddMember(t, 'LiriliLarila')).toBe(true);
    expect(canAddMember(t, 'TrippiTroppi')).toBe(false);
  });

  it('isLineupValid：人数对、下标有效、不重复', () => {
    expect(isLineupValid(team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila'], [0, 1, 2]))).toBe(true);
    expect(isLineupValid(team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila'], [0, 1]))).toBe(false); // 人数不足
    expect(isLineupValid(team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila'], [0, 0, 1]))).toBe(false); // 重复
    expect(isLineupValid(team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila'], [0, 1, 9]))).toBe(false); // 越界
  });

  it('lineupMembers 取出战角色', () => {
    const t = team(['TrippiTroppi', 'TralaleroTralala', 'LiriliLarila', 'BombombiniGusini'], [0, 2, 3]);
    expect(lineupMembers(t).map((m) => m.archetypeId)).toEqual(['TrippiTroppi', 'LiriliLarila', 'BombombiniGusini']);
  });
});

describe('generateEnemyTeam', () => {
  it('生成 LINEUP_SIZE 个不重复角色', () => {
    const t = generateEnemyTeam(8, 1);
    expect(t).toHaveLength(LINEUP_SIZE);
    expect(new Set(t.map((c) => c.archetypeId)).size).toBe(LINEUP_SIZE);
  });

  it('size 参数控制人数（等量对战）：1/2 人也能生成且不重复', () => {
    for (const size of [1, 2, 3]) {
      const t = generateEnemyTeam(8, 5, size);
      expect(t).toHaveLength(size);
      expect(new Set(t.map((c) => c.archetypeId)).size).toBe(size);
    }
  });

  it('确定性：同 (level, seed) 恒等', () => {
    expect(generateEnemyTeam(8, 42)).toEqual(generateEnemyTeam(8, 42));
  });

  it('不同 seed 通常不同', () => {
    const a = generateEnemyTeam(8, 1).map((c) => c.archetypeId).join();
    const b = generateEnemyTeam(8, 2).map((c) => c.archetypeId).join();
    expect(a === b && JSON.stringify(generateEnemyTeam(8, 1)) === JSON.stringify(generateEnemyTeam(8, 2))).toBe(false);
  });

  it('角色已按等级加满点、学了技能', () => {
    const t = generateEnemyTeam(10, 5);
    for (const c of t) {
      expect(c.level).toBe(10);
      expect(c.skills.length).toBeGreaterThan(0);
    }
  });
});
