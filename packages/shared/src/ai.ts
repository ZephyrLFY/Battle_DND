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
  currentFighter,
  aliveOf,
  type Action,
  type BattleState,
} from './battle.js';
import { otherTeam } from './battleTypes.js';

/**
 * 为当前行动方选一个动作 + 目标（纯随机）。
 * legalActions 已带默认目标；随机从中选一个。
 * @param seed 决定随机选择的种子（同 state+seed 恒等输出，便于复现）
 *
 * TODO(ai): 当前是纯随机（动作和目标都随机）。后续迭代：选目标优先打残血/救倒地队友、
 *           AOE 多目标时机、低血防御、难度分级。
 */
export function chooseAction(state: BattleState, seed: number): Action {
  const actions = legalActions(state);
  if (actions.length === 0) {
    // 无合法动作（被眩晕/倒地等）：给个会被引擎忽略的占位普攻
    const cur = currentFighter(state);
    const enemy = cur ? aliveOf(state, otherTeam(cur.team))[0] : undefined;
    return { kind: 'attack', target: enemy ? { team: enemy.team, id: enemy.id } : { team: 'b', id: '' } };
  }
  const rng = new Rng(seed);
  const idx = rng.int(0, actions.length - 1);
  return actions[idx]!;
}
