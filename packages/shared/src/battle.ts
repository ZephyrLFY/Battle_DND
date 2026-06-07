/**
 * 回合制战斗引擎 —— v2 状态机。重写自 v1 的自动战斗。
 *
 * 形态：
 *   createBattle(a, b, seed)        → BattleState
 *   legalActions(state)             → Action[]    （当前该行动方可选的动作）
 *   applyAction(state, action)      → { state, events }
 *
 * 确定性：state 内含 RNG 游标，(state, action) 恒等映射到 (newState, events)。
 * 这套同时吃下单机 PvE（AI 选动作）、联机 PvP（服务端权威）、单测。
 *
 * 所有判定走 dice.ts，事件带骰子明细，前端渲染成跑团风日志。
 */
import { Rng } from './rng.js';
import { attackRoll, attackRollAdvantage, roll, doubleDice, type RollDetail } from './dice.js';
import { statsOf, type PokemonInstance, type DerivedStats } from './pokemon.js';
import { skillDef, type SkillId } from './skills.js';

export type Side = 'a' | 'b';
export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

/** 战斗中一方的可变状态。 */
export interface Fighter {
  side: Side;
  species: string;
  level: number;
  stats: DerivedStats;
  hp: number;
  /** 已学技能。 */
  skills: SkillId[];
  /** 每个技能的剩余冷却（回合）。 */
  cooldowns: Partial<Record<SkillId, number>>;
  /** 剩余昏迷回合（被眩晕命中）。>0 时该方本回合被跳过。 */
  stunned: number;
  /** 石化减伤：剩余回合数与每次减免量。 */
  stoneTurns: number;
  stoneAmount: number;
  /** 本回合 AC 临时加成（护盾格挡），行动后清零。 */
  acBonus: number;
  /** 护盾反弹：>0 时本方被攻击会反弹 acBonus 关联的伤害。 */
  thorns: number;
  /** 蓄力：下次攻击强化（charge_smash）。 */
  charged: boolean;
}

export type Action =
  | { kind: 'attack' }
  | { kind: 'skill'; skill: SkillId };

/** 战斗状态（可序列化）。 */
export interface BattleState {
  a: Fighter;
  b: Fighter;
  /** 当前该谁行动。 */
  turn: Side;
  /** RNG 游标，用于确定性恢复。 */
  rngCursor: number;
  round: number;
  /** 结束时的胜者；进行中为 undefined。 */
  winner?: Side | null;
}

export type BattleEvent =
  | { t: 'start'; first: Side; a: FighterPublic; b: FighterPublic; initiative: { a: RollDetail; b: RollDetail } }
  | { t: 'turn'; side: Side; round: number }
  | { t: 'stunned'; side: Side }
  | { t: 'action'; side: Side; action: Action; skillName?: string }
  | { t: 'hit'; by: Side; roll: HitRollInfo; hit: boolean; crit: boolean; vsAc: number }
  | { t: 'damage'; to: Side; roll: RollDetail; mitigated: number; dealt: number; hpLeft: number }
  | { t: 'heal'; side: Side; roll: RollDetail; amount: number; hpLeft: number }
  | { t: 'buff'; side: Side; skill: SkillId; note: string }
  | { t: 'thorns'; to: Side; roll: RollDetail; dealt: number; hpLeft: number }
  | { t: 'cooldown'; side: Side }
  | { t: 'end'; winner: Side | null };

export interface HitRollInfo {
  natural: number;
  bonus: number;
  total: number;
  nat20: boolean;
  nat1: boolean;
}

export interface FighterPublic {
  side: Side;
  species: string;
  level: number;
  maxHp: number;
  ac: number;
  skills: SkillId[];
}

// ─────────────────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────────────────

function mkFighter(side: Side, p: PokemonInstance): Fighter {
  const stats = statsOf(p);
  return {
    side,
    species: p.species,
    level: p.level,
    stats,
    hp: stats.maxHp,
    skills: [...p.skills],
    cooldowns: {},
    stunned: 0,
    stoneTurns: 0,
    stoneAmount: 0,
    acBonus: 0,
    thorns: 0,
    charged: false,
  };
}

