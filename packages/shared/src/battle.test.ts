import { describe, it, expect } from 'vitest';
import {
  createBattle,
  legalActions,
  allActions,
  applyAction,
  isOver,
  currentFighter,
  aliveOf,
  find,
  type BattleState,
  type Action,
  type FighterRef,
} from './battle.js';
import { newCombatant, type Combatant } from './combatant.js';
import type { SkillId } from './skills.js';

function mk(archetypeId: string, level: number, skills: SkillId[] = []): Combatant {
  return { ...newCombatant(archetypeId), level, skills };
}

/** 1v1：双方各 1 个角色（NvN 引擎的 N=1 特例）。 */
function battle1v1(a: Combatant, b: Combatant, seed: number) {
  return createBattle([a], [b], seed);
}

/** 自动跑完：每个行动者选第一个合法动作（或带默认目标的普攻）。 */
function autoRun(a: Combatant, b: Combatant, seed: number) {
  let { state, events } = battle1v1(a, b, seed);
  const all = [...events];
  let guard = 0;
  while (!isOver(state) && guard++ < 3000) {
    const acts = legalActions(state);
    const cur = currentFighter(state)!;
    const fallback: Action = { kind: 'attack', target: firstEnemyRef(state, cur.team) };
    const act = acts[0] ?? fallback;
    const r = applyAction(state, act);
    state = r.state;
    all.push(...r.events);
  }
  return { state, events: all };
}

function firstEnemyRef(state: BattleState, team: 'a' | 'b'): FighterRef {
  const enemy = aliveOf(state, team === 'a' ? 'b' : 'a')[0]!;
  return { team: enemy.team, id: enemy.id };
}

describe('createBattle — 初始化', () => {
  it('start 事件含先攻明细，order 覆盖双方全员', () => {
    const { state, events } = battle1v1(newCombatant('Onix'), newCombatant('Pikachu'), 1);
    const start = events[0];
    expect(start?.t).toBe('start');
    if (start?.t === 'start') {
      expect(start.order).toHaveLength(2);
      expect(Object.keys(start.initiative)).toHaveLength(2);
    }
    expect(state.order).toHaveLength(2);
  });

  it('HP 初始为各自 maxHp', () => {
    const { state } = battle1v1(newCombatant('Muk'), newCombatant('Pikachu'), 1);
    const muk = state.teams.a[0]!;
    expect(muk.hp).toBe(muk.stats.maxHp);
  });

  it('空队报错', () => {
    expect(() => createBattle([], [newCombatant('Onix')], 1)).toThrow();
  });
});

