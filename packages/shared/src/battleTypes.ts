/**
 * 战斗相关的共享类型 —— 抽出来避免 battle.ts ↔ effects.ts 循环依赖。
 *
 * NvN 设计：两队各 N 个角色，一条先攻序列轮转。1v1 是 N=1 的特例。
 */
import type { DerivedStats } from './combatant.js';
import type { SkillId } from './skills.js';

export type Side = 'a' | 'b';
export const otherSide = (t: Side): Side => (t === 'a' ? 'b' : 'a');

/** 战斗中引用某个角色的稳定标识。 */
export interface FighterRef {
  team: Side;
  id: string;
}

export function refEq(x: FighterRef, y: FighterRef): boolean {
  return x.team === y.team && x.id === y.id;
}

/** 战斗中一个角色的临场可变状态。 */
export interface FighterRT {
  id: string; // 队内唯一（archetypeId，队内不重复 → 可直接当 id）
  team: Side;
  archetypeId: string;
  name: string;
  level: number;
  stats: DerivedStats;
  hp: number;
  /** 已学技能。 */
  skills: SkillId[];
  /** 当前能量（从 0 起，普攻命中 +1，放技能消耗，上限 stats.maxEnergy）。 */
  energy: number;

  // —— 状态 ——
  /** 倒地：HP≤0 但未彻底死亡，不能行动，可被救活。 */
  downed: boolean;
  /** 彻底死亡：移出战斗与先攻序列。 */
  dead: boolean;
  /** 剩余昏迷回合（被眩晕）。>0 时本方回合被跳过。 */
  stunned: number;
  /** 石化减伤：剩余回合数 + 每次减免量。 */
  stoneTurns: number;
  stoneAmount: number;
  /** 本回合 AC 临时加成（护盾格挡），自己下个回合开始清零。 */
  acBonus: number;
  /** 护盾反弹层数（被攻击反弹 1d4）。 */
  thorns: number;
  /** 蓄力：下次攻击强化（charge_smash）。 */
  charged: boolean;
  /** 战吼增益：剩余回合内攻击命中 +2。 */
  rallyTurns: number;
}

/** 玩家/AI 的一个动作。技能可带多个目标（AOE/全体）。 */
export type Action =
  | { kind: 'attack'; target: FighterRef }
  | { kind: 'skill'; skill: SkillId; targets: FighterRef[] };

/** 战斗状态（可序列化）。 */
export interface BattleState {
  teams: { a: FighterRT[]; b: FighterRT[] };
  /** 先攻序列：按 1d20+DEX 降序排好的全体角色引用。dead 的会被移除。 */
  order: FighterRef[];
  /** 当前轮到 order 里第几个。 */
  turnIndex: number;
  round: number;
  rngCursor: number;
  /** 结束时的胜方；进行中为 undefined。null = 平局（双方全灭）。 */
  winner?: Side | null;
}

// ─── 事件流（前端回放/日志用，带骰子明细）───
import type { RollDetail } from './dice.js';

export interface HitRollInfo {
  natural: number;
  bonus: number;
  total: number;
  nat20: boolean;
  nat1: boolean;
}

export interface FighterPublic {
  ref: FighterRef;
  archetypeId: string;
  name: string;
  level: number;
  maxHp: number;
  ac: number;
  skills: SkillId[];
  maxEnergy: number;
}

export type BattleEvent =
  | { t: 'start'; order: FighterRef[]; fighters: FighterPublic[]; initiative: Record<string, RollDetail> }
  | { t: 'turn'; who: FighterRef; round: number }
  | { t: 'skip'; who: FighterRef; why: 'downed' | 'stunned' }
  | { t: 'action'; who: FighterRef; action: Action; skillName?: string }
  | { t: 'energy'; who: FighterRef; delta: number; now: number; spent?: SkillId } // 能量变化（+普攻攒/−技能耗）
  | { t: 'hit'; by: FighterRef; to: FighterRef; roll: HitRollInfo; hit: boolean; crit: boolean; vsAc: number }
  | { t: 'damage'; to: FighterRef; roll: RollDetail; mitigated: number; dealt: number; hpLeft: number }
  | { t: 'lifesteal'; who: FighterRef; amount: number; hpLeft: number }
  | { t: 'heal'; who: FighterRef; roll: RollDetail; amount: number; hpLeft: number }
  | { t: 'thorns'; to: FighterRef; roll: RollDetail; dealt: number; hpLeft: number }
  | { t: 'buff'; who: FighterRef; note: string }
  | { t: 'downed'; who: FighterRef }
  | { t: 'revive'; who: FighterRef; hpLeft: number }
  | { t: 'dead'; who: FighterRef }
  | { t: 'end'; winner: Side | null };

/**
 * 技能效果 handler 的执行上下文。
 * 引擎构造好 ctx 交给各技能的 effect 函数，effect 只管"对谁做什么"，
 * 共享的攻击/伤害管线由 ctx.attack 提供，避免每个技能重复实现。
 */
export interface EffectCtx {
  actor: FighterRT;
  /** 已解析的目标（引擎据技能 targetType 收集好）。 */
  targets: FighterRT[];
  rng: import('./rng.js').Rng;
  emit: (e: BattleEvent) => void;
  /** 共享攻击管线：actor 攻击 target，可带强化修正。 */
  attack: (target: FighterRT, mods?: AttackMods) => void;
  /** 直接造成/回复，不走命中判定（治疗、AOE 固伤等用）。 */
  heal: (who: FighterRT, amount: number, roll: RollDetail) => void;
}

/** 攻击强化修正（技能传给共享攻击管线）。 */
export interface AttackMods {
  brave?: boolean; // 英勇打击：命中+2，伤害骰翻倍
  advantage?: boolean; // 精准瞄准：优势命中
  charged?: boolean; // 蓄力重击：必中，伤害骰 1d6→3d6
  /** AOE：固定 1d6、不加 STR 伤害调整（范围技能较轻）。 */
  aoe?: boolean;
  extraHitBonus?: number;
}