function toPublic(f: Fighter): FighterPublic {
  return {
    side: f.side,
    species: f.species,
    level: f.level,
    maxHp: f.stats.maxHp,
    ac: f.stats.ac,
    skills: f.skills,
  };
}

/** 创建战斗：掷先攻定先手，返回初始 state + start 事件。 */
export function createBattle(
  aPoke: PokemonInstance,
  bPoke: PokemonInstance,
  seed: number,
): { state: BattleState; events: BattleEvent[] } {
  const rng = new Rng(seed);
  const a = mkFighter('a', aPoke);
  const b = mkFighter('b', bPoke);

  // 先攻：各掷 1d20 + DEX_mod，高者先；平手 a 先
  const initA = roll(rng, '1d20', a.stats.initiative);
  const initB = roll(rng, '1d20', b.stats.initiative);
  const first: Side = initB.total > initA.total ? 'b' : 'a';

  const state: BattleState = { a, b, turn: first, rngCursor: rng.cursor, round: 1 };
  const events: BattleEvent[] = [
    { t: 'start', first, a: toPublic(a), b: toPublic(b), initiative: { a: initA, b: initB } },
  ];
  return { state, events };
}

// ─────────────────────────────────────────────────────────────────────────
// 可选动作
// ─────────────────────────────────────────────────────────────────────────

/** 当前行动方可选的动作：普攻 + 所有未在 CD 的已学技能。 */
export function legalActions(state: BattleState): Action[] {
  if (state.winner !== undefined) return [];
  const f = state[state.turn];
  if (f.stunned > 0) return []; // 被眩晕，无可选动作（applyAction 仍可推进以消耗昏迷）
  const actions: Action[] = [{ kind: 'attack' }];
  for (const s of f.skills) {
    if ((f.cooldowns[s] ?? 0) <= 0) actions.push({ kind: 'skill', skill: s });
  }
  return actions;
}

export function isOver(state: BattleState): boolean {
  return state.winner !== undefined;
}

export function currentFighter(state: BattleState): Fighter {
  return state[state.turn];
}

// ─────────────────────────────────────────────────────────────────────────
// 推进一步
// ─────────────────────────────────────────────────────────────────────────

/**
 * 执行当前行动方的一个动作，返回新 state 与产生的事件。
 * 纯函数：不修改入参 state（内部深拷贝）。
 */
export function applyAction(
  state: BattleState,
  action: Action,
): { state: BattleState; events: BattleEvent[] } {
  if (state.winner !== undefined) return { state, events: [] };

  const next = cloneState(state);
  const rng = new Rng(0);
  rng.cursor = next.rngCursor;
  const events: BattleEvent[] = [];

  const actor = next[next.turn];
  const target = next[other(next.turn)];

  events.push({ t: 'turn', side: actor.side, round: next.round });

  // 昏迷：跳过本回合（无视传入 action）
  if (actor.stunned > 0) {
    actor.stunned--;
    events.push({ t: 'stunned', side: actor.side });
  } else {
    const act = validateAction(actor, action);
    performAction(actor, target, act, rng, events);
  }

  // 胜负检查
  if (target.hp <= 0 || actor.hp <= 0) {
    const aAlive = next.a.hp > 0;
    const bAlive = next.b.hp > 0;
    next.winner = aAlive && !bAlive ? 'a' : bAlive && !aAlive ? 'b' : null;
    events.push({ t: 'end', winner: next.winner });
    next.rngCursor = rng.cursor;
    return { state: next, events };
  }

  // 回合交接：清本回合临时态、递减对方 CD/持续效果由其在自己回合处理
  endTurnCleanup(actor);
  advanceTurn(next, events);
  next.rngCursor = rng.cursor;
  return { state: next, events };
}

/** 若动作非法（技能未学或在 CD），回退为普攻。 */
function validateAction(actor: Fighter, action: Action): Action {
  if (action.kind === 'attack') return action;
  const ok = actor.skills.includes(action.skill) && (actor.cooldowns[action.skill] ?? 0) <= 0;
  return ok ? action : { kind: 'attack' };
}

