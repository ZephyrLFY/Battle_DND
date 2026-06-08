/**
 * 技能效果插件 —— 每个技能一个 effect handler，注册到表里。
 *
 * 引擎（battle.ts）只负责：解析目标 → 构造 EffectCtx → 调用对应 handler。
 * 加新技能 = 在这里加一个 handler + 在 skills.ts 加定义，**不碰引擎核心**。
 *
 * 共享的攻击/伤害管线（命中骰、暴击、减伤、吸血、反弹）由 ctx.attack 提供，
 * handler 不重复实现。
 */
import { roll } from './dice.js';
import type { SkillId } from './skills.js';
import type { EffectCtx, FighterRT } from './battleTypes.js';

/** 一个技能效果 handler：对 ctx 里的 actor/targets 施加效果。 */
export type SkillEffect = (ctx: EffectCtx) => void;

/** 取第一个目标（单体技能用）。 */
const first = (ctx: EffectCtx): FighterRT | undefined => ctx.targets[0];

export const SKILL_EFFECTS: Record<SkillId, SkillEffect> = {
  // —— 攻击强化 ——
  brave_strike: (ctx) => {
    const t = first(ctx);
    if (t) ctx.attack(t, { brave: true });
  },
  precise_aim: (ctx) => {
    const t = first(ctx);
    if (t) ctx.attack(t, { advantage: true });
  },
  charge_smash: (ctx) => {
    // 蓄力：本回合不攻击，标记下回合强化（必中重击）
    ctx.actor.charged = true;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '蓄力中，下回合必中重击' });
  },
  flurry: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    ctx.attack(t);
    if (t.hp > 0 && !t.dead) ctx.attack(t);
  },
  stun_strike: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    ctx.attack(t);
    if (t.hp > 0 && !t.downed && !t.dead) {
      // 体质豁免：对方 1d20+CON_mod ≥ 13 抵抗
      const save = roll(ctx.rng, '1d20', t.stats.conMod);
      if (save.total < 13) {
        t.stunned = 1;
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 被眩晕（豁免 ${save.total}<13）` });
      } else {
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 抵抗了眩晕（豁免 ${save.total}≥13）` });
      }
    }
  },

  // —— 防御姿态（self）——
  shield_block: (ctx) => {
    ctx.actor.acBonus += 5;
    ctx.actor.thorns = 1;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '本回合 AC+5 并反弹伤害' });
  },
  stone_skin: (ctx) => {
    const r = roll(ctx.rng, '1d6');
    ctx.actor.stoneTurns = 2;
    ctx.actor.stoneAmount = r.total;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `石化：2 回合内减伤 ${r.total}` });
  },
};

export function skillEffect(id: SkillId): SkillEffect {
  const e = SKILL_EFFECTS[id];
  if (!e) throw new Error(`No effect registered for skill: ${id}`);
  return e;
}

function ref(f: FighterRT) {
  return { team: f.team, id: f.id };
}
