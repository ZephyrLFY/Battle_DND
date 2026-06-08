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
    dead: false,
    stunned: 0,
    stoneTurns: 0,
    stoneAmount: 0,
    acBonus: 0,
    thorns: 0,
    charged: false,
    rallyTurns: 0,
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

  // 先攻：每人掷 1d20 + DEX_mod，降序；平手按 a 队优先、再按入场序（稳定）
  const initiative: Record<string, RollDetail> = {};
  const scored = all.map((f, idx) => {
    const r = roll(rng, '1d20', f.stats.initiative);
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

  const enemies = aliveOf(state, otherSide(f.team)).filter((e) => !e.downed);
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
  const enemies = aliveOf(state, otherSide(actor.team)).filter((e) => !e.downed);
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

  if (actor.downed) {
    emit({ t: 'skip', who: refOf(actor), why: 'downed' });
  } else if (actor.stunned > 0) {
    actor.stunned--;
    emit({ t: 'skip', who: refOf(actor), why: 'stunned' });
  } else {
    perform(next, actor, validate(next, actor, action), rng, emit);
  }

  // 结算倒地/死亡
  settleCasualties(next, emit);

  // 胜负检查
  const aDead = next.teams.a.every((f) => f.dead);
  const bDead = next.teams.b.every((f) => f.dead);
  if (aDead || bDead) {
    next.winner = aDead && bDead ? null : aDead ? 'b' : 'a';
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
    if (t && !t.dead && !t.downed && t.team !== actor.team) return action;
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
  if (action.kind === 'attack') {
    emit({ t: 'action', who: refOf(actor), action });
    const target = find(state, action.target);
    if (target) doAttack(state, actor, target, rng, emit, { charged: actor.charged });
    actor.charged = false;
    // 普攻攒能量：+1（上限 maxEnergy）。这让"想放大招得先普攻"，普攻不被废弃。
    if (actor.energy < actor.stats.maxEnergy) {
      actor.energy = Math.min(actor.stats.maxEnergy, actor.energy + 1);
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
  const ctx: EffectCtx = {
    actor,
    targets,
    rng,
    emit,
    attack: (target, mods) => doAttack(state, actor, target, rng, emit, mods ?? {}),
    heal: (who, amount, r) => applyHeal(who, amount, r, emit),
  };
  skillEffect(action.skill)(ctx);
}

// ─────────────────────────────────────────────────────────────────────────
// 共享攻击 / 伤害 / 回复管线
// ─────────────────────────────────────────────────────────────────────────

function doAttack(
  state: BattleState,
  actor: FighterRT,
  target: FighterRT,
  rng: Rng,
  emit: (e: BattleEvent) => void,
  mods: AttackMods,
): void {
  if (target.dead) return;
  const rallyBonus = actor.rallyTurns > 0 ? 2 : 0;
  const hitBonus = actor.stats.toHit + (mods.brave ? 2 : 0) + (mods.extraHitBonus ?? 0) + rallyBonus;
  const ar = mods.advantage ? attackRollAdvantage(rng, hitBonus, 'adv') : attackRoll(rng, hitBonus);

  const targetAc = target.stats.ac + target.acBonus;
  const autoHit = mods.charged || ar.nat20;
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
    maybeThorns(actor, target, rng, emit);
    return;
  }

  // 法术加强：蓄力 4d6、英勇 3d6、AOE 2d6、普攻 1d6（让消耗能量更值）
  let dmgSpec = mods.charged ? '4d6' : mods.brave ? '3d6' : mods.aoe ? '2d6' : '1d6';
  if (crit) dmgSpec = doubleDice(dmgSpec);
  // AOE 不加 STR 伤害调整（已靠多目标 + 2d6 体现价值）
  const dmgBonus = mods.aoe ? 0 : actor.stats.dmgBonus;
  const dmgRoll = roll(rng, dmgSpec, dmgBonus);

  let raw = Math.max(0, dmgRoll.total);
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

  maybeThorns(actor, target, rng, emit);
}

function maybeThorns(actor: FighterRT, target: FighterRT, rng: Rng, emit: (e: BattleEvent) => void): void {
  if (target.thorns > 0 && !actor.downed && !actor.dead) {
    const r = roll(rng, '1d4');
    actor.hp = Math.max(0, actor.hp - r.total);
    emit({ t: 'thorns', to: refOf(actor), roll: r, dealt: r.total, hpLeft: actor.hp });
  }
}

/** 直接回复（治疗/复活效果用）。复活倒地者由调用方先清 downed。 */
function applyHeal(who: FighterRT, amount: number, r: RollDetail, emit: (e: BattleEvent) => void): void {
  if (who.dead) return;
  const before = who.hp;
  who.hp = Math.min(who.stats.maxHp, who.hp + Math.max(0, amount));
  emit({ t: 'heal', who: refOf(who), roll: r, amount: who.hp - before, hpLeft: who.hp });
}

// ─────────────────────────────────────────────────────────────────────────
// 倒地 / 死亡 / 回合管理
// ─────────────────────────────────────────────────────────────────────────

/** 结算本步造成的倒地/死亡：HP≤0 → 倒地；已倒地再受击(HP仍0) → 彻底死亡移出 order。 */
function settleCasualties(state: BattleState, emit: (e: BattleEvent) => void): void {
  for (const f of [...state.teams.a, ...state.teams.b]) {
    if (f.dead) continue;
    if (f.hp <= 0) {
      if (!f.downed) {
        f.downed = true;
        emit({ t: 'downed', who: refOf(f) });
      } else {
        // 倒地状态下再被打到 0 → 彻底死亡
        f.dead = true;
        emit({ t: 'dead', who: refOf(f) });
      }
    }
  }
  // 从先攻序列移除已死亡者（保持 turnIndex 指向不越界由 advanceTurn 处理）
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
  return { ...f, skills: [...f.skills], stats: { ...f.stats } };
}
