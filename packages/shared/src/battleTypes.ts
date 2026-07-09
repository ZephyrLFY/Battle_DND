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
  /** 当前能量（从 0 起，普攻命中 +1，放技能消耗；无硬上限，可以囤过 stats.maxEnergy 基准线）。 */
  energy: number;

  // —— 状态 ——
  /** 倒地：HP≤0 但未彻底死亡，不能行动、不可被补刀，可被复活术救回。 */
  downed: boolean;
  /** 倒地已持续几个"本方回合"。达阈值仍未被救 → 转彻底死亡。复活时重置 0。 */
  downedTurns: number;
  /** 彻底死亡：移出战斗与先攻序列，不可再救。 */
  dead: boolean;
  /** 剩余昏迷回合（被眩晕）。>0 时本方回合被跳过。 */
  stunned: number;
  /** 石化减伤：剩余回合数 + 每次减免量。 */
  stoneTurns: number;
  stoneAmount: number;
  /** 本回合 AC 临时加成（护盾格挡），自己下个回合开始清零。 */
  acBonus: number;
  /** acBonus 剩余回合数：>0 时 acBonus 生效，归零时 acBonus 清零（与 acDebuff 同节奏）。 */
  acBonusTurns: number;
  /** 护盾反弹层数（被攻击反弹 1d4）。 */
  thorns: number;
  /** 蓄力：下次攻击强化（charge_smash）。 */
  charged: boolean;
  /** 战吼增益：剩余回合内攻击命中 +2 且伤害 +2。 */
  rallyTurns: number;
  /** 通用伤害增益（华尔兹等）：剩余回合内攻击伤害 +dmgBuffAmt。 */
  dmgBuffTurns: number;
  dmgBuffAmt: number;
  /** 命中惩罚（哈气等 debuff）：剩余回合内自身攻击命中 −hitPenaltyAmt。 */
  hitPenaltyTurns: number;
  hitPenaltyAmt: number;
  /** 受击 AC 减益（佯攻破甲）：剩余回合内自身 AC −acDebuffAmt。 */
  acDebuffTurns: number;
  acDebuffAmt: number;
  /** 控制免疫剩余回合（冰封护盾）：>0 时免疫眩晕/定身/哈气等控制。 */
  controlImmuneTurns: number;
  /** 灼烧剩余回合（烈焰风暴）：>0 时自己回合开始掉 1d3，每回合 −1。 */
  burnTurns: number;
  /** 额外回合：>0 时本角色行动后不前进先攻指针、再行动一次（Lirilì 时间静止）。 */
  extraTurns: number;
  /**
   * 被动私有状态袋：各角色被动自己的计数/标志，按 archetype 命名空间存键
   * （如 'tung.hits' / 'bombombini.gunpowder' / 'trippi.ninthUsed'，bool 存 0/1）。
   * 用通用袋而非命名字段：被动私有、只被自己读，避免核心类型随内容膨胀。
   */
  passiveState: Record<string, number>;
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
  | { t: 'buff'; who: FighterRef; note: string; noteEn?: string }
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
  /** 共享攻击管线：actor 攻击 target，可带强化修正。返回是否命中。 */
  attack: (target: FighterRT, mods?: AttackMods) => boolean;
  /** 直接造成/回复，不走命中判定（治疗、AOE 固伤等用）。 */
  heal: (who: FighterRT, amount: number, roll: RollDetail) => void;
}

