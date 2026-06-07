import { describe, it, expect } from 'vitest';
import { simulateBattle, type BattleEvent } from './battle.js';

const strong = { species: 'Onix', level: 15 } as const; // def 型，厚
const weak = { species: 'Pikachu', level: 1 } as const; // agi 型，脆

describe('simulateBattle — 确定性', () => {
  it('相同种子 + 相同双方 => 完全相同的事件流', () => {
    const r1 = simulateBattle(strong, weak, 42);
    const r2 = simulateBattle(strong, weak, 42);
    expect(r1.events).toEqual(r2.events);
    expect(r1.winner).toBe(r2.winner);
  });

  it('不同种子通常给出不同战斗过程', () => {
    const a = simulateBattle(strong, weak, 1);
    const b = simulateBattle(strong, weak, 2);
    // 长度或胜负至少有一处不同（极小概率相同，换种子即可）
    const same = JSON.stringify(a.events) === JSON.stringify(b.events);
    expect(same).toBe(false);
  });
});

describe('simulateBattle — 结构正确性', () => {
  it('总是以 start 开头、end 结尾', () => {
    const { events } = simulateBattle(strong, weak, 7);
    expect(events[0]?.t).toBe('start');
    expect(events[events.length - 1]?.t).toBe('end');
  });

  it('end 的 winner 与最后存活方一致；战斗一定收敛（不触发安全上限）', () => {
    const { events, winner } = simulateBattle(strong, weak, 7);
    const end = events[events.length - 1] as Extract<BattleEvent, { t: 'end' }>;
    expect(end.winner).toBe(winner);
    expect(winner).not.toBeNull(); // 15级Onix 打 1级皮卡丘应有胜负
  });

  it('高等级强者对低等级弱者应大概率获胜', () => {
    let strongWins = 0;
    for (let seed = 0; seed < 50; seed++) {
      if (simulateBattle(strong, weak, seed).winner === 'a') strongWins++;
    }
    expect(strongWins).toBeGreaterThan(40);
  });
});

describe('simulateBattle — 伤害事件合法性', () => {
  it('hpLeft 单调不增（同一方），且不为负 —— 用无回血技能的对局', () => {
    // 避开 fat 型（生命汲取会回血，破坏单调性）；用 str vs def
    const { events } = simulateBattle(
      { species: 'Charmander', level: 8 }, // str
      { species: 'Onix', level: 8 }, // def
      123,
    );
    const lastHp: Record<string, number> = {};
    for (const e of events) {
      if (e.t === 'damage') {
        expect(e.hpLeft).toBeGreaterThanOrEqual(0);
        if (lastHp[e.to] !== undefined) {
          expect(e.hpLeft).toBeLessThanOrEqual(lastHp[e.to]!);
        }
        lastHp[e.to] = e.hpLeft;
      }
    }
  });

  it('fat 型生命汲取会产生 heal 事件且回血量非负', () => {
    // 跑多个种子，至少应出现一次 fat 的 heal（15% 技能率，回合够多）
    let sawHeal = false;
    for (let seed = 0; seed < 30 && !sawHeal; seed++) {
      const { events } = simulateBattle(
        { species: 'Muk', level: 12 }, // fat
        { species: 'Geodude', level: 12 }, // def
        seed,
      );
      for (const e of events) {
        if (e.t === 'heal') {
          expect(e.amount).toBeGreaterThanOrEqual(0);
          expect(e.hpLeft).toBeGreaterThan(0);
          sawHeal = true;
        }
      }
    }
    expect(sawHeal).toBe(true);
  });
});
