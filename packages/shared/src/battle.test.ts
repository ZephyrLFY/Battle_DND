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

describe('闪避回能', () => {
  it('敌方攻击落空时，受击者 +1 能量（封顶 maxEnergy）', () => {
    // 给目标拉满 AC 让攻击几乎必 miss（自然 20 仍命中 → 换种子直到找到 miss 局）
    for (let seed = 1; seed < 100; seed++) {
      const { state } = battle1v1(mk('TungSahur', 10), mk('TralaleroTralala', 10), seed);
      const cur = currentFighter(state)!;
      if (cur.team !== 'a') continue; // 要 a 先手攻击 b
      const target = find(state, { team: 'b', id: 'TralaleroTralala' })!;
      target.stats.ac = 99; // 必 miss（除自然 20）
      const before = target.energy;
      const r = applyAction(state, { kind: 'attack', target: { team: 'b', id: target.id } });
      const hitEv = r.events.find((e) => e.t === 'hit');
      if (hitEv?.t === 'hit' && !hitEv.hit) {
        const after = find(r.state, { team: 'b', id: 'TralaleroTralala' })!;
        expect(after.energy).toBe(Math.min(after.stats.maxEnergy, before + 1));
        // 且有对应 energy 事件（delta +1、无 spent）
        const enEv = r.events.find((e) => e.t === 'energy' && e.who.id === 'TralaleroTralala');
        expect(enEv && enEv.t === 'energy' && enEv.delta === 1 && !enEv.spent).toBe(true);
        return;
      }
    }
    throw new Error('100 个种子里没找到 miss 局（不应发生）');
  });
});

describe('createBattle — 初始化', () => {
  it('start 事件含先攻明细，order 覆盖双方全员', () => {
    const { state, events } = battle1v1(newCombatant('TrippiTroppi'), newCombatant('TralaleroTralala'), 1);
    const start = events[0];
    expect(start?.t).toBe('start');
    if (start?.t === 'start') {
      expect(start.order).toHaveLength(2);
      expect(Object.keys(start.initiative)).toHaveLength(2);
    }
    expect(state.order).toHaveLength(2);
  });

  it('HP 初始为各自 maxHp', () => {
    const { state } = battle1v1(newCombatant('LiriliLarila'), newCombatant('TralaleroTralala'), 1);
    const muk = state.teams.a[0]!;
    expect(muk.hp).toBe(muk.stats.maxHp);
  });

  it('空队报错', () => {
    expect(() => createBattle([], [newCombatant('TrippiTroppi')], 1)).toThrow();
  });
});

