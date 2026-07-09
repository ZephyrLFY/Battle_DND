/**
 * 局面评估 V(state, side) —— 1-ply 推演 AI 的价值函数。
 *
 * 关键思想：技能是开放集合（会一直加），但 FighterRT 的状态字段是封闭集合；
 * 所有技能与被动的效果最终都落在这些字段上。给字段标价一次，
 * 所有现有/未来的技能就自动获得正确评估——AI 不再需要 per-skill 公式，
 * 也永远不会和引擎规则脱节（推演跑的是真引擎）。
 *
 * 所有权重集中在 VW，调 AI 风格 = 调这张表：
 * - 调大 energy → 更囤资源；调大 alive/lowHpFactor → 更爱集火斩杀/救人；
 * - 调大 stunnedTurn → 更爱控制；等等。
 */
import type { BattleState, FighterRT, Side } from './battleTypes.js';

/** 评估权重（单位约等于 1 点 HP 的价值）。 */
export const VW = {
  /** 一个能行动的身位本身的价值（行动经济）。倒地/死亡即失去。 */
  alive: 12,
  /** 残血段（≤25% maxHp 的那部分 HP）每点额外加权：让"斩杀残血/抢救濒死"高于均匀刮痧。 */
  lowHpFactor: 0.8,
  /** 每点能量的价值（机会成本：留着能换成更强的技能输出）。 */
  energy: 2.2,
  /** 每个昏迷回合：对方少一次行动。 */
  stunnedTurn: -6,
  /** 蓄力完成（下次攻击 4d6，仍需命中）。 */
  charged: 7,
  /** 每个灼烧剩余回合（期望 −2 HP/回合）。 */
  burnTurn: -2,
  /** 战吼/华尔兹增益生效中（下次攻击 +2 命中 +2 伤害）。 */
  rally: 3.5,
  /** 通用伤害增益（华尔兹舞步强化）生效中，每点。 */
  dmgBuffPoint: 0.8,
  /** 每点临时 AC。 */
  acBonusPoint: 1.5,
  /** 每层反弹。 */
  thornsLayer: 1.5,
  /** 石化减伤生效中，每点减免量。 */
  stonePoint: 1.5,
  /** 命中惩罚（哈气/撞退）生效中，每点。 */
  hitPenaltyPoint: -0.8,
  /** AC 减益（佯攻破甲）生效中，每点。 */
  acDebuffPoint: -0.9,
  /** 控制免疫每回合。 */
  controlImmuneTurn: 0.4,
  /**
   * 每个额外回合（时间静止）≈ 一次行动的全部价值（输出/攒能/选择权），
   * 另含隐藏 tempo：连续行动发生在敌方插手之前（1-ply 推演看不到这层，用权重补）。
   */
  extraTurn: 10,
  /** 倒地者的残值（还能被复活救回）。 */
  downedSalvage: 3,
  /** 每个已倒地回合的衰减（越接近彻底死亡越不值钱）。 */
  downedTurnDecay: -1,
  /** 胜负既定。 */
  winner: 400,
  /**
   * 被动叠层标价（passiveState 里有跨回合价值的键）。
   * 推演只看一步，叠层的未来价值（下次引爆/追加）需要显式标价，
   * 否则 AI 会把"攒层数"当作零收益。九命未用 = 隐形 +6 血条，用掉后扣除。
   */
  passiveStacks: {
    'tung.hits': 1.2,
    'bombombini.gunpowder': 1.5,
    'trippi.ninthUsed': -6,
  } as Record<string, number>,
};

/** 单个角色对其所在方的价值。 */
export function fighterValue(f: FighterRT): number {
  if (f.dead) return 0;
  if (f.downed) return Math.max(0, VW.downedSalvage + VW.downedTurnDecay * f.downedTurns);

  let v = VW.alive + f.hp;
  // 残血段加权：HP 的最后 1/4 每点更值钱（保命/斩杀的非线性）。
  v += Math.min(f.hp, f.stats.maxHp * 0.25) * VW.lowHpFactor;

  // 能量边际递减：能量已无硬上限，但估值必须递减——接近基准线（maxEnergy）半价、
  // 超过基准线 1/4 价。否则 AI 会觉得"囤能=稳定增值"而永远舍不得放技能。
  const cap = f.stats.maxEnergy;
  for (let i = 1; i <= f.energy; i++) v += (i > cap ? 0.25 : i > cap - 2 ? 0.5 : 1) * VW.energy;
  v += f.stunned * VW.stunnedTurn;
  if (f.charged) v += VW.charged;
  if (f.rallyTurns > 0) v += VW.rally;
  if (f.dmgBuffTurns > 0) v += f.dmgBuffAmt * VW.dmgBuffPoint;
  if (f.acBonusTurns > 0) v += f.acBonus * VW.acBonusPoint;
  v += f.thorns * VW.thornsLayer;
  if (f.stoneTurns > 0) v += f.stoneAmount * VW.stonePoint;
  if (f.hitPenaltyTurns > 0) v += f.hitPenaltyAmt * VW.hitPenaltyPoint;
  if (f.acDebuffTurns > 0) v += f.acDebuffAmt * VW.acDebuffPoint;
  v += f.controlImmuneTurns * VW.controlImmuneTurn;
  v += f.burnTurns * VW.burnTurn;
  v += f.extraTurns * VW.extraTurn;

  for (const [key, w] of Object.entries(VW.passiveStacks)) {
    const n = f.passiveState[key];
    if (n) v += n * w;
  }
  return v;
}

/** 从 side 方视角评估整个局面（己方价值 − 敌方价值，胜负压倒一切）。 */
export function evaluate(state: BattleState, side: Side): number {
  if (state.winner !== undefined) {
    if (state.winner === null) return 0;
    return state.winner === side ? VW.winner : -VW.winner;
  }
  let v = 0;
  for (const f of state.teams[side]) v += fighterValue(f);
  for (const f of state.teams[side === 'a' ? 'b' : 'a']) v -= fighterValue(f);
  return v;
}
