/**
 * PvE 敌人 AI —— 两档：random（随机）/ greedy（贪心，带启发式打分）。
 *
 * 贪心思路：对每个合法动作打一个分（期望收益），选最高分；同分用 RNG 决胜，保留变化。
 * 不做多步预判（那是"困难"档以后的事），只看当前局面的即时收益。确定性（走传入种子）。
 */
import { Rng } from './rng.js';
import {
  legalActions,
  legalTargets,
  defaultTargets,
  currentFighter,
  aliveOf,
  find,
  type Action,
  type BattleState,
  type FighterRT,
} from './battle.js';
import { otherSide } from './battleTypes.js';
import { skillDef } from './skills.js';

export type AiLevel = 'random' | 'greedy';

/** 统一入口：按难度选 AI。默认贪心。 */
export function chooseAction(state: BattleState, seed: number, level: AiLevel = 'greedy'): Action {
  return level === 'random' ? chooseActionRandom(state, seed) : chooseActionGreedy(state, seed);
}

// ─────────────────────────────────────────────────────────────────────────
// 随机 AI（简单档 / 平衡模拟基线）
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
// 贪心 AI
// ─────────────────────────────────────────────────────────────────────────

export function chooseActionGreedy(state: BattleState, seed: number): Action {
  const cur = currentFighter(state);
  const actions = legalActions(state);
  if (actions.length === 0 || !cur) return fallbackAttack(state, cur);

  const rng = new Rng(seed);
  // 给每个动作打分，选最高；同分用 RNG 抖动决胜（保留少量变化、不死板）
  let best: { action: Action; score: number } | null = null;
  for (const a of actions) {
    const { action, score } = evalAction(state, cur, a, rng);
    const jittered = score + rng.next() * 0.5;
    if (!best || jittered > best.score) best = { action, score: jittered };
  }
  return best ? best.action : fallbackAttack(state, cur);
}

/** 给一个动作打分并填好最优目标，返回 {action(带目标), score}。 */
function evalAction(
  state: BattleState,
  self: FighterRT,
  action: Action,
  rng: Rng,
): { action: Action; score: number } {
  const enemies = aliveOf(state, otherSide(self.team)).filter((e) => !e.downed); // 倒地不可补刀
  const allies = aliveOf(state, self.team);
  const hpRatio = self.hp / self.stats.maxHp;

  if (action.kind === 'attack') {
    const target = pickAttackTarget(enemies, self);
    if (!target) return { action, score: -1 };
    // 评分 = 期望伤害 + 击杀加成 − 反弹惩罚（对面举盾时别硬撞）
    const score = expectedDamage(self, target, 1) + killBonus(target, self, 1) - thornsPenalty(target);
    return { action: { kind: 'attack', target: ref(target) }, score: score + 0.1 };
    // +0.1 让普攻成为有正分的保底动作
  }

  const def = skillDef(action.skill);
  switch (action.skill) {
    case 'brave_strike':
    case 'precise_aim':
    case 'charge_smash':
    case 'stun_strike':
    case 'flurry': {
      // 攻击型技能：按伤害骰数估期望伤害
      const dice = action.skill === 'charge_smash' ? 4 : action.skill === 'brave_strike' || action.skill === 'flurry' ? 3 : 2;
      const target = pickAttackTarget(enemies, self);
      if (!target) return { action, score: -1 };
      let s = expectedDamage(self, target, dice) + killBonus(target, self, dice);
      if (action.skill === 'stun_strike') s += 4; // 控制有额外价值
      if (action.skill === 'charge_smash') s -= 3; // 蓄力要等一回合，打折
      return { action: { kind: 'skill', skill: action.skill, targets: [ref(target)] }, score: s };
    }
    case 'firestorm': {
      // AOE：期望伤害 × 敌人数
      const s = enemies.reduce((acc, e) => acc + expectedDamage(self, e, 2, /*aoe*/ true), 0);
      return { action: { kind: 'skill', skill: 'firestorm', targets: enemies.map(ref) }, score: s };
    }
    case 'heal': {
      // 治疗：只在友方濒死（救命）时才值得，否则进攻优先（治疗不赢比赛，只是续命）。
      const hurt = allies.filter((a) => !a.downed && a.hp / a.stats.maxHp < 0.35);
      if (hurt.length === 0) return { action, score: -1 };
      const t = hurt.reduce((lo, a) => (a.hp / a.stats.maxHp < lo.hp / lo.stats.maxHp ? a : lo));
      // 越濒死越值，但封顶不超过一次强力攻击的分量
      const s = t.hp / t.stats.maxHp < 0.15 ? 8 : 4;
      return { action: { kind: 'skill', skill: 'heal', targets: [ref(t)] }, score: s };
    }
    case 'revive': {
      const downed = allies.filter((a) => a.downed && !a.dead);
      if (downed.length === 0) return { action, score: -1 };
      return { action: { kind: 'skill', skill: 'revive', targets: [ref(downed[0]!)] }, score: 20 };
    }
    case 'war_cry': {
      // 队友越多越值
      const n = allies.filter((a) => !a.downed).length;
      return { action: { kind: 'skill', skill: 'war_cry', targets: allies.filter((a) => !a.downed).map(ref) }, score: 3 + n * 1.5 };
    }
    case 'shield_block':
    case 'stone_skin': {
      // 纯防御姿态在回合制里几乎总是亏（少打一次输出）。贪心 AI 基本不主动龟缩，
      // 只给极低的保底分——仅当没有任何能攻击的目标时才会被动选到。
      void hpRatio;
      return { action: { ...action, targets: defaultTargets(state, self, def.targetType) }, score: 0.05 };
    }
  }
}

