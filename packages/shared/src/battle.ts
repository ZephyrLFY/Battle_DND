/**
 * 回合制战斗引擎 —— NvN 状态机。1v1 是 N=1 的特例。
 *
 * 形态：
 *   createBattle(teamA, teamB, seed) → { state, events }
 *   legalActions(state)              → Action[]        当前行动者可执行的动作
 *   allActions(state, ref?)          → ActionOption[]  含不可用的（UI 灰显）
 *   applyAction(state, action)       → { state, events }
 *
 * 确定性：state 内含 RNG 游标，(state, action) 恒等映射 (newState, events)。
 * 同时吃下单机 PvE（AI 选动作+目标）、联机 PvP（服务端权威）、单测。
 *
 * 技能效果在 effects.ts 注册，引擎只解析目标 + 调 handler；
 * 共享攻击/伤害管线在本文件，通过 EffectCtx.attack 提供给技能。
 */
import { Rng } from './rng.js';
import { attackRoll, attackRollAdvantage, roll, doubleDice, type RollDetail } from './dice.js';
import { statsOf, type Combatant } from './combatant.js';
import { archetypeName } from './roster.js';
import { skillDef, type SkillId, type TargetType } from './skills.js';
import { skillEffect } from './effects.js';
import { passiveOf, getStack, setStack, ACTED_KEY, BASIC_DONE_KEY } from './passives.js';
import type { DerivedStats } from './combatant.js';
import {
  otherSide,
  refEq,
  type Side,
  type FighterRef,
  type FighterRT,
  type Action,
  type BattleState,
  type BattleEvent,
  type FighterPublic,
  type AttackMods,
  type EffectCtx,
  type PassiveCtx,
} from './battleTypes.js';

export * from './battleTypes.js';

// ─────────────────────────────────────────────────────────────────────────
// 构造
// ─────────────────────────────────────────────────────────────────────────

function mkFighter(team: Side, c: Combatant): FighterRT {
  const stats = statsOf(c);
  return {
    id: c.archetypeId, // 队内不重复 → archetypeId 可直接当队内 id
    team,
    archetypeId: c.archetypeId,
    name: archetypeName(c.archetypeId),
    level: c.level,
    stats,
    hp: stats.maxHp,
    skills: [...c.skills],
    energy: 0, // 从 0 起，普攻命中攒能量
    downed: false,
    downedTurns: 0,
    dead: false,
    stunned: 0,
    stoneTurns: 0,
    stoneAmount: 0,
    acBonus: 0,
    acBonusTurns: 0,
    thorns: 0,
    charged: false,
    rallyTurns: 0,
    dmgBuffTurns: 0,
    dmgBuffAmt: 0,
    hitPenaltyTurns: 0,
    hitPenaltyAmt: 0,
    acDebuffTurns: 0,
    acDebuffAmt: 0,
    controlImmuneTurns: 0,
    burnTurns: 0,
    extraTurns: 0,
    passiveState: {},
  };
}

function toPublic(f: FighterRT): FighterPublic {
  return {
    ref: refOf(f),
    archetypeId: f.archetypeId,
    name: f.name,
    level: f.level,
    maxHp: f.stats.maxHp,
    ac: f.stats.ac,
    skills: f.skills,
    maxEnergy: f.stats.maxEnergy,
  };
}

const refOf = (f: FighterRT): FighterRef => ({ team: f.team, id: f.id });

/**
 * 创建战斗：双方各 1~N 个角色，全员掷先攻排成 order，返回初始 state + start 事件。
 */
export function createBattle(
  teamA: Combatant[],
  teamB: Combatant[],
  seed: number,
): { state: BattleState; events: BattleEvent[] } {
  if (teamA.length === 0 || teamB.length === 0) throw new Error('每方至少 1 个角色');
  const rng = new Rng(seed);
  const a = teamA.map((c) => mkFighter('a', c));
  const b = teamB.map((c) => mkFighter('b', c));
  const all = [...a, ...b];

  // 先攻：每人掷 1d20 + DEX_mod (+ 被动先攻加值)，降序；平手按 a 队优先、再按入场序（稳定）
  const initiative: Record<string, RollDetail> = {};
  const scored = all.map((f, idx) => {
    const bonus = passiveOf(f.archetypeId)?.initiativeBonus ?? 0;
    const r = roll(rng, '1d20', f.stats.initiative + bonus);
    initiative[key(refOf(f))] = r;
    return { f, total: r.total, idx };
  });
  scored.sort((x, y) => y.total - x.total || x.idx - y.idx);
  const order = scored.map((s) => refOf(s.f));

  const state: BattleState = {
    teams: { a, b },
    order,
    turnIndex: 0,
    round: 1,
    rngCursor: rng.cursor,
  };
  const events: BattleEvent[] = [
    { t: 'start', order, fighters: all.map(toPublic), initiative },
  ];
  return { state, events };
}