function performAction(
  actor: Fighter,
  target: Fighter,
  action: Action,
  rng: Rng,
  events: BattleEvent[],
): void {
  if (action.kind === 'attack') {
    events.push({ t: 'action', side: actor.side, action });
    doAttack(actor, target, rng, events, { brave: false, advantage: false, charged: actor.charged });
    actor.charged = false;
    return;
  }

  const def = skillDef(action.skill);
  events.push({ t: 'action', side: actor.side, action, skillName: def.name });
  actor.cooldowns[action.skill] = def.cooldown + 1; // +1 因本回合结束会统一递减
  resolveSkill(action.skill, actor, target, rng, events);
}

// ─────────────────────────────────────────────────────────────────────────
// 攻击 / 伤害管线
// ─────────────────────────────────────────────────────────────────────────

interface AttackMods {
  brave: boolean; // 英勇打击：命中+2，伤害骰翻倍
  advantage: boolean; // 精准瞄准：优势命中
  charged: boolean; // 蓄力重击：必中，伤害骰 1d6→3d6
  extraHitBonus?: number;
}

function doAttack(
  actor: Fighter,
  target: Fighter,
  rng: Rng,
  events: BattleEvent[],
  mods: AttackMods,
): void {
  const hitBonus = actor.stats.toHit + (mods.brave ? 2 : 0) + (mods.extraHitBonus ?? 0);
  const ar = mods.advantage
    ? attackRollAdvantage(rng, hitBonus, 'adv')
    : attackRoll(rng, hitBonus);

  const targetAc = target.stats.ac + target.acBonus;
  // 蓄力必中；自然1必失；自然20必中暴击；否则比 AC
  const autoHit = mods.charged || ar.nat20;
  const hit = !ar.nat1 && (autoHit || ar.total >= targetAc);
  const crit = ar.nat20;

  events.push({
    t: 'hit',
    by: actor.side,
    roll: { natural: ar.natural, bonus: ar.bonus, total: ar.total, nat20: ar.nat20, nat1: ar.nat1 },
    hit,
    crit,
    vsAc: targetAc,
  });

  if (!hit) {
    maybeThorns(actor, target, rng, events);
    return;
  }

  // 伤害骰：基础 1d6；蓄力→3d6；英勇→2d6；暴击使骰子数量翻倍
  let dmgSpec = mods.charged ? '3d6' : mods.brave ? '2d6' : '1d6';
  if (crit) dmgSpec = doubleDice(dmgSpec);
  const dmgRoll = roll(rng, dmgSpec, actor.stats.dmgBonus);

  let raw = Math.max(0, dmgRoll.total);
  // 石化减伤
  let mitigated = 0;
  if (target.stoneTurns > 0) {
    mitigated = target.stoneAmount;
    raw = Math.max(0, raw - mitigated);
  }
  target.hp = Math.max(0, target.hp - raw);
  events.push({
    t: 'damage',
    to: target.side,
    roll: dmgRoll,
    mitigated,
    dealt: raw,
    hpLeft: target.hp,
  });

  maybeThorns(actor, target, rng, events);
}

