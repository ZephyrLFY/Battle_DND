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
 * 见 DND_COMBAT.md 第七节 / 设计决策：MVP 先纯随机。
 */
import { Rng } from './rng.js';
import { legalActions, type Action, type BattleState } from './battle.js';

/**
 * 为当前行动方选一个动作（纯随机）。
 * @param state 当前战斗状态
 * @param seed  决定随机选择的种子（同 state+seed 恒等输出，便于复现）
 */
export function chooseAction(state: BattleState, seed: number): Action {
  const actions = legalActions(state);
  if (actions.length === 0) return { kind: 'attack' }; // 被眩晕等情况：动作会被引擎忽略
  const rng = new Rng(seed);
  const idx = rng.int(0, actions.length - 1);
  return actions[idx]!;
}