describe('确定性', () => {
  it('相同种子+相同自动流程 => 相同事件流', () => {
    const r1 = autoRun(mk('CappuccinoAssassino', 8), mk('TrippiTroppi', 8), 99);
    const r2 = autoRun(mk('CappuccinoAssassino', 8), mk('TrippiTroppi', 8), 99);
    expect(r1.events).toEqual(r2.events);
    expect(r1.state.winner).toBe(r2.state.winner);
  });

  it('applyAction 不修改传入 state（纯函数）', () => {
    const { state } = battle1v1(newCombatant('TrippiTroppi'), newCombatant('TralaleroTralala'), 3);
    const before = JSON.stringify(state);
    const cur = currentFighter(state)!;
    applyAction(state, { kind: 'attack', target: firstEnemyRef(state, cur.team) });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('战斗收敛与胜负', () => {
  it('普攻到底一定分出胜负，不触发安全上限', () => {
    const { state } = autoRun(mk('TrippiTroppi', 12), mk('TralaleroTralala', 2), 7);
    expect(isOver(state)).toBe(true);
    expect(state.winner).not.toBeUndefined();
  });

  it('15级强者打1级弱者大概率获胜', () => {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++) {
      if (autoRun(mk('TrippiTroppi', 15), mk('TralaleroTralala', 1), seed).state.winner === 'a') wins++;
    }
    expect(wins).toBeGreaterThan(32);
  });

  it('结束后 legalActions 为空、applyAction 不再推进', () => {
    const { state } = autoRun(mk('TrippiTroppi', 15), mk('TralaleroTralala', 1), 5);
    expect(legalActions(state)).toEqual([]);
    const r = applyAction(state, { kind: 'attack', target: { team: 'b', id: 'TralaleroTralala' } });
    expect(r.events).toEqual([]);
  });
});

describe('倒地与胜负（1v1 退化）', () => {
  it('对方被打至倒地即判负（倒地不可补刀，全员倒地立即结束）', () => {
    // 强者打弱者：弱者倒地的那一刻战斗结束（1v1 下对方全倒）
    const { state, events } = autoRun(mk('TungSahur', 15, ['flurry']), mk('TralaleroTralala', 1), 11);
    const downedIdx = events.findIndex((e) => e.t === 'downed');
    const endIdx = events.findIndex((e) => e.t === 'end');
    expect(downedIdx).toBeGreaterThanOrEqual(0); // 出现倒地
    expect(endIdx).toBeGreaterThan(downedIdx); // 倒地后即结束
    expect(state.winner).toBe('a'); // 强者胜
    // 弱者是倒地（不是被补刀彻底死亡，游戏已先结束）
    expect(state.teams.b[0]!.downed).toBe(true);
  });
});

describe('能量系统（普攻攒能、技能耗能）', () => {
  it('能量从 0 起；普攻命中 +1；0 能量技能随时可用', () => {
    const a = mk('TrippiTroppi', 8, ['brave_strike', 'feint']);
    const b = mk('TrippiTroppi', 15);
    let st = firstTurnOf(a, b, 'a');
    expect(st.teams.a[0]!.energy).toBe(0);
    // 0 能量时 brave(cost1) 不可用，但 feint(cost0) 可用
    let acts = legalActions(st);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'brave_strike')).toBe(false);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'feint')).toBe(true);
    // 普攻命中才攒能量：反复打直到一次命中，能量至少升到 1
    // （≥ 而非 =：过程中 b 的反击若 miss，a 还会因「闪避回能」额外 +1）
    st = attackUntilHit(st, 'a', 'TrippiTroppi', 'b', 'TrippiTroppi');
    expect(st.teams.a[0]!.energy).toBeGreaterThanOrEqual(1);
  });

  it('攒够能量后可放技能，放完能量扣除', () => {
    const a = mk('TrippiTroppi', 8, ['brave_strike']); // cost 1
    const b = mk('TrippiTroppi', 15);
    let st = firstTurnOf(a, b, 'a');
    // a 普攻命中攒 1 能量（命中才回，反复打到命中并回到 a 的回合）
    st = attackUntilHit(st, 'a', 'TrippiTroppi', 'b', 'TrippiTroppi');
    while (currentFighter(st)!.team !== 'a') {
      st = applyAction(st, { kind: 'attack', target: { team: 'a', id: 'TrippiTroppi' } }).state;
    }
    expect(st.teams.a[0]!.energy).toBeGreaterThanOrEqual(1);
    const brave = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike',
    )!;
    expect(brave.usable).toBe(true);
    const before = st.teams.a[0]!.energy;
    st = applyAction(st, brave.action).state;
    expect(st.teams.a[0]!.energy).toBe(before - 1); // 扣 1
  });

  it('能量不足时技能标 usable:false + 理由"能量不足"', () => {
    const a = mk('TrippiTroppi', 8, ['brave_strike']);
    const b = mk('TrippiTroppi', 15);
    const st = firstTurnOf(a, b, 'a'); // 能量 0
    const opt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike',
    );
    expect(opt?.usable).toBe(false);
    expect(opt?.reason).toBe('能量不足');
  });
});