/** 护盾格挡的荆棘反伤：攻击者攻击带 thorns 的目标时受到反弹。 */
function maybeThorns(actor: Fighter, target: Fighter, rng: Rng, events: BattleEvent[]): void {
  if (target.thorns > 0 && actor.hp > 0) {
    const r = roll(rng, '1d4');
    actor.hp = Math.max(0, actor.hp - r.total);
    events.push({ t: 'thorns', to: actor.side, roll: r, dealt: r.total, hpLeft: actor.hp });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 技能效果（按 id 分派）
// ─────────────────────────────────────────────────────────────────────────

function resolveSkill(
  id: SkillId,
  actor: Fighter,
  target: Fighter,
  rng: Rng,
  events: BattleEvent[],
): void {
  switch (id) {
    case 'brave_strike':
      doAttack(actor, target, rng, events, { brave: true, advantage: false, charged: false });
      return;

    case 'precise_aim':
      doAttack(actor, target, rng, events, { brave: false, advantage: true, charged: false });
      return;

    case 'stun_strike': {
      doAttack(actor, target, rng, events, { brave: false, advantage: false, charged: false });
      if (target.hp > 0) {
        // 体质豁免：对方 1d20+CON_mod ≥ 13 抵抗
        const save = roll(rng, '1d20', target.stats.conMod);
        if (save.total < 13) {
          target.stunned = 1;
          events.push({ t: 'buff', side: actor.side, skill: id, note: `${target.side} 被眩晕（豁免 ${save.total}<13）` });
        } else {
          events.push({ t: 'buff', side: actor.side, skill: id, note: `对方抵抗了眩晕（豁免 ${save.total}≥13）` });
        }
      }
      return;
    }

    case 'flurry': {
      doAttack(actor, target, rng, events, { brave: false, advantage: false, charged: false });
      if (target.hp > 0) {
        doAttack(actor, target, rng, events, { brave: false, advantage: false, charged: false });
      }
      return;
    }

    case 'charge_smash':
      actor.charged = true;
      events.push({ t: 'buff', side: actor.side, skill: id, note: '蓄力中，下回合必中重击' });
      return;

    case 'life_drain': {
      const r = roll(rng, '1d8', actor.stats.conMod);
      const before = actor.hp;
      actor.hp = Math.min(actor.stats.maxHp, actor.hp + Math.max(0, r.total));
      events.push({ t: 'heal', side: actor.side, roll: r, amount: actor.hp - before, hpLeft: actor.hp });
      return;
    }

    case 'stone_skin': {
      const r = roll(rng, '1d6');
      actor.stoneTurns = 2;
      actor.stoneAmount = r.total;
      events.push({ t: 'buff', side: actor.side, skill: id, note: `石化：2 回合内减伤 ${r.total}` });
      return;
    }

    case 'shield_block':
      actor.acBonus += 5;
      actor.thorns = 1;
      events.push({ t: 'buff', side: actor.side, skill: id, note: '本回合 AC+5 并反弹伤害' });
      return;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 回合管理
// ─────────────────────────────────────────────────────────────────────────

/** 行动方回合结束：清掉只在"自己这回合"生效的临时态。 */
function endTurnCleanup(actor: Fighter): void {
  // 石化在"本方回合开始递减"会更直观，但这里持续效果按"本方回合数"计；
  // shield_block 的 AC+5/thorns 只覆盖到自己下次被攻击前——保留到下个本方回合开始清。
  // 这里不清 acBonus/thorns，留到 advanceTurn 给下一个行动者做"自己回合开始"的清理。
}

/** 切换到下一个行动方，并对其做"回合开始"的持续效果递减与清理。 */
function advanceTurn(state: BattleState, _events: BattleEvent[]): void {
  const nextSide = other(state.turn);
  if (nextSide === 'a' && state.turn === 'b') state.round++;
  state.turn = nextSide;

  const f = state[nextSide];
  // 递减该方所有技能 CD
  for (const k of Object.keys(f.cooldowns) as SkillId[]) {
    if ((f.cooldowns[k] ?? 0) > 0) f.cooldowns[k] = (f.cooldowns[k] ?? 0) - 1;
  }
  // 递减石化持续
  if (f.stoneTurns > 0) f.stoneTurns--;
  // 防御姿态只覆盖一个回合循环：到自己下个回合开始时清掉
  f.acBonus = 0;
  f.thorns = 0;
}

// ─────────────────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────────────────

function cloneState(s: BattleState): BattleState {
  return {
    a: cloneFighter(s.a),
    b: cloneFighter(s.b),
    turn: s.turn,
    rngCursor: s.rngCursor,
    round: s.round,
    winner: s.winner,
  };
}

function cloneFighter(f: Fighter): Fighter {
  return { ...f, skills: [...f.skills], cooldowns: { ...f.cooldowns } };
}
