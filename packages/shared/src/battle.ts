/**
 * 战斗引擎 —— 确定性纯函数。移植并修正自 legacy/client/battleground.cpp。
 *
 * 设计要点：
 * - 输入：双方精灵实例 + 随机种子。输出：逐回合事件流 + 最终结果。
 * - 不再忙等待轮询 clock()。原版用真实时钟 + interval 秒决定谁先打；
 *   这里离散化为"时间轴"：把每个攻击者的下一次攻击时间排进队列，反复取最早的那个。
 *   行为等价（攻速快的打得多），但 O(回合数)、可复现、不烧 CPU。
 * - 修掉的原版怪逻辑见下方 `// 修正:` 注释。
 *
 * 前端拿到事件流后只负责"回放成动画"，不重算任何数值。
 */
import { computeStats, speciesType, type PokemonType, type Stats } from './pokemon.js';
import { Rng } from './rng.js';

export interface Combatant {
  species: string;
  level: number;
}

export type Side = 'a' | 'b';

/** 战斗过程中的可变状态（不对外暴露，只在引擎内部用）。 */
interface FighterState {
  side: Side;
  species: string;
  type: PokemonType;
  level: number;
  stats: Stats;
  hp: number;
  /** 还剩几回合处于眩晕（被 agi 技能命中），>0 时跳过攻击。 */
  stunned: number;
  /** 还剩几回合附带真伤（str 技能 brave）。 */
  braveTurns: number;
  /** 还剩几回合减伤（def 技能 stone）。 */
  stoneTurns: number;
  /** 下一次攻击的时间戳（时间轴上的虚拟时间）。 */
  nextAt: number;
}

export type BattleEvent =
  | { t: 'start'; a: FighterPublic; b: FighterPublic }
  | { t: 'attack'; by: Side; skill: string | null; cry: string }
  | {
      t: 'damage';
      to: Side;
      amount: number;
      dodged: boolean;
      crit: boolean;
      hpLeft: number;
    }
  | { t: 'stunned'; who: Side } // 因被眩晕而本回合无法攻击
  | { t: 'heal'; who: Side; amount: number; hpLeft: number } // fat 生命汲取
  | { t: 'buff'; who: Side; kind: 'brave' | 'stone' } // 自身增益技能
  | { t: 'end'; winner: Side | null }; // null = 同归于尽

export interface FighterPublic {
  side: Side;
  species: string;
  type: PokemonType;
  level: number;
  fullHp: number;
}

export interface BattleResult {
  events: BattleEvent[];
  winner: Side | null;
}

const SKILL_CHANCE = 0.15; // 原版 rans>85 => 15%
const DODGE_CHANCE = 0.2; // 原版 dodge>80 => 20%
const CRIT_CHANCE = 0.1; // 原版 crush>90 => 10%
const SAFETY_TURN_CAP = 10000; // 防止万一不收敛的死循环

function mkFighter(side: Side, c: Combatant): FighterState {
  const stats = computeStats(c.species, c.level);
  return {
    side,
    species: c.species,
    type: speciesType(c.species),
    level: c.level,
    stats,
    hp: stats.fullHp,
    stunned: 0,
    braveTurns: 0,
    stoneTurns: 0,
    nextAt: stats.interval, // 第一次攻击在 interval 时刻
  };
}

function toPublic(f: FighterState): FighterPublic {
  return {
    side: f.side,
    species: f.species,
    type: f.type,
    level: f.level,
    fullHp: f.stats.fullHp,
  };
}

/**
 * 模拟一整场战斗，返回事件流。确定性：相同入参恒等输出。
 */
export function simulateBattle(a: Combatant, b: Combatant, seed: number): BattleResult {
  const rng = new Rng(seed);
  const fa = mkFighter('a', a);
  const fb = mkFighter('b', b);
  const events: BattleEvent[] = [{ t: 'start', a: toPublic(fa), b: toPublic(fb) }];

  let turns = 0;
  while (fa.hp > 0 && fb.hp > 0 && turns < SAFETY_TURN_CAP) {
    turns++;
    // 取时间轴上下一个该出手的人；并列时 a 先（与原版"先判 a 再判 b"一致）
    const attacker = fa.nextAt <= fb.nextAt ? fa : fb;
    const defender = attacker === fa ? fb : fa;
    attacker.nextAt += attacker.stats.interval;

    step(attacker, defender, rng, events);
    if (defender.hp <= 0) break;
  }

  const aAlive = fa.hp > 0;
  const bAlive = fb.hp > 0;
  const winner: Side | null = aAlive && !bAlive ? 'a' : bAlive && !aAlive ? 'b' : null;
  events.push({ t: 'end', winner });
  return { events, winner };
}

