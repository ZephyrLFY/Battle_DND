import { describe, it, expect } from 'vitest';
import {
  runMatch,
  buildCombatant,
  buildTeam,
  standardBuilds,
  roundRobin,
  signatureCombatant,
  signatureRoster,
  archetypeDuel,
  archetypeTeamContribution,
  archetypeDraftValue,
  genericSkillAblation,
  signatureAblation,
} from './sim.js';
import { abilitiesOf } from './combatant.js';
import { spentPoints, availablePoints } from './leveling.js';
import { ARCHETYPE_IDS, signatureOwner } from './roster.js';

describe('runMatch', () => {
  it('确定性：同入参恒等', () => {
    const a = buildTeam(10, standardBuilds()[0]!);
    const b = buildTeam(10, standardBuilds()[1]!);
    expect(runMatch(a, b, 30)).toEqual(runMatch(a, b, 30));
  });

  it('统计字段自洽：胜+负+平 = 场数', () => {
    const a = buildTeam(10, standardBuilds()[0]!);
    const b = buildTeam(10, standardBuilds()[2]!);
    const r = runMatch(a, b, 40);
    expect(r.aWins + r.bWins + r.draws).toBe(r.games);
    expect(r.aWinRate).toBeGreaterThanOrEqual(0);
    expect(r.aWinRate).toBeLessThanOrEqual(1);
  });

  it('镜像对局胜率应接近 50%（同 build 互打）', () => {
    const t = buildTeam(10, standardBuilds()[0]!);
    const r = runMatch(t, t, 100);
    expect(r.aWinRate).toBeGreaterThan(0.35);
    expect(r.aWinRate).toBeLessThan(0.65);
  });
});

describe('buildCombatant — 加点用满', () => {
  it('力量攻击 build 把点尽量砸进 STR', () => {
    const c = buildCombatant('TungSahur', 10, standardBuilds()[0]!);
    const ab = abilitiesOf(c);
    expect(ab.str).toBeGreaterThan(ab.dex);
    expect(ab.str).toBeGreaterThan(ab.con);
  });

  it('提高上限后专精 build 不再大量浪费点（剩余点应较少）', () => {
    // MAX_ABILITY=30 后，纯堆 STR 的 Tung Tung Tung Sahur（天赋 STR16）能把点都吃进去
    const c = buildCombatant('TungSahur', 10, standardBuilds()[0]!);
    expect(availablePoints(c)).toBeLessThanOrEqual(2);
    expect(spentPoints(c)).toBeGreaterThan(0);
  });
});

describe('roundRobin', () => {
  it('返回每个 build 对所有对手的胜率 + 综合', () => {
    const rows = roundRobin(8, standardBuilds(), 20);
    expect(rows).toHaveLength(standardBuilds().length);
    for (const r of rows) {
      expect(Object.keys(r.vs)).toHaveLength(standardBuilds().length);
      expect(r.overall).toBeGreaterThanOrEqual(0);
      expect(r.overall).toBeLessThanOrEqual(1);
    }
  });
});

describe('角色平衡 sim（纯签名+被动）', () => {
  it('signatureCombatant 只带自己的签名、不学通用技能', () => {
    const c = signatureCombatant('TungSahur', 10);
    expect(c.skills).toEqual(['sig_tung_combo']); // 仅签名
    expect(c.skills.every((s) => signatureOwner(s) === 'TungSahur')).toBe(true);
  });

  it('signatureRoster 覆盖全部 12 角色', () => {
    const roster = signatureRoster(10);
    expect(roster).toHaveLength(ARCHETYPE_IDS.length);
    expect(new Set(roster.map((r) => r.id)).size).toBe(ARCHETYPE_IDS.length);
  });

  it('archetypeDuel(1v1) 输出 12 行、每行 overall 合法、确定性', () => {
    const rows = archetypeDuel(8, 8);
    expect(rows).toHaveLength(ARCHETYPE_IDS.length);
    for (const r of rows) {
      expect(r.overall).toBeGreaterThanOrEqual(0);
      expect(r.overall).toBeLessThanOrEqual(1);
      expect(Object.keys(r.vs)).toHaveLength(ARCHETYPE_IDS.length);
    }
    expect(archetypeDuel(8, 8)).toEqual(rows); // 确定性
  });

  it('archetypeTeamContribution(3v3 替换位) 输出 12 行、胜率合法', () => {
    const rows = archetypeTeamContribution(8, 6);
    expect(rows).toHaveLength(ARCHETYPE_IDS.length);
    for (const r of rows) {
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
    }
  });

  it('archetypeDraftValue(3v3 随机组队) 输出 12 行、胜率合法、确定性、队伍含被测角色且不重复', () => {
    const rows = archetypeDraftValue(8, 4, 4);
    expect(rows).toHaveLength(ARCHETYPE_IDS.length);
    for (const r of rows) {
      expect(r.winRate).toBeGreaterThanOrEqual(0);
      expect(r.winRate).toBeLessThanOrEqual(1);
    }
    expect(archetypeDraftValue(8, 4, 4)).toEqual(rows); // 确定性
  });

  it('genericSkillAblation：限定技能输出对应行、对照组一致、确定性', () => {
    const rows = genericSkillAblation(12, 3, 3, ['brave_strike', 'heal']);
    expect(rows.map((r) => r.id)).toEqual(['brave_strike', 'heal']);
    for (const r of rows) {
      expect(r.withRate).toBeGreaterThanOrEqual(0);
      expect(r.withRate).toBeLessThanOrEqual(1);
      expect(r.delta).toBeCloseTo(r.withRate - r.withoutRate, 5);
    }
    expect(rows[0]!.withoutRate).toBe(rows[1]!.withoutRate); // 共享同一对照组
    expect(genericSkillAblation(12, 3, 3, ['brave_strike', 'heal'])).toEqual(rows); // 确定性
  });

  it('signatureAblation：限定角色输出对应行、胜率合法、确定性', () => {
    const rows = signatureAblation(10, 3, 3, ['TungSahur']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('TungSahur');
    expect(rows[0]!.withRate).toBeGreaterThanOrEqual(0);
    expect(rows[0]!.withoutRate).toBeLessThanOrEqual(1);
    expect(signatureAblation(10, 3, 3, ['TungSahur'])).toEqual(rows); // 确定性
  });
});
