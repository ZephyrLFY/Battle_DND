/**
 * PvE 敌人 AI。
 *
 * 当前实现：纯随机——从合法动作里等概率选一个。确定性（走传入的 RNG / 种子）。
 *
 * TODO(ai): 这是占位实现，后续要迭代成更聪明的 AI。计划方向：
 *   - 贪心：优先选期望伤害最高的动作（考虑命中率 × 平均伤害）
 *   - 低血时倾向防御/回复（生命汲取、石化、护盾）
 *   - 蓄力重击的时机判断（对方不会打断时才蓄力）
 *   - 难度分级（简单=随机，普通=贪心，困难=带预判）
 * MVP 先纯随机。
 */
import { Rng } from './rng.js';
import {
  legalActions,
  legalTargets,
  currentFighter,
  aliveOf,
  type Action,
  type BattleState,
} from './battle.js';
import { otherSide } from './battleTypes.js';
import { skillDef } from './skills.js';

/**
 * 为当前行动方选一个动作 + 目标（纯随机）。
 * 先随机选动作，再对单体动作随机选目标（3v3 下不总打同一个）。
 * @param seed 决定随机选择的种子（同 state+seed 恒等输出，便于复现）
 *
 * TODO(ai): 当前纯随机（动作+目标都随机）。后续迭代：优先打残血/救倒地队友、
 *           AOE 多目标时机、低血防御、难度分级。
 */
export function chooseAction(state: BattleState, seed: number): Action {
  const cur = currentFighter(state);
  const actions = legalActions(state);
  if (actions.length === 0 || !cur) {
    // 无合法动作（被眩晕/倒地等）：给个会被引擎忽略的占位普攻
    const enemy = cur ? aliveOf(state, otherSide(cur.team))[0] : undefined;
    return { kind: 'attack', target: enemy ? { team: enemy.team, id: enemy.id } : { team: 'b', id: '' } };
  }
  const rng = new Rng(seed);
  const chosen = actions[rng.int(0, actions.length - 1)]!;

  // 单体动作：在合法目标里随机换一个（让 3v3 选目标有变化）
  if (chosen.kind === 'attack') {
    const enemies = aliveOf(state, otherSide(cur.team)).filter((e) => !e.downed);
    if (enemies.length > 0) {
      const e = enemies[rng.int(0, enemies.length - 1)]!;
      return { kind: 'attack', target: { team: e.team, id: e.id } };
    }
  } else {
    const tt = skillDef(chosen.skill).targetType;
    if (tt === 'one_enemy' || tt === 'one_ally') {
      const targs = legalTargets(state, cur, tt);
      if (targs.length > 0) {
        return { kind: 'skill', skill: chosen.skill, targets: [targs[rng.int(0, targs.length - 1)]!] };
      }
    }
  }
  return chosen;
}