describe('确定性', () => {
  it('相同种子+相同自动流程 => 相同事件流', () => {
    const r1 = autoRun(mk('Charmander', 8), mk('Onix', 8), 99);
    const r2 = autoRun(mk('Charmander', 8), mk('Onix', 8), 99);
    expect(r1.events).toEqual(r2.events);
    expect(r1.state.winner).toBe(r2.state.winner);
  });

  it('applyAction 不修改传入 state（纯函数）', () => {
    const { state } = battle1v1(newCombatant('Onix'), newCombatant('Pikachu'), 3);
    const before = JSON.stringify(state);
    const cur = currentFighter(state)!;
    applyAction(state, { kind: 'attack', target: firstEnemyRef(state, cur.team) });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('战斗收敛与胜负', () => {
  it('普攻到底一定分出胜负，不触发安全上限', () => {
    const { state } = autoRun(mk('Onix', 12), mk('Pikachu', 2), 7);
    expect(isOver(state)).toBe(true);
    expect(state.winner).not.toBeUndefined();
  });

  it('15级强者打1级弱者大概率获胜', () => {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (autoRun(mk('Onix', 15), mk('Pikachu', 1), seed).state.winner === 'a') wins++;
    }
    expect(wins).toBeGreaterThan(32);
  });

  it('结束后 legalActions 为空、applyAction 不再推进', () => {
    const { state } = autoRun(mk('Onix', 15), mk('Pikachu', 1), 5);
    expect(legalActions(state)).toEqual([]);
    const r = applyAction(state, { kind: 'attack', target: { team: 'b', id: 'Pikachu' } });
    expect(r.events).toEqual([]);
  });
});

describe('倒地 → 死亡两段（1v1 退化）', () => {
  it('被打到 0 先倒地，再被打才彻底死亡并结束', () => {
    // 用强者打弱者，跟踪 downed → dead 事件序列
    const { events } = autoRun(mk('Hitmonlee', 15, ['flurry']), mk('Pikachu', 1), 11);
    const downedIdx = events.findIndex((e) => e.t === 'downed');
    const deadIdx = events.findIndex((e) => e.t === 'dead');
    const endIdx = events.findIndex((e) => e.t === 'end');
    expect(downedIdx).toBeGreaterThanOrEqual(0);
    expect(deadIdx).toBeGreaterThan(downedIdx); // 先倒地后死亡
    expect(endIdx).toBeGreaterThanOrEqual(deadIdx);
  });
});

describe('法术位与动作可用性', () => {
  it('耗位法术用尽后不可用；戏法仍可用', () => {
    // Onix Lv3 → maxSlots=1；带 brave_strike(cost1) + shield_block(cost0)
    const a = mk('Onix', 3, ['brave_strike', 'shield_block']);
    const b = mk('Onix', 15);
    let st = firstTurnOf(a, b, 'a');
    expect(st.teams.a[0]!.slots).toBe(1);
    // a 放 brave_strike（带目标）
    const braveOpt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike',
    )!;
    st = applyAction(st, braveOpt.action).state;
    expect(st.teams.a[0]!.slots).toBe(0);
    // b 普攻
    st = applyAction(st, { kind: 'attack', target: { team: 'a', id: 'Onix' } }).state;
    // 回到 a：brave 不可用、shield 可用
    expect(currentFighter(st)!.team).toBe('a');
    const acts = legalActions(st);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'brave_strike')).toBe(false);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'shield_block')).toBe(true);
  });

  it('allActions 把无法术位的技能标 usable:false + 理由', () => {
    const a = mk('Onix', 3, ['brave_strike']);
    const b = mk('Onix', 15);
    let st = firstTurnOf(a, b, 'a');
    const braveOpt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike',
    )!;
    st = applyAction(st, braveOpt.action).state;
    st = applyAction(st, { kind: 'attack', target: { team: 'a', id: 'Onix' } }).state;
    const opt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike',
    );
    expect(opt?.usable).toBe(false);
    expect(opt?.reason).toBe('无法术位');
  });
});

describe('CON 被动吸血', () => {
  it('高CON角色命中造成伤害时回血', () => {
    const a = mk('Muk', 10); // 高 CON
    const b = mk('Pikachu', 1); // 脆皮，易命中
    let st = firstTurnOf(a, b, 'a');
    st.teams.a[0]!.hp = 5; // 压低血量
    let sawLifesteal = false;
    for (let i = 0; i < 30 && !sawLifesteal; i++) {
      if (currentFighter(st)?.team === 'a') {
        const r = applyAction(st, { kind: 'attack', target: { team: 'b', id: 'Pikachu' } });
        if (r.events.some((e) => e.t === 'lifesteal')) sawLifesteal = true;
        st = r.state;
      } else {
        st = applyAction(st, { kind: 'attack', target: { team: 'a', id: 'Muk' } }).state;
      }
      if (isOver(st)) break;
    }
    expect(sawLifesteal).toBe(true);
  });
});

/** 构造一个"指定队先手"的初始 state（试种子直到该队在 order 首位）。 */
function firstTurnOf(a: Combatant, b: Combatant, team: 'a' | 'b'): BattleState {
  for (let seed = 0; seed < 200; seed++) {
    const { state } = battle1v1(a, b, seed);
    if (currentFighter(state)?.team === team) return state;
  }
  throw new Error('找不到让该队先手的种子');
}

