import { describe, it, expect } from 'vitest';
import {
  createBattle,
  legalActions,
  allActions,
  applyAction,
  isOver,
  type BattleState,
  type Action,
} from './battle.js';
import { newPokemon, type PokemonInstance } from './pokemon.js';
import type { SkillId } from './skills.js';

function withSkills(species: string, level: number, skills: SkillId[]): PokemonInstance {
  const p = newPokemon(species);
  p.level = level;
  p.skills = skills;
  return p;
}

/** 把整场战斗用"双方都普攻"跑完，返回所有事件 + 终局。 */
function autoBattleAllAttack(a: PokemonInstance, b: PokemonInstance, seed: number) {
  let { state, events } = createBattle(a, b, seed);
  const all = [...events];
  let guard = 0;
  while (!isOver(state) && guard++ < 2000) {
    const acts = legalActions(state);
    const act: Action = acts[0] ?? { kind: 'attack' };
    const r = applyAction(state, act);
    state = r.state;
    all.push(...r.events);
  }
  return { state, events: all };
}

describe('createBattle — 初始化', () => {
  it('产出 start 事件、含先攻明细，turn 等于先手方', () => {
    const { state, events } = createBattle(newPokemon('Onix'), newPokemon('Pikachu'), 1);
    const start = events[0];
    expect(start?.t).toBe('start');
    if (start?.t === 'start') {
      expect(state.turn).toBe(start.first);
      expect(start.initiative.a.rolls).toHaveLength(1);
    }
  });

  it('HP 初始为各自 maxHp', () => {
    const { state } = createBattle(newPokemon('Muk'), newPokemon('Pikachu'), 1);
    expect(state.a.hp).toBe(state.a.stats.maxHp);
    expect(state.b.hp).toBe(state.b.stats.maxHp);
  });
});