// ─────────────────────────────────────────────────────────────────────────
// 查询
// ─────────────────────────────────────────────────────────────────────────

export function isOver(state: BattleState): boolean {
  return state.winner !== undefined;
}

/** 当前该行动的角色（order[turnIndex] 指向的）。战斗结束或无人可动时返回 undefined。 */
export function currentFighter(state: BattleState): FighterRT | undefined {
  const r = state.order[state.turnIndex];
  return r ? find(state, r) : undefined;
}

export function find(state: BattleState, ref: FighterRef): FighterRT | undefined {
  return state.teams[ref.team].find((f) => f.id === ref.id);
}

/** 一方存活（未彻底死亡）的角色。 */
export function aliveOf(state: BattleState, team: Side): FighterRT[] {
  return state.teams[team].filter((f) => !f.dead);
}

// ─── 动作可用性 ───

export interface ActionOption {
  action: Action;
  usable: boolean;
  reason?: string;
}

/** 当前行动者可合法执行的动作（已自动填好默认目标）。 */
export function legalActions(state: BattleState): Action[] {
  return allActions(state)
    .filter((o) => o.usable)
    .map((o) => o.action);
}

/**
 * 某角色的全部动作选项（含不可用的，供 UI 灰显）。
 * 默认当前行动者；传 ref 可固定看某角色（如战斗面板固定显示玩家，避免 UI 横跳）。
 * 目标用"默认目标"自动填充（UI 可让玩家改）。
 */
export function allActions(state: BattleState, ref?: FighterRef): ActionOption[] {
  if (state.winner !== undefined) return [];
  const f = ref ? find(state, ref) : currentFighter(state);
  if (!f) return [];
  const isTurn = !ref || (currentFighter(state)?.id === f.id && currentFighter(state)?.team === f.team);
  const blocked = !isTurn || f.downed || f.stunned > 0;
  const blockReason = !isTurn ? '等待回合' : f.downed ? '倒地' : f.stunned > 0 ? '昏迷中' : undefined;

  const enemies = aliveOf(state, otherSide(f.team)).filter((e) => !e.downed); // 倒地不可补刀
  const defaultEnemy = enemies[0];

  const opts: ActionOption[] = [];
  // 普攻：固定单敌
  opts.push({
    action: { kind: 'attack', target: defaultEnemy ? refOf(defaultEnemy) : { team: otherSide(f.team), id: '' } },
    usable: !blocked && !!defaultEnemy,
    reason: blockReason ?? (!defaultEnemy ? '无可攻击目标' : undefined),
  });

  for (const s of f.skills) {
    const def = skillDef(s);
    const enough = f.energy >= def.cost;
    const targets = defaultTargets(state, f, def.targetType);
    const hasTarget = targets.length > 0 || def.targetType === 'self';
    const usable = !blocked && enough && hasTarget;
    const reason = blockReason ?? (!enough ? '能量不足' : !hasTarget ? '无目标' : undefined);
    opts.push({ action: { kind: 'skill', skill: s, targets }, usable, reason });
  }
  return opts;
}

/** 按目标类型收集"默认目标"（self/全体类自动；单体类取第一个合法）。 */
export function defaultTargets(
  state: BattleState,
  actor: FighterRT,
  tt: TargetType,
): FighterRef[] {
  // 敌方目标排除倒地者（倒地不可补刀，只能靠复活术救回或全倒判负）。
  const enemies = aliveOf(state, otherSide(actor.team)).filter((e) => !e.downed);
  const allies = aliveOf(state, actor.team);
  const downedAllies = allies.filter((a) => a.downed);
  switch (tt) {
    case 'self':
      return [refOf(actor)];
    case 'one_enemy':
      return enemies[0] ? [refOf(enemies[0])] : [];
    case 'all_enemies':
      return enemies.map(refOf);
    case 'one_ally':
      // 治疗/复活：优先倒地友方，否则受伤友方，否则自己
      return [refOf(downedAllies[0] ?? allies.find((a) => a.hp < a.stats.maxHp) ?? actor)];
    case 'all_allies':
      return allies.filter((a) => !a.downed).map(refOf);
    case 'everyone':
      return [...enemies, ...allies].map(refOf);
  }
}

