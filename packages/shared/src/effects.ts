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
import { isControlImmune } from './passives.js';
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
    if (t.hp > 0 && !t.downed && !t.dead && !isControlImmune(t)) {
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
    ctx.actor.acBonus += 3;
    ctx.actor.thorns = 1;
    // 防御转资源：回 2 点能量（普攻才回 1，放弃这回合输出必须更划算）。
    const before = ctx.actor.energy;
    ctx.actor.energy = Math.min(ctx.actor.stats.maxEnergy, ctx.actor.energy + 2);
    const gained = ctx.actor.energy - before;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `本回合 AC+3、反弹伤害，回 ${gained} 能量` });
    if (gained > 0) ctx.emit({ t: 'energy', who: ref(ctx.actor), delta: gained, now: ctx.actor.energy });
  },
  // —— 佯攻（cost 0）：小伤 + 破甲，给队友铺路 ——
  feint: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    ctx.attack(t, { fixedDamage: '1d4' });
    if (t.hp > 0 && !t.downed && !t.dead) {
      t.acDebuffTurns = 2; // 2 因目标自己回合开始先衰减 1 → 覆盖其下一回合
      t.acDebuffAmt = 2;
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `佯攻破甲！${t.name} 下回合 AC −2` });
    }
  },

  // —— 团队技能（3v3）——
  heal: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return; // 治疗不能作用于阵亡/倒地（复活才行）
    const r = roll(ctx.rng, '2d4', t.stats.conMod);
    ctx.heal(t, r.total, r);
  },
  revive: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || !t.downed) return; // 仅对倒地者生效
    const r = roll(ctx.rng, '1d8');
    t.downed = false;
    t.downedTurns = 0;
    t.hp = Math.min(t.stats.maxHp, Math.max(1, r.total));
    ctx.emit({ t: 'revive', who: ref(t), hpLeft: t.hp });
  },
  firestorm: (ctx) => {
    // AOE：对每个目标各发起一次"固伤命中"——这里走共享攻击管线（命中+1d6）
    for (const t of ctx.targets) {
      if (!t.dead && !t.downed) ctx.attack(t, { aoe: true });
    }
  },
  war_cry: (ctx) => {
    // 全体友方下 1 回合命中 +2
    for (const t of ctx.targets) {
      if (!t.dead) t.rallyTurns = 2; // 2 因本方回合开始会先衰减 1
    }
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '战吼！全体友方下回合命中 +2' });
  },

  // —— 角色签名技能 ——
  // 🥖 Tung：连敲 3 次，命中递减（0/−2/−4）。配合「不眠的梆子」被动逐击叠层。
  sig_tung_combo: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    for (let i = 0; i < 3; i++) {
      if (t.hp <= 0 || t.downed || t.dead) break;
      ctx.attack(t, { extraHitBonus: -2 * i });
    }
  },
  // 🦢💣 Bombombini：自爆冲锋。4d6 单体（fromSpell→「引信」加成生效），自身受当前 HP 1/4 反噬。
  sig_bombombini_blast: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    ctx.attack(t, { charged: true }); // 必中、伤害骰 4d6（复用蓄力档）
    const recoil = Math.floor(ctx.actor.hp / 4);
    if (recoil > 0) {
      ctx.actor.hp = Math.max(0, ctx.actor.hp - recoil);
      ctx.emit({ t: 'damage', to: ref(ctx.actor), roll: { spec: '反噬', rolls: [recoil], bonus: 0, total: recoil }, mitigated: 0, dealt: recoil, hpLeft: ctx.actor.hp });
    }
  },
  // 🐸 Trippi：哈气。令一个敌人下回合命中 −4（纯控，不造成伤害）。
  sig_trippi_hiss: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    // 抓一爪：小伤（1d4），给 Trippi 一点主动输出。
    ctx.attack(t, { fixedDamage: '1d4' });
    if (t.hp <= 0 || t.downed || t.dead) return;
    if (isControlImmune(t)) {
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 免疫了哈气降命中` });
      return;
    }
    t.hitPenaltyTurns = 2; // 2 因目标自己回合开始会先衰减 1 → 实际覆盖其下一回合
    t.hitPenaltyAmt = 4;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `哈气！${t.name} 下回合命中 −4` });
  },
  // 🌵🐘 Lirilì：时间静止。本回合用于发动，随后连续行动 2 次（净 +1 行动，对应「下回合行动2次」）。
  sig_lirili_timestop: (ctx) => {
    ctx.actor.extraTurns += 2;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '时间静止！连续行动 2 次' });
  },
  // ☕ Cappuccino：斩首一击。必中；目标 HP<25% 时伤害骰翻倍（处决）。
  sig_cappuccino_behead: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    const execute = t.hp < t.stats.maxHp * 0.25;
    // 复用蓄力(必中, 4d6)做处决档；非处决用英勇(命中+2, 3d6)。
    ctx.attack(t, execute ? { charged: true } : { brave: true });
  },
  // 🩰☕ Ballerina：华尔兹号令。全体友方下回合命中 +2 且 AC +1。
  sig_ballerina_waltz: (ctx) => {
    for (const t of ctx.targets) {
      if (t.dead) continue;
      t.rallyTurns = 2; // 2 因本方回合开始先衰减 1
      t.acBonus += 1;
    }
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '华尔兹号令！全体友方命中 +2、AC +1' });
  },
  // 🐊 Bombardiro：地毯式轰炸。AOE 2d6；每目标体质豁免失败则震慑。
  sig_bombardiro_carpet: (ctx) => {
    for (const t of ctx.targets) {
      if (t.dead || t.downed) continue;
      ctx.attack(t, { aoe: true });
      if (t.hp > 0 && !t.downed && !t.dead && !isControlImmune(t)) {
        const save = roll(ctx.rng, '1d20', t.stats.conMod);
        if (save.total < 13) {
          t.stunned = 1;
          ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 被震慑（豁免 ${save.total}<13）` });
        }
      }
    }
  },
  // 🌳 Patapim：藤蔓缠绕。命中 + 定身（体质豁免失败则昏迷）。
  sig_patapim_vines: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    ctx.attack(t);
    if (t.hp > 0 && !t.downed && !t.dead && !isControlImmune(t)) {
      const save = roll(ctx.rng, '1d20', t.stats.conMod);
      if (save.total < 13) {
        t.stunned = 1;
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `藤蔓缠绕！${t.name} 被定身（豁免 ${save.total}<13）` });
      } else {
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 挣脱了藤蔓（豁免 ${save.total}≥13）` });
      }
    }
  },
  // 🐸🛞 Boneca：轮胎冲撞。必中高伤（蓄力档 4d6），命中后撞退（下回合命中 −3）。
  sig_boneca_ram: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    ctx.attack(t, { charged: true });
    if (t.hp > 0 && !t.downed && !t.dead) {
      t.hitPenaltyTurns = 2; // 覆盖目标下一回合
      t.hitPenaltyAmt = Math.max(t.hitPenaltyAmt, 3);
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `撞退！${t.name} 下回合命中 −3` });
    }
  },
  // 🐪🧊 Frigo：冰封护盾。本回合 AC+3，接下来 2 回合免疫控制。
  sig_frigo_iceshield: (ctx) => {
    ctx.actor.acBonus += 3;
    ctx.actor.controlImmuneTurns = 3; // 3 因本方回合开始先衰减 1 → 覆盖本回合 + 之后
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '冰封护盾！AC +3，免疫控制' });
  },
  // 🦈👟 Tralalero：疾游连斩。2 次攻击，每次命中后本回合 AC +1。
  sig_tralalero_dash: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    let hits = 0;
    for (let i = 0; i < 2; i++) {
      if (t.hp <= 0 || t.downed || t.dead) break;
      const before = t.hp;
      ctx.attack(t);
      if (t.hp < before) hits++;
    }
    // 两次都命中才 AC+1（原来每次各+1，自保过强）
    if (hits >= 2) ctx.actor.acBonus += 1;
  },
  // 🍌🐒 Chimpanzini：狂猿连击。攻击次数 = 当前能量数（≥1），打完清空能量。
  sig_chimpanzini_frenzy: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    const hits = Math.max(1, ctx.actor.energy);
    ctx.actor.energy = 0;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `狂猿连击！连打 ${hits} 次` });
    for (let i = 0; i < hits; i++) {
      if (t.hp <= 0 || t.downed || t.dead) break;
      ctx.attack(t);
    }
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