describe('确定性', () => {
  it('相同种子 + 相同动作序列 => 相同事件流', () => {
    const a = newPokemon('Charmander');
    const b = newPokemon('Onix');
    const r1 = autoBattleAllAttack({ ...a, level: 8 }, { ...b, level: 8 }, 99);
    const r2 = autoBattleAllAttack({ ...a, level: 8 }, { ...b, level: 8 }, 99);
    expect(r1.events).toEqual(r2.events);
    expect(r1.state.winner).toBe(r2.state.winner);
  });

  it('applyAction 不修改传入 state（纯函数）', () => {
    const { state } = createBattle(newPokemon('Onix'), newPokemon('Pikachu'), 3);
    const before = JSON.stringify(state);
    applyAction(state, { kind: 'attack' });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('战斗收敛与胜负', () => {
  it('普攻到底一定分出胜负，不触发安全上限', () => {
    const { state } = autoBattleAllAttack(
      withSkills('Onix', 10, []),
      withSkills('Pikachu', 3, []),
      7,
    );
    expect(isOver(state)).toBe(true);
    expect(state.winner).not.toBeUndefined();
  });

  it('结束后 legalActions 为空、applyAction 不再推进', () => {
    const { state } = autoBattleAllAttack(withSkills('Onix', 12, []), withSkills('Pikachu', 1, []), 5);
    expect(legalActions(state)).toEqual([]);
    const r = applyAction(state, { kind: 'attack' });
    expect(r.events).toEqual([]);
  });
});

describe('legalActions — 技能可选性与 CD', () => {
  it('已学技能未在 CD 时出现在可选动作里', () => {
    const a = withSkills('Hitmonlee', 5, ['brave_strike']);
    const b = withSkills('Onix', 5, []);
    // 让 a 先手：试种子直到 a 先动
    let st: BattleState | null = null;
    for (let seed = 0; seed < 50; seed++) {
      const { state } = createBattle(a, b, seed);
      if (state.turn === 'a') {
        st = state;
        break;
      }
    }
    expect(st).not.toBeNull();
    const acts = legalActions(st!);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'brave_strike')).toBe(true);
  });

  it('耗位法术用尽法术位后不可用；戏法（cost0）始终可用', () => {
    // Onix Lv3 → maxSlots = 1+floor(3/4) = 1，只能放一次耗位法术
    const a = withSkills('Onix', 3, ['brave_strike', 'shield_block']); // 法术 + 戏法各一
    const b = withSkills('Onix', 15, []); // 厚血陪练，撑得久
    let st: BattleState | null = null;
    for (let seed = 0; seed < 80; seed++) {
      const { state } = createBattle(a, b, seed);
      if (state.turn === 'a') {
        st = state;
        break;
      }
    }
    expect(st).not.toBeNull();
    let state = st!;
    expect(state.a.slots).toBe(1);

    // a 放 brave_strike（耗 1 位）
    state = applyAction(state, { kind: 'skill', skill: 'brave_strike' }).state;
    expect(state.a.slots).toBe(0);
    state = applyAction(state, { kind: 'attack' }).state; // b 普攻

    // 回到 a：耗位法术不再可用，但戏法 shield_block 仍在
    expect(state.turn).toBe('a');
    const acts = legalActions(state);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'brave_strike')).toBe(false);
    expect(acts.some((x) => x.kind === 'skill' && x.skill === 'shield_block')).toBe(true);
  });

  it('allActions 把不可用法术也列出来并标 usable:false + 理由', () => {
    const a = withSkills('Onix', 3, ['brave_strike']);
    const b = withSkills('Onix', 15, []);
    let st: BattleState | null = null;
    for (let seed = 0; seed < 80; seed++) {
      const { state } = createBattle(a, b, seed);
      if (state.turn === 'a') { st = state; break; }
    }
    let state = st!;
    state = applyAction(state, { kind: 'skill', skill: 'brave_strike' }).state; // 耗光
    state = applyAction(state, { kind: 'attack' }).state;
    const opts = allActions(state);
    const brave = opts.find((o) => o.action.kind === 'skill' && o.action.skill === 'brave_strike');
    expect(brave?.usable).toBe(false);
    expect(brave?.reason).toBe('无法术位');
  });
});

describe('技能效果', () => {
  it('CON 被动吸血：高 CON 攻击者命中造成伤害时回血，且不超过 maxHp', () => {
    // Muk 高 CON → lifestealRate>0；打脆皮 Pikachu 确保能命中造成伤害
    const a = withSkills('Muk', 10, []);
    const b = withSkills('Pikachu', 1, []);
    let st: BattleState | null = null;
    for (let seed = 0; seed < 80; seed++) {
      const { state } = createBattle(a, b, seed);
      if (state.turn === 'a' && state.a.stats.lifestealRate > 0) {
        st = state;
        break;
      }
    }
    expect(st).not.toBeNull();
    let state = st!;
    state.a.hp = 5; // 压低血量，便于观察回血
    // 反复普攻直到出现一次 lifesteal（命中且造成伤害才触发）
    let sawLifesteal = false;
    for (let i = 0; i < 20 && !sawLifesteal && state.turn === 'a'; i++) {
      const r = applyAction(state, { kind: 'attack' });
      const ls = r.events.find((e) => e.t === 'lifesteal');
      if (ls && ls.t === 'lifesteal') {
        expect(ls.amount).toBeGreaterThan(0);
        expect(ls.hpLeft).toBeLessThanOrEqual(r.state.a.stats.maxHp);
        sawLifesteal = true;
      }
      state = r.state;
      if (state.turn === 'b') state = applyAction(state, { kind: 'attack' }).state;
    }
    expect(sawLifesteal).toBe(true);
  });

  it('低 CON 攻击者无吸血（lifestealRate 0）', () => {
    expect(createBattle(newPokemon('Pikachu'), newPokemon('Onix'), 1).state.a.stats.lifestealRate).toBe(0);
  });
});