/**
 * 选攻击目标：按"攻击价值"挑——能秒的、血少的优先，但避开举盾（高 AC + 反弹）的目标，
 * 除非它没护盾或只剩它。
 */
function pickAttackTarget(enemies: FighterRT[], self: FighterRT): FighterRT | undefined {
  if (enemies.length === 0) return undefined;
  // 能秒的（不举盾）最优先：直接清掉一个行动者
  const killable = enemies.filter(
    (e) => e.thorns === 0 && e.hp <= expectedDamage(self, e, 1) * 1.2,
  );
  if (killable.length > 0) return killable.reduce((lo, e) => (e.hp < lo.hp ? e : lo));
  // 否则按攻击价值排：期望伤害高（易命中、血少）− 反弹惩罚
  return enemies.reduce((best, e) =>
    attackValue(self, e) > attackValue(self, best) ? e : best,
  );
}

/** 攻击一个目标的即时价值：期望伤害 − 反弹惩罚 + 残血加权。 */
function attackValue(self: FighterRT, e: FighterRT): number {
  const lowHpBonus = (1 - e.hp / e.stats.maxHp) * 3; // 越残血越想集火
  return expectedDamage(self, e, 1) - thornsPenalty(e) + lowHpBonus;
}

/** 反弹惩罚：目标有护盾反弹时，攻击它会吃反伤，降低其攻击价值。 */
function thornsPenalty(e: FighterRT): number {
  return e.thorns > 0 ? 3 : 0;
}

/** 期望伤害 ≈ 命中率 × (骰均值×dice + STR调整 − 目标减伤近似)。 */
function expectedDamage(self: FighterRT, target: FighterRT, dice: number, aoe = false): number {
  const targetAc = target.stats.ac + target.acBonus;
  // 命中率：1d20 + toHit ≥ AC
  const need = targetAc - self.stats.toHit;
  const hitChance = Math.max(0.05, Math.min(0.95, (21 - need) / 20));
  const avgDie = 3.5; // d6
  const bonus = aoe ? 0 : self.stats.dmgBonus;
  const dmg = avgDie * dice + bonus - (target.stoneTurns > 0 ? target.stoneAmount : 0);
  return Math.max(0, hitChance * dmg);
}

/** 击杀加成：若期望伤害能让目标进入倒地/死亡，给额外分。 */
function killBonus(target: FighterRT, self: FighterRT, dice: number): number {
  return expectedDamage(self, target, dice) >= target.hp ? 6 : 0;
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