/** 攻击强化修正（技能传给共享攻击管线）。 */
export interface AttackMods {
  brave?: boolean; // 英勇打击：命中+2，伤害骰 2d6
  advantage?: boolean; // 精准瞄准：优势命中
  charged?: boolean; // 重击档：伤害骰 1d6→4d6（蓄力重击/部分签名复用；是否必中由 autoHit 单独控制）
  /** 必中（自然 1 仍失手）。签名"必中"技能用；蓄力重击已不再必中。 */
  autoHit?: boolean;
  /** AOE：固定 1d6、不加 STR 伤害调整（范围技能较轻）。 */
  aoe?: boolean;
  extraHitBonus?: number;
  /** 本次攻击来自一个耗能技能（cost>0），供被动区分普攻 vs 法术（如 Bombombini 引信）。 */
  fromSpell?: boolean;
  /** 固定伤害骰（佯攻 1d4 等小招）：覆盖默认 1d6，且不加 STR 伤害调整。 */
  fixedDamage?: string;
  /**
   * 自定义伤害骰（**保留** STR 伤害调整）：技能自带独立伤害档时用，
   * 避免复用 brave/charged 档造成隐性耦合（教训：brave 3d6→2d6 连带削了斩首）。
   */
  dice?: string;
}

/**
 * 被动 handler 的执行上下文。
 * 比 EffectCtx 多给整局 state（团队构成可见），但不给 attack/heal 门面：
 * 被动造成的额外伤害走扁平助手、绝不回调攻击管线（避免递归 / 重复抽 RNG）。
 */
export interface PassiveCtx {
  self: FighterRT;
  state: BattleState;
  rng: import('./rng.js').Rng;
  emit: (e: BattleEvent) => void;
}

/**
 * 角色被动 —— 仿 effects.ts 插件模式，每个 archetype 一个，只实现需要的钩子。
 * 事件钩子可变 + emit；三个 modify* 是读时纯函数（无副作用、不存储），
 * 保证随团队构成变化即时生效（如 CA 随 BC 存活/死亡乘区翻转）。
 */
export interface Passive {
  /** 本角色回合开始（已过临时态衰减、未行动前；倒地/昏迷时不触发）。 */
  onTurnStart?(ctx: PassiveCtx): void;
  /** 本角色单体命中造成伤害后（raw=实际扣血，AOE 不触发；fromSpell=本次来自耗能技能）。 */
  onDealDamage?(ctx: PassiveCtx, target: FighterRT, raw: number, crit: boolean, fromSpell: boolean): void;
  /** 本角色被命中后。 */
  onTakeHit?(ctx: PassiveCtx, attacker: FighterRT, raw: number, crit: boolean): void;
  /** 本角色被攻击但 miss（预留）。 */
  onMissed?(ctx: PassiveCtx, attacker: FighterRT): void;
  /** veto：HP≤0 即将倒地。返回 true 表示已自行把 hp 拉到 ≥1，阻止倒地（一次性须自守标志）。 */
  onWouldGoDown?(ctx: PassiveCtx): boolean;
  /** 某友方（非自己）刚结算了一个 support 技能。 */
  onAllySupport?(ctx: PassiveCtx, ally: FighterRT, skill: SkillId): void;
  /** 本角色释放了一个耗能技能（cost>0）后（Bombombini 引爆火药、释放后清层）。 */
  onCastSpell?(ctx: PassiveCtx, skill: SkillId): void;
  /** 读时纯函数：派生属性乘区（toHit/dmgBonus/ac），不作用于先攻。 */
  modifyStats?(base: DerivedStats, ctx: PassiveCtx): DerivedStats;
  /** 读时纯函数：出伤乘区（石化减伤前应用）。 */
  modifyOutgoingDamage?(ctx: PassiveCtx, target: FighterRT, raw: number): number;
  /** 读时纯函数：受伤减免（常驻护甲，如 Bombardiro 装甲蒙皮；石化减伤之外再减）。 */
  modifyIncomingDamage?(ctx: PassiveCtx, attacker: FighterRT, raw: number): number;
  /** 读时纯函数：受到的治疗/增益增幅（source=施加者，可空）。 */
  modifyIncomingHeal?(ctx: PassiveCtx, source: FighterRT | undefined, amount: number): number;
  /** 开局先攻加值（Tralalero 三足疾行：抢先手）。仅在 createBattle 掷先攻时叠加。 */
  initiativeBonus?: number;
  /** 标志：每回合首次普攻以优势掷命中（Tralalero 三足疾行）。引擎用 passiveState 跟踪本回合是否已普攻。 */
  firstBasicAdvantage?: boolean;
}
