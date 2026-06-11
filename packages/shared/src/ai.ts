/**
 * PvE 敌人 AI —— 两档：random（随机）/ greedy（贪心，1-ply 真实推演）。
 *
 * 贪心思路：枚举"动作 × 目标"的全部候选，对每个候选用**真实引擎**推演一步
 * （K 个派生种子采样掷骰结果），取局面评估 evaluate() 平均值最高者。
 *
 * 为什么推演而不是手写公式：手写期望公式会和引擎规则脱节（历史教训：
 * precise_aim 被高估导致 AI 永不攒能量、签名技能按 category 兜底导致
 * 辅助/防御型签名 0% 使用率）。推演跑的是真引擎，命中/暴击/豁免/被动/
 * 联动全部自动覆盖；新技能加进 effects.ts 后 AI 立即"会用"，无需改本文件。
 *
 * 确定性：推演种子从传入 seed 派生（不偷看战斗真实 RNG 游标，无未卜先知）。
 * 同 state + 同 seed 恒返回同一动作。
 */
import { Rng } from './rng.js';
import {
  legalActions,
  legalTargets,
  applyAction,
  currentFighter,
  aliveOf,
  type Action,
  type BattleState,
  type FighterRT,
} from './battle.js';
import { otherSide } from './battleTypes.js';
import { skillDef } from './skills.js';
import { evaluate } from './evaluate.js';

export type AiLevel = 'random' | 'greedy';

/** 统一入口：按难度选 AI。默认贪心。 */
export function chooseAction(state: BattleState, seed: number, level: AiLevel = 'greedy'): Action {
  return level === 'random' ? chooseActionRandom(state, seed) : chooseActionGreedy(state, seed);
}

// ─────────────────────────────────────────────────────────────────────────
// 随机 AI（简单档）
// ─────────────────────────────────────────────────────────────────────────

export function chooseActionRandom(state: BattleState, seed: number): Action {
  const cur = currentFighter(state);
  const actions = legalActions(state);
  if (actions.length === 0 || !cur) return fallbackAttack(state, cur);
  const rng = new Rng(seed);
  const chosen = actions[rng.int(0, actions.length - 1)]!;
  return retarget(state, cur, chosen, (targs) => targs[rng.int(0, targs.length - 1)]!);
}

// ─────────────────────────────────────────────────────────────────────────
// 贪心 AI（1-ply 推演）
// ─────────────────────────────────────────────────────────────────────────

/** 每个候选动作的推演采样数。越大越稳（命中/豁免估计更准）但越慢。 */
export const ROLLOUT_SAMPLES = 4;
/** 同分抖动幅度（保留少量变化、不死板）。相对 V 的动作间典型差距（5~15）应足够小。 */
const JITTER = 0.3;

export function chooseActionGreedy(state: BattleState, seed: number): Action {
  const cur = currentFighter(state);
  if (!cur) return fallbackAttack(state, cur);
  const candidates = enumerateCandidates(state, cur);
  if (candidates.length === 0) return fallbackAttack(state, cur);
  if (candidates.length === 1) return candidates[0]!;

  const rng = new Rng(seed);
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const a of candidates) {
    let sum = 0;
    for (let k = 0; k < ROLLOUT_SAMPLES; k++) {
      // 同一 k 对所有候选用同一扰动游标 → 配对采样，降低比较方差
      const probe: BattleState = { ...state, rngCursor: mixCursor(state.rngCursor, seed, k) };
      sum += evaluate(applyAction(probe, a).state, cur.team);
    }
    const score = sum / ROLLOUT_SAMPLES + rng.next() * JITTER;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}

/** 枚举"动作 × 目标"候选：单体动作对每个合法目标各生成一个候选。 */
function enumerateCandidates(state: BattleState, cur: FighterRT): Action[] {
  const out: Action[] = [];
  for (const a of legalActions(state)) {
    if (a.kind === 'attack') {
      for (const t of legalTargets(state, cur, 'one_enemy')) out.push({ kind: 'attack', target: t });
      continue;
    }
    const tt = skillDef(a.skill).targetType;
    if (tt === 'one_enemy' || tt === 'one_ally') {
      for (const t of legalTargets(state, cur, tt)) out.push({ kind: 'skill', skill: a.skill, targets: [t] });
    } else {
      out.push(a); // self / 全体类目标已由 legalActions 填好
    }
  }
  return out;
}

/** 从 (战斗游标, AI 种子, 采样序号) 派生推演游标：确定性，且不复用真实游标（无未卜先知）。 */
function mixCursor(cursor: number, seed: number, k: number): number {
  let h = (cursor ^ Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────────────────

const ref = (f: FighterRT) => ({ team: f.team, id: f.id });

function fallbackAttack(state: BattleState, cur: FighterRT | undefined): Action {
  const enemy = cur ? aliveOf(state, otherSide(cur.team))[0] : undefined;
  return { kind: 'attack', target: enemy ? ref(enemy) : { team: 'b', id: '' } };
}

/** 随机 AI 用：给单体动作换一个随机合法目标。 */
function retarget(
  state: BattleState,
  cur: FighterRT,
  chosen: Action,
  pick: (targs: ReturnType<typeof legalTargets>) => { team: 'a' | 'b'; id: string },
): Action {
  if (chosen.kind === 'attack') {
    const enemies = aliveOf(state, otherSide(cur.team)).filter((e) => !e.downed);
    if (enemies.length > 0) return { kind: 'attack', target: pick(enemies.map(ref)) };
    return chosen;
  }
  const tt = skillDef(chosen.skill).targetType;
  if (tt === 'one_enemy' || tt === 'one_ally') {
    const targs = legalTargets(state, cur, tt);
    if (targs.length > 0) return { kind: 'skill', skill: chosen.skill, targets: [pick(targs)] };
  }
  return chosen;
}