describe('CON 被动吸血', () => {
  it('高CON角色命中造成伤害时回血', () => {
    const a = mk('LiriliLarila', 10); // 高 CON
    const b = mk('ChimpanziniBananini', 1); // 脆皮，易命中（不用 Tralalero：其被动先攻必先手）
    let st = firstTurnOf(a, b, 'a');
    st.teams.a[0]!.hp = 5; // 压低血量
    let sawLifesteal = false;
    for (let i = 0; i < 30 && !sawLifesteal; i++) {
      if (currentFighter(st)?.team === 'a') {
        const r = applyAction(st, { kind: 'attack', target: { team: 'b', id: 'ChimpanziniBananini' } });
        if (r.events.some((e) => e.t === 'lifesteal')) sawLifesteal = true;
        st = r.state;
      } else {
        st = applyAction(st, { kind: 'attack', target: { team: 'a', id: 'LiriliLarila' } }).state;
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

/**
 * 让 (atkTeam,atkId) 反复普攻 (defTeam,defId)，直到一次命中并回到攻击者回合。
 * 用于"命中才回能量"的测试（单次普攻可能 miss）。非攻击者回合则用普攻推进。
 */
function attackUntilHit(
  st: BattleState,
  atkTeam: 'a' | 'b',
  atkId: string,
  defTeam: 'a' | 'b',
  defId: string,
): BattleState {
  for (let i = 0; i < 100; i++) {
    const cur = currentFighter(st)!;
    if (cur.team === atkTeam && cur.id === atkId) {
      const r = applyAction(st, { kind: 'attack', target: { team: defTeam, id: defId } });
      st = r.state;
      if (r.events.some((e) => e.t === 'hit' && e.hit)) return st;
    } else {
      // 其他角色普攻推进回合
      const enemy = cur.team === 'a' ? { team: 'b' as const, id: defTeam === 'b' ? defId : atkId } : { team: 'a' as const, id: defTeam === 'a' ? defId : atkId };
      st = applyAction(st, { kind: 'attack', target: enemy }).state;
    }
    if (isOver(st)) return st;
  }
  return st;
}

// ─────────────────────────────── 3v3 ───────────────────────────────

import { chooseAction } from './ai.js';

const TEAM_A: Combatant[] = [mk('TungSahur', 10), mk('TrippiTroppi', 10), mk('TralaleroTralala', 10)];
const TEAM_B: Combatant[] = [mk('CappuccinoAssassino', 10), mk('LiriliLarila', 10), mk('BombombiniGusini', 10)];

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

  it('结束时至少一方全员出局（倒地或彻底死亡）', () => {
    const { state } = auto3v3(13);
    const out = (f: { downed: boolean; dead: boolean }) => f.downed || f.dead;
    const aAllOut = state.teams.a.every(out);
    const bAllOut = state.teams.b.every(out);
    expect(aAllOut || bAllOut).toBe(true);
  });

  it('确定性：相同种子同样的 3v3 过程', () => {
    expect(auto3v3(42).events).toEqual(auto3v3(42).events);
  });
});

describe('AOE / 团队技能', () => {
  it('烈焰风暴一次命中多个敌人（产生多条 hit/damage）', () => {
    const caster: Combatant[] = [mk('CappuccinoAssassino', 10, ['firestorm'])];
    const enemies = TEAM_B;
    let st = createBattle(caster, enemies, 0).state;
    // 试种子直到我方(a)先手
    for (let seed = 0; seed < 200 && currentFighter(st)?.team !== 'a'; seed++) {
      st = createBattle(caster, enemies, seed).state;
    }
    expect(currentFighter(st)?.team).toBe('a');
    st.teams.a[0]!.energy = 9; // 给够能量放 firestorm(cost2)
    const fire = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'firestorm',
    )!;
    const r = applyAction(st, fire.action);
    const hits = r.events.filter((e) => e.t === 'hit');
    expect(hits.length).toBeGreaterThanOrEqual(2); // 命中多个敌人
  });

  it('治疗术回复友方生命', () => {
    const allies: Combatant[] = [mk('BrrBrrPatapim', 10, ['heal']), mk('TrippiTroppi', 10)];
    let st = createBattle(allies, [mk('TralaleroTralala', 1)], 0).state;
    for (let seed = 0; seed < 200 && currentFighter(st)?.id !== 'BrrBrrPatapim'; seed++) {
      st = createBattle(allies, [mk('TralaleroTralala', 1)], seed).state;
    }
    // 压低队友血量
    const ally = find(st, { team: 'a', id: 'TrippiTroppi' })!;
    ally.hp = 5;
    st.teams.a[0]!.energy = 9; // 给够能量放 heal(cost1)
    const healOpt = allActions(st).find(
      (o) => o.action.kind === 'skill' && o.action.skill === 'heal',
    );
    // 让治疗目标指向受伤的 Trippi Troppi
    if (healOpt && healOpt.action.kind === 'skill') {
      const r = applyAction(st, { kind: 'skill', skill: 'heal', targets: [{ team: 'a', id: 'TrippiTroppi' }] });
      const heal = r.events.find((e) => e.t === 'heal');
      expect(heal?.t).toBe('heal');
      if (heal?.t === 'heal') expect(heal.hpLeft).toBeGreaterThan(5);
    }
  });
});