/** 合法目标集合（UI 选目标时高亮用）。 */
export function legalTargets(state: BattleState, actor: FighterRT, tt: TargetType): FighterRef[] {
  const enemies = aliveOf(state, otherSide(actor.team)).filter((e) => !e.downed); // 倒地不可补刀
  const allies = aliveOf(state, actor.team);
  switch (tt) {
    case 'self':
      return [refOf(actor)];
    case 'one_enemy':
    case 'all_enemies':
      return enemies.map(refOf);
    case 'one_ally': // 含倒地（复活/治疗）
      return allies.map(refOf);
    case 'all_allies':
      return allies.filter((a) => !a.downed).map(refOf);
    case 'everyone':
      return [...enemies, ...allies].map(refOf);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 推进一步
// ─────────────────────────────────────────────────────────────────────────

/** 纯函数：执行当前行动者的一个动作，返回新 state + 事件。不修改入参。 */
export function applyAction(
  state: BattleState,
  action: Action,
): { state: BattleState; events: BattleEvent[] } {
  if (state.winner !== undefined) return { state, events: [] };
  const next = cloneState(state);
  const rng = new Rng(0);
  rng.cursor = next.rngCursor;
  const events: BattleEvent[] = [];
  const emit = (e: BattleEvent) => events.push(e);

  const actor = currentFighter(next);
  if (!actor) {
    next.rngCursor = rng.cursor;
    return { state: next, events };
  }

  emit({ t: 'turn', who: refOf(actor), round: next.round });

  // 衰减"回合开始"生效的临时态
  if (actor.stoneTurns > 0) actor.stoneTurns--;
  if (actor.rallyTurns > 0) actor.rallyTurns--;
  if (actor.dmgBuffTurns > 0) {
    actor.dmgBuffTurns--;
    if (actor.dmgBuffTurns === 0) actor.dmgBuffAmt = 0;
  }
  if (actor.hitPenaltyTurns > 0) {
    actor.hitPenaltyTurns--;
    if (actor.hitPenaltyTurns === 0) actor.hitPenaltyAmt = 0;
  }
  if (actor.acDebuffTurns > 0) {
    actor.acDebuffTurns--;
    if (actor.acDebuffTurns === 0) actor.acDebuffAmt = 0;
  }
  // acBonus 衰减（修复：原实现只加不减，"本回合 AC+3"会永久叠加）
  if (actor.acBonusTurns > 0) {
    actor.acBonusTurns--;
    if (actor.acBonusTurns === 0) actor.acBonus = 0;
  }
  if (actor.controlImmuneTurns > 0) actor.controlImmuneTurns--;

  // 灼烧 DoT：自己回合开始掉 1d3（倒地者不烧——已经倒了）
  if (!actor.downed && !actor.dead && actor.burnTurns > 0) {
    actor.burnTurns--;
    const r = roll(rng, '1d3');
    actor.hp = Math.max(0, actor.hp - r.total);
    emit({
      t: 'damage',
      to: refOf(actor),
      roll: { spec: '灼烧', rolls: r.rolls, bonus: 0, total: r.total },
      mitigated: 0,
      dealt: r.total,
      hpLeft: actor.hp,
    });
  }

  // 被动 onTurnStart（倒地/昏迷者不触发）。先让被动读上一回合的 __acted，再清零本回合。
  if (!actor.downed && actor.stunned <= 0) {
    passiveOf(actor.archetypeId)?.onTurnStart?.(passiveCtx(next, actor, rng, emit));
    setStack(actor, ACTED_KEY, 0);
    setStack(actor, BASIC_DONE_KEY, 0); // 重置「本回合是否已普攻」（Tralalero 首击必中）
  }

  if (actor.downed) {
    // 倒地者轮到回合：累计倒地回合，超过阈值仍未被救 → 彻底死亡（移出序列）
    actor.downedTurns++;
    if (actor.downedTurns >= DOWNED_TO_DEAD_TURNS) {
      actor.dead = true;
      emit({ t: 'dead', who: refOf(actor) });
    } else {
      emit({ t: 'skip', who: refOf(actor), why: 'downed' });
    }
  } else if (actor.stunned > 0) {
    actor.stunned--;
    emit({ t: 'skip', who: refOf(actor), why: 'stunned' });
  } else if (actor.hp <= 0) {
    // 灼烧在回合开始把自己烧倒：本回合不行动，倒地由下方 settleCasualties 统一结算
  } else {
    perform(next, actor, validate(next, actor, action), rng, emit);
  }

  // 结算倒地/死亡
  settleCasualties(next, emit, rng);

  // 胜负检查：一方全员倒地（或彻底死亡）→ 立即判负（不等复活）。
  const out = (f: { downed: boolean; dead: boolean }) => f.downed || f.dead;
  const aOut = next.teams.a.every(out);
  const bOut = next.teams.b.every(out);
  if (aOut || bOut) {
    next.winner = aOut && bOut ? null : aOut ? 'b' : 'a';
    emit({ t: 'end', winner: next.winner });
    next.rngCursor = rng.cursor;
    return { state: next, events };
  }

  advanceTurn(next);
  next.rngCursor = rng.cursor;
  return { state: next, events };
}

/** 校验动作合法，非法则回退为"普攻第一个敌人"。 */
function validate(state: BattleState, actor: FighterRT, action: Action): Action {
  if (action.kind === 'attack') {
    const t = find(state, action.target);
    if (t && !t.dead && !t.downed && t.team !== actor.team) return action; // 倒地不可补刀
    const e = aliveOf(state, otherSide(actor.team)).find((x) => !x.downed);
    return e ? { kind: 'attack', target: refOf(e) } : action;
  }
  // skill
  const learned = actor.skills.includes(action.skill);
  const enough = actor.energy >= skillDef(action.skill).cost;
  if (learned && enough) return action;
  // 回退普攻
  const e = aliveOf(state, otherSide(actor.team)).find((x) => !x.downed);
  return e ? { kind: 'attack', target: refOf(e) } : action;
}

function perform(
  state: BattleState,
  actor: FighterRT,
  action: Action,
  rng: Rng,
  emit: (e: BattleEvent) => void,
): void {
  // 标记本回合已行动（供「上回合是否行动」类被动用，如 Tung 的敲击清空判定）。
  setStack(actor, ACTED_KEY, 1);

  if (action.kind === 'attack') {
    emit({ t: 'action', who: refOf(actor), action });
    const target = find(state, action.target);
    const hit = target ? doAttack(state, actor, target, rng, emit, { charged: actor.charged }) : false;
    actor.charged = false;
    // 普攻攒能量：命中才 +1（无上限，可以囤）。miss 不回，攒能量有风险。
    if (hit) {
      actor.energy += 1;
      emit({ t: 'energy', who: refOf(actor), delta: 1, now: actor.energy });
    }
    return;
  }

  // skill
  const def = skillDef(action.skill);
  emit({ t: 'action', who: refOf(actor), action, skillName: def.name });
  if (def.cost > 0) {
    actor.energy = Math.max(0, actor.energy - def.cost);
    emit({ t: 'energy', who: refOf(actor), delta: -def.cost, now: actor.energy, spent: action.skill });
  }
  const targets = action.targets
    .map((r) => find(state, r))
    .filter((f): f is FighterRT => !!f);
  // 耗能技能（cost>0）打出的攻击标记 fromSpell：供被动区分法术 vs 普攻（Bombombini 引信）。
  const fromSpell = def.cost > 0;
  const ctx: EffectCtx = {
    actor,
    targets,
    rng,
    emit,
    attack: (target, mods) => doAttack(state, actor, target, rng, emit, { ...(mods ?? {}), fromSpell }),
    heal: (who, amount, r) => applyHeal(state, who, amount, r, emit, rng, actor),
  };
  skillEffect(action.skill)(ctx);

  // 耗能技能释放后：触发本角色被动的「施法后」清理（Bombombini 引爆火药）。
  if (fromSpell) {
    passiveOf(actor.archetypeId)?.onCastSpell?.(passiveCtx(state, actor, rng, emit), action.skill);
  }

  // 友方被动 onAllySupport：施法者放了 support 技能后，其每个存活友方（非自己）触发。
  if (def.category === 'support') {
    for (const ally of aliveOf(state, actor.team)) {
      if (ally.id === actor.id) continue;
      passiveOf(ally.archetypeId)?.onAllySupport?.(passiveCtx(state, ally, rng, emit), actor, action.skill);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 被动分发
// ─────────────────────────────────────────────────────────────────────────

/** 构造一个被动上下文。 */
function passiveCtx(
  state: BattleState,
  self: FighterRT,
  rng: Rng,
  emit: (e: BattleEvent) => void,
): PassiveCtx {
  return { self, state, rng, emit };
}

/** 取 fighter 经被动 modifyStats 调整后的有效属性（读时纯函数，不存储）。 */
function effStats(state: BattleState, f: FighterRT, rng: Rng, emit: (e: BattleEvent) => void): DerivedStats {
  const p = passiveOf(f.archetypeId);
  return p?.modifyStats ? p.modifyStats(f.stats, passiveCtx(state, f, rng, emit)) : f.stats;
}

// ─────────────────────────────────────────────────────────────────────────
// 共享攻击 / 伤害 / 回复管线
// ─────────────────────────────────────────────────────────────────────────

/** 返回是否命中（用于"普攻命中才回能量"）。 */
function doAttack(
  state: BattleState,
  actor: FighterRT,
  target: FighterRT,
  rng: Rng,
  emit: (e: BattleEvent) => void,
  mods: AttackMods,
): boolean {
  if (target.dead) return false;
  // 被动 modifyStats：攻方 toHit/dmgBonus、守方 ac 均走有效属性（读时纯函数）。
  const actorStats = effStats(state, actor, rng, emit);
  const targetStats = effStats(state, target, rng, emit);
  const rallyBonus = actor.rallyTurns > 0 ? 2 : 0;
  const penalty = actor.hitPenaltyTurns > 0 ? actor.hitPenaltyAmt : 0;
  const hitBonus = actorStats.toHit + (mods.brave ? 2 : 0) + (mods.extraHitBonus ?? 0) + rallyBonus - penalty;
  // 首击优势（Tralalero 三足疾行）：每回合首次攻击（非法术、非 AOE）以优势掷命中（普攻/多段技能第一下）。
  let firstAdv = false;
  if (!mods.fromSpell && !mods.aoe && passiveOf(actor.archetypeId)?.firstBasicAdvantage) {
    if (getStack(actor, BASIC_DONE_KEY) === 0) {
      firstAdv = true;
      setStack(actor, BASIC_DONE_KEY, 1);
    }
  }

  const ar = mods.advantage || firstAdv ? attackRollAdvantage(rng, hitBonus, 'adv') : attackRoll(rng, hitBonus);

  // 目标 AC = 有效 AC + 自身护盾加成 − 破甲减益（佯攻），下限 1。
  const acDebuff = target.acDebuffTurns > 0 ? target.acDebuffAmt : 0;
  const targetAc = Math.max(1, targetStats.ac + target.acBonus - acDebuff);
  // 必中改由 mods.autoHit 单独控制（蓄力重击不再必中；签名必中技自带 autoHit）
  const autoHit = mods.autoHit || ar.nat20;
  const hit = !ar.nat1 && (autoHit || ar.total >= targetAc);
  const crit = ar.nat20;

  emit({
    t: 'hit',
    by: refOf(actor),
    to: refOf(target),
    roll: { natural: ar.natural, bonus: ar.bonus, total: ar.total, nat20: ar.nat20, nat1: ar.nat1 },
    hit,
    crit,
    vsAc: targetAc,
  });

  if (!hit) {
    // 闪避回能：攻击落空时，受击方 +1 能量（高 AC/敏捷向的"防御转资源"，与普攻命中回能对偶）。
    if (!target.downed && !target.dead) {
      target.energy += 1;
      emit({ t: 'energy', who: refOf(target), delta: 1, now: target.energy });
    }
    passiveOf(target.archetypeId)?.onMissed?.(passiveCtx(state, target, rng, emit), actor);
    maybeThorns(actor, target, rng, emit);
    return false;
  }

  // 伤害骰：固定小招(佯攻 1d4，无 STR) > 自定义档(dice，含 STR) > 重击档 4d6 > 英勇 2d6 > AOE 2d6 > 普攻 1d6
  let dmgSpec = mods.fixedDamage ?? mods.dice ?? (mods.charged ? '4d6' : mods.brave ? '2d6' : mods.aoe ? '2d6' : '1d6');
  if (crit) dmgSpec = doubleDice(dmgSpec);
  // 固定小招/AOE 不加 STR 伤害调整；战吼额外 +2 伤害。
  const rallyDmg = actor.rallyTurns > 0 ? 2 : 0;
  const buffDmg = actor.dmgBuffTurns > 0 ? actor.dmgBuffAmt : 0;
  const noStrBonus = mods.aoe || !!mods.fixedDamage;
  const dmgBonus = (noStrBonus ? 0 : actorStats.dmgBonus) + rallyDmg + buffDmg;
  const dmgRoll = roll(rng, dmgSpec, dmgBonus);

  let raw = Math.max(0, dmgRoll.total);
  // 被动 modifyOutgoingDamage（出伤乘区，石化减伤前应用，如 CA ×0.9）。
  const actorPassive = passiveOf(actor.archetypeId);
  if (actorPassive?.modifyOutgoingDamage) {
    raw = Math.max(0, Math.floor(actorPassive.modifyOutgoingDamage(passiveCtx(state, actor, rng, emit), target, raw)));
  }
  // 被动 modifyIncomingDamage（守方常驻减伤，如 Bombardiro 装甲蒙皮）。
  const targetPassive = passiveOf(target.archetypeId);
  if (targetPassive?.modifyIncomingDamage) {
    raw = Math.max(0, Math.floor(targetPassive.modifyIncomingDamage(passiveCtx(state, target, rng, emit), actor, raw)));
  }
  let mitigated = 0;
  if (target.stoneTurns > 0) {
    mitigated = target.stoneAmount;
    raw = Math.max(0, raw - mitigated);
  }
  target.hp = Math.max(0, target.hp - raw);
  emit({ t: 'damage', to: refOf(target), roll: dmgRoll, mitigated, dealt: raw, hpLeft: target.hp });

  // CON 被动吸血（命中造成伤害才回；AOE 不触发，避免群体吸血过强）
  if (!mods.aoe && raw > 0 && actor.stats.lifestealRate > 0 && !actor.downed && !actor.dead) {
    const heal = Math.floor(raw * actor.stats.lifestealRate);
    if (heal > 0) {
      const before = actor.hp;
      actor.hp = Math.min(actor.stats.maxHp, actor.hp + heal);
      emit({ t: 'lifesteal', who: refOf(actor), amount: actor.hp - before, hpLeft: actor.hp });
    }
  }

  // 命中被动钩子：攻方 onDealDamage、守方 onTakeHit（AOE 不触发单体被动，避免群体叠层失衡）。
  if (!mods.aoe) {
    actorPassive?.onDealDamage?.(passiveCtx(state, actor, rng, emit), target, raw, crit, !!mods.fromSpell);
    passiveOf(target.archetypeId)?.onTakeHit?.(passiveCtx(state, target, rng, emit), actor, raw, crit);
  }

  maybeThorns(actor, target, rng, emit);
  return true;
}

function maybeThorns(actor: FighterRT, target: FighterRT, _rng: Rng, emit: (e: BattleEvent) => void): void {
  if (target.thorns > 0 && !actor.downed && !actor.dead) {
    // 反弹固定 1，且用掉一层（只反弹下一次攻击，不再整回合无限反弹）
    target.thorns--;
    const dealt = 1;
    actor.hp = Math.max(0, actor.hp - dealt);
    emit({ t: 'thorns', to: refOf(actor), roll: { spec: '1', rolls: [1], bonus: 0, total: 1 }, dealt, hpLeft: actor.hp });
  }
}

/**
 * 直接回复（治疗/复活效果用）。复活倒地者由调用方先清 downed。
 * 受者被动 modifyIncomingHeal 可增幅回复量（如 BC→CA 联动），source=施加者。
 */
function applyHeal(
  state: BattleState,
  who: FighterRT,
  amount: number,
  r: RollDetail,
  emit: (e: BattleEvent) => void,
  rng: Rng,
  source?: FighterRT,
): void {
  if (who.dead) return;
  let amt = Math.max(0, amount);
  const p = passiveOf(who.archetypeId);
  if (p?.modifyIncomingHeal) {
    amt = Math.max(0, Math.floor(p.modifyIncomingHeal(passiveCtx(state, who, rng, emit), source, amt)));
  }
  const before = who.hp;
  who.hp = Math.min(who.stats.maxHp, who.hp + amt);
  emit({ t: 'heal', who: refOf(who), roll: r, amount: who.hp - before, hpLeft: who.hp });
}

// ─────────────────────────────────────────────────────────────────────────
// 倒地 / 死亡 / 回合管理
// ─────────────────────────────────────────────────────────────────────────

/** 结算本步造成的倒地/死亡：HP≤0 → 倒地；已倒地再受击(HP仍0) → 彻底死亡移出 order。 */
/** 倒地多少个"本方回合"未被救 → 转为彻底死亡。 */
export const DOWNED_TO_DEAD_TURNS = 3;

function settleCasualties(state: BattleState, emit: (e: BattleEvent) => void, rng: Rng): void {
  for (const f of [...state.teams.a, ...state.teams.b]) {
    if (f.dead) continue;
    // HP≤0 且未倒地 → 倒地。先给被动 onWouldGoDown veto（如 Trippi 九命）一次拦截机会：
    // 覆盖一切致死来源（普攻/技能/AOE/反弹），返回 true 表示被动已把 hp 拉到 ≥1 → 不倒地。
    if (f.hp <= 0 && !f.downed) {
      const vetoed = passiveOf(f.archetypeId)?.onWouldGoDown?.(passiveCtx(state, f, rng, emit)) ?? false;
      if (vetoed && f.hp > 0) continue;
      f.downed = true;
      f.downedTurns = 0;
      emit({ t: 'downed', who: refOf(f) });
    }
  }
  // 仅彻底死亡者从先攻序列移除；倒地者保留在序列（轮到时被跳过 + 累计 downedTurns）
  const deadKeys = new Set(
    [...state.teams.a, ...state.teams.b].filter((f) => f.dead).map((f) => key(refOf(f))),
  );
  if (deadKeys.size > 0) {
    // 记录当前行动者，移除后重新定位 turnIndex
    const curRef = state.order[state.turnIndex];
    state.order = state.order.filter((r) => !deadKeys.has(key(r)));
    if (curRef && !deadKeys.has(key(curRef))) {
      state.turnIndex = state.order.findIndex((r) => refEq(r, curRef));
    } else if (state.turnIndex >= state.order.length) {
      state.turnIndex = 0;
    }
  }
}

/** 推进到 order 里下一个能"占用回合"的角色（倒地者也占回合但会被跳过；dead 已移出）。 */
function advanceTurn(state: BattleState): void {
  if (state.order.length === 0) return;
  // 额外回合（Lirilì 时间静止）：当前行动者还有额外回合且仍能行动 → 不前进指针，本人再动一次。
  const cur = currentFighter(state);
  if (cur && cur.extraTurns > 0 && !cur.downed && !cur.dead) {
    cur.extraTurns--;
    return;
  }
  const prev = state.turnIndex;
  state.turnIndex = (state.turnIndex + 1) % state.order.length;
  // 绕回到序列头 → round++
  if (state.turnIndex <= prev) state.round++;
}

// ─────────────────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────────────────

const key = (r: FighterRef): string => `${r.team}:${r.id}`;

function cloneState(s: BattleState): BattleState {
  return {
    teams: {
      a: s.teams.a.map(cloneFighter),
      b: s.teams.b.map(cloneFighter),
    },
    order: s.order.map((r) => ({ ...r })),
    turnIndex: s.turnIndex,
    round: s.round,
    rngCursor: s.rngCursor,
    winner: s.winner,
  };
}

function cloneFighter(f: FighterRT): FighterRT {
  // passiveState 必须深拷：否则克隆与原态共享同一对象，被动写栈会跨越纯函数边界、破坏确定性。
  return { ...f, skills: [...f.skills], stats: { ...f.stats }, passiveState: { ...f.passiveState } };
}