// ─────────────────────────────── 3v3 ───────────────────────────────

import { chooseAction } from './ai.js';

const TEAM_A: Combatant[] = [mk('Hitmonlee', 10), mk('Onix', 10), mk('Pikachu', 10)];
const TEAM_B: Combatant[] = [mk('Charmander', 10), mk('Muk', 10), mk('Krabby', 10)];

/** 双方都用随机 AI 跑完整场 3v3。 */
function auto3v3(seed: number) {
  let { state, events } = createBattle(TEAM_A, TEAM_B, seed);
  const all = [...events];
  let guard = 0;
  while (!isOver(state) && guard++ < 5000) {
    const r = applyAction(state, chooseAction(state, seed * 31 + guard));
    state = r.state;
    all.push(...r.events);
  }
  return { state, events: all, turns: guard };
}

describe('3v3 对局', () => {
  it('start 的 order 覆盖全部 6 个角色', () => {
    const { events } = createBattle(TEAM_A, TEAM_B, 1);
    const start = events[0];
    expect(start?.t).toBe('start');
    if (start?.t === 'start') {
      expect(start.order).toHaveLength(6);
      expect(start.fighters).toHaveLength(6);
    }
  });

  it('随机 AI 对打能收敛分出胜负，不触发安全上限', () => {
    const { state, turns } = auto3v3(7);
    expect(isOver(state)).toBe(true);
    expect(turns).toBeLessThan(5000);
    expect(state.winner === 'a' || state.winner === 'b' || state.winner === null).toBe(true);
  });

  it('结束时至少一方全员阵亡', () => {
    const { state } = auto3v3(13);
    const aAllDead = state.teams.a.every((f) => f.dead);
    const bAllDead = state.teams.b.every((f) => f.dead);
    expect(aAllDead || bAllDead).toBe(true);
  });

  it('确定性：相同种子同样的 3v3 过程', () => {
    expect(auto3v3(42).events).toEqual(auto3v3(42).events);
  });
});

describe('AOE / 团队技能', () => {
  it('烈焰风暴一次命中多个敌人（产生多条 hit/damage）', () => {
    const caster: Combatant[] = [mk('Charmander', 10, ['firestorm'])];
    const enemies = TEAM_B;
    let st = createBattle(caster, enemies, 0).state;
    // 试种子直到我方(a)先手
    for (let seed = 0; seed < 200 && currentFighter(st)?.team !== 'a'; seed++) {
      st = createBattle(caster, enemies, seed).state;
    }
    expect(currentFighter(st)?.team).toBe('a');
    const fire = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'firestorm',
    )!;
    const r = applyAction(st, fire.action);
    const hits = r.events.filter((e) => e.t === 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(2); // 命中多个敌人
  });

  it('治疗术回复友方生命', () => {
    const allies: Combatant[] = [mk('Licktung', 10, ['heal']), mk('Onix', 10)];
    let st = createBattle(allies, [mk('Pikachu', 1)], 0).state;
    for (let seed = 0; seed < 200 && currentFighter(st)?.id !== 'Licktung'; seed++) {
      st = createBattle(allies, [mk('Pikachu', 1)], seed).state;
    }
    // 压低队友血量
    const ally = find(st, { team: 'a', id: 'Onix' })!;
    ally.hp = 5;
    const healOpt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'heal',
    );
    // 让治疗目标指向受伤的 Onix
    if (healOpt && healOpt.action.kind === 'skill') {
      const r = applyAction(st, { kind: 'skill', skill: 'heal', targets: [{ team: 'a', id: 'Onix' }] });
      const heal = r.events.find((e) => e.t === 'heal');
      expect(heal?.t).toBe('heal');
      if (heal?.t === 'heal') expect(heal.hpLeft).toBeGreaterThan(5);
    }
  });
});
