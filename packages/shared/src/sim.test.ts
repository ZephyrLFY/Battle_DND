import { describe, it, expect } from 'vitest';
import {
  runMatch,
  buildCombatant,
  buildTeam,
  standardBuilds,
  roundRobin,
} from './sim.js';
import { abilitiesOf } from './combatant.js';
import { spentPoints, availablePoints } from './leveling.js';

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
