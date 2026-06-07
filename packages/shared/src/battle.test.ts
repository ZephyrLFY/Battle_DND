import { describe, it, expect } from 'vitest';
import {
  createBattle,
  legalActions,
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

  it('cooldown:1 的技能用过后，下个本方回合不可用，再下个回合恢复', () => {
    // 构造 a 先手、双方都活很久的对局，跟踪 brave_strike 可用性
    const a = withSkills('Onix', 15, ['brave_strike']); // 高血厚，撑得久
    const b = withSkills('Onix', 15, []);
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
    // a 放 brave_strike
    state = applyAction(state, { kind: 'skill', skill: 'brave_strike' }).state;
    // 轮到 b，普攻
    state = applyAction(state, { kind: 'attack' }).state;
    // 回到 a：cooldown:1 应仍在冷却（不可用）
    expect(state.turn).toBe('a');
    const actsCd = legalActions(state);
    expect(actsCd.some((x) => x.kind === 'skill')).toBe(false);
    // a 普攻，b 普攻
    state = applyAction(state, { kind: 'attack' }).state;
    state = applyAction(state, { kind: 'attack' }).state;
    // 再回到 a：应恢复可用
    expect(state.turn).toBe('a');
    const actsReady = legalActions(state);
    expect(actsReady.some((x) => x.kind === 'skill' && x.skill === 'brave_strike')).toBe(true);
  });
});

describe('技能效果', () => {
  it('生命汲取：低血时回血且不超过 maxHp', () => {
    const a = withSkills('Muk', 10, ['life_drain']); // 高 CON
    const b = withSkills('Hitmonlee', 10, []);
    let st: BattleState | null = null;
    for (let seed = 0; seed < 80; seed++) {
      const { state } = createBattle(a, b, seed);
      if (state.turn === 'a') {
        st = state;
        break;
      }
    }
    let state = st!;
    state.a.hp = 5; // 人为压低血量
    const r = applyAction(state, { kind: 'skill', skill: 'life_drain' });
    const heal = r.events.find((e) => e.t === 'heal');
    expect(heal?.t).toBe('heal');
    if (heal?.t === 'heal') {
      expect(heal.amount).toBeGreaterThan(0);
      expect(heal.hpLeft).toBeLessThanOrEqual(r.state.a.stats.maxHp);
    }
  });
});