/** 单次出手：含眩晕检查、技能/普攻、伤害结算。 */
function step(att: FighterState, def: FighterState, rng: Rng, out: BattleEvent[]): void {
  // 计时器递减（眩晕 / 增益的回合数在每次本方出手时衰减）
  if (att.stunned > 0) {
    att.stunned--;
    out.push({ t: 'stunned', who: att.side });
    return;
  }
  if (att.braveTurns > 0) att.braveTurns--;
  if (att.stoneTurns > 0) att.stoneTurns--;

  const useSkill = rng.chance(SKILL_CHANCE);
  const skillName = useSkill ? skillLabel(att.type) : null;
  out.push({ t: 'attack', by: att.side, skill: skillName, cry: cryOf(att.species) });

  if (useSkill) {
    applySkill(att, def, rng, out);
    return;
  }

  dealDamage(att, def, rng, out, /*braveBonus*/ att.braveTurns > 0);
}

/** 技能效果。修正: 原版用临时改 state 标记表达，这里直接表达为干净的状态/伤害。 */
function applySkill(att: FighterState, def: FighterState, rng: Rng, out: BattleEvent[]): void {
  switch (att.type) {
    case 'str': {
      // 英勇打击：接下来 3 回合普攻附加真伤 lvl*3，且本次也立即打一发带真伤的攻击
      att.braveTurns = 3;
      out.push({ t: 'buff', who: att.side, kind: 'brave' });
      dealDamage(att, def, rng, out, /*braveBonus*/ true);
      return;
    }
    case 'def': {
      // 石化表皮：接下来 3 回合减伤 lvl*3（防御姿态，本回合不攻击）
      att.stoneTurns = 3;
      out.push({ t: 'buff', who: att.side, kind: 'stone' });
      return;
    }
    case 'fat': {
      // 生命汲取：回血 atk*2
      const heal = att.stats.atk * 2;
      const before = att.hp;
      att.hp = Math.min(att.stats.fullHp, att.hp + heal);
      out.push({ t: 'heal', who: att.side, amount: att.hp - before, hpLeft: att.hp });
      return;
    }
    case 'agi': {
      // 眩晕：使对方下两回合无法攻击
      def.stunned = 2;
      // 仍打出一次普通伤害（原版眩晕技能也会进入伤害结算）
      dealDamage(att, def, rng, out, false);
      return;
    }
  }
}

/**
 * 伤害结算。修正了原版两处怪逻辑：
 *  - 修正: 原版闪避规则是"伤害>90 时不能闪"（越疼越闪不掉，反直觉）。
 *          新版：agi 闪避率高、其他类型闪避率低，但都与伤害大小无关。
 *  - 修正: str 真伤(brave)用干净的加法表达，def 减伤(stone)同理。
 */
function dealDamage(
  att: FighterState,
  def: FighterState,
  rng: Rng,
  out: BattleEvent[],
  braveBonus: boolean,
): void {
  // 基础伤害 = 攻 - 防，下限 0
  let dmg = Math.max(0, att.stats.atk - def.stats.def);

  // str 真伤：无视防御直接加（brave 期间）
  if (braveBonus) dmg += att.level * 3;

  // def 减伤：石化期间额外抵挡
  if (def.stoneTurns > 0) dmg = Math.max(0, dmg - def.level * 3);

  // 闪避：agi 闪避率高，其他类型低；与伤害大小无关（修正原版）
  const dodgeChance = def.type === 'agi' ? 0.25 : 0.05;
  if (rng.chance(dodgeChance)) {
    out.push({ t: 'damage', to: def.side, amount: 0, dodged: true, crit: false, hpLeft: def.hp });
    return;
  }

  // 暴击：未闪避时触发，伤害翻倍
  const crit = rng.chance(CRIT_CHANCE);
  if (crit) dmg *= 2;

  def.hp = Math.max(0, def.hp - dmg);
  out.push({ t: 'damage', to: def.side, amount: dmg, dodged: false, crit, hpLeft: def.hp });
}

import { SPECIES, TYPE_SKILL } from './pokemon.js';
const cryOf = (species: string): string => SPECIES[species]?.cry ?? '';
const skillLabel = (type: PokemonType): string => TYPE_SKILL[type].name;
