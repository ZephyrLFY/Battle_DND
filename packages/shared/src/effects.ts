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
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '蓄力中，下回合重击（4d6）', noteEn: 'Charging — next attack rolls 4d6' });
  },
  flurry: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    ctx.attack(t);
    if (t.hp > 0 && !t.dead) ctx.attack(t);
  },
  // —— 防御姿态（self）——
  shield_block: (ctx) => {
    ctx.actor.acBonus += 3;
    ctx.actor.acBonusTurns = 2; // 2 因本方回合开始先衰减 1 → 覆盖到自己下回合开始
    ctx.actor.thorns = 1;
    // 防御转资源：回 2 点能量（普攻才回 1，放弃这回合输出必须更划算）。
    const before = ctx.actor.energy;
    ctx.actor.energy = Math.min(ctx.actor.stats.maxEnergy, ctx.actor.energy + 2);
    const gained = ctx.actor.energy - before;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `本回合 AC+3、反弹伤害，回 ${gained} 能量`, noteEn: `AC +3 this turn, thorns up, +${gained} energy` });
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
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `佯攻破甲！${t.name} 下回合 AC −2`, noteEn: `Feint! ${t.name} AC −2 next turn` });
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
    // 平衡补丁 3c：1d8 → 1d8+15% → 纯 15% maxHp（带骰版消融 +28pt 偏高，去骰回调）
    t.downed = false;
    t.downedTurns = 0;
    t.hp = Math.min(t.stats.maxHp, Math.max(1, Math.floor(t.stats.maxHp * 0.15)));
    ctx.emit({ t: 'revive', who: ref(t), hpLeft: t.hp });
  },
  firestorm: (ctx) => {
    // AOE：对每个目标各发起一次"固伤命中"——走共享攻击管线（命中+2d6）。
    // 平衡补丁：命中者附加灼烧（2 回合，每回合开始掉 1d3）。
    for (const t of ctx.targets) {
      if (t.dead || t.downed) continue;
      const hit = ctx.attack(t, { aoe: true });
      if (hit && t.hp > 0 && !t.downed && !t.dead) {
        t.burnTurns = Math.max(t.burnTurns, 2);
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 被点燃（灼烧 2 回合）`, noteEn: `${t.name} is set ablaze (burning for 2 turns)` });
      }
    }
  },
  war_cry: (ctx) => {
    // 全体友方下 1 回合命中 +2
    for (const t of ctx.targets) {
      if (!t.dead) t.rallyTurns = 2; // 2 因本方回合开始会先衰减 1
    }
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '战吼！全体友方下回合命中 +2', noteEn: 'War cry! All allies +2 to hit next turn' });
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
    // 平衡补丁：反噬从「当前 HP 1/4」改为「实际造成伤害的一半」——
    // 旧版残血时反噬近乎免费（无下行风险）；新版炸得越狠自伤越重（含引信加伤）。
    const before = t.hp;
    ctx.attack(t, { charged: true, autoHit: true }); // 必中、伤害骰 4d6（重击档；必中是签名特权）
    const recoil = Math.floor(((before - t.hp) * 3) / 4); // 系数 3/4：1/2 时实测仍 91% 胜率（满血期比旧版便宜）
    if (recoil > 0) {
      ctx.actor.hp = Math.max(0, ctx.actor.hp - recoil);
      ctx.emit({ t: 'damage', to: ref(ctx.actor), roll: { spec: '反噬', rolls: [recoil], bonus: 0, total: recoil }, mitigated: 0, dealt: recoil, hpLeft: ctx.actor.hp });
    }
  },
  // 🐸 Trippi：哈气。抓一爪（1d4），命中则吓住目标（下回合昏迷）。
  // 平衡补丁三轮：降命中（−4）重做为命中即眩晕——旧版两轮数值 buff 后消融贡献仍 ≈0。
  // 强度阀门：必须命中（1d4 爪击过 AC 判定）+ 吃控制免疫；Trippi 被动同步削（九命 25%→15%）。
  sig_trippi_hiss: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    const hit = ctx.attack(t, { fixedDamage: '1d4' });
    if (!hit || t.hp <= 0 || t.downed || t.dead) return;
    if (isControlImmune(t)) {
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 免疫了哈气`, noteEn: `${t.name} is immune to the hiss` });
      return;
    }
    t.stunned = Math.max(t.stunned, 1);
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `哈气！${t.name} 被吓住，下回合无法行动`, noteEn: `Hiss! ${t.name} is terrified — stunned next turn` });
  },
  // 🌵🐘 Lirilì：时间静止。本回合用于发动，随后连续行动 2 次（净 +1 行动，对应「下回合行动2次」）。
  sig_lirili_timestop: (ctx) => {
    ctx.actor.extraTurns += 2;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '时间静止！连续行动 2 次', noteEn: 'Time stop! Acts twice in a row' });
  },
  // ☕ Cappuccino：斩首一击。必中；目标 HP<25% 时伤害骰翻倍（处决）。
  sig_cappuccino_behead: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    const execute = t.hp < t.stats.maxHp * 0.25;
    // 处决档：必中 4d6；非处决用独立档（命中+2、3d6）——不再复用 brave 档（其 nerf 曾连带削了斩首）。
    ctx.attack(t, execute ? { charged: true, autoHit: true } : { dice: '3d6', extraHitBonus: 2 });
  },
  // 🩰☕ Ballerina：华尔兹号令。全体友方下回合命中 +2 且 AC +1。
  sig_ballerina_waltz: (ctx) => {
    for (const t of ctx.targets) {
      if (t.dead) continue;
      t.rallyTurns = 2; // 2 因本方回合开始先衰减 1
      t.acBonus += 1;
      t.acBonusTurns = Math.max(t.acBonusTurns, 2);
      // 平衡补丁：附带小幅伤害增益 +2（叠加在 rally 自带的 +2 上）
      t.dmgBuffTurns = 2;
      t.dmgBuffAmt = Math.max(t.dmgBuffAmt, 2);
    }
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '华尔兹号令！全体友方命中 +2、AC +1、伤害提升', noteEn: 'Waltz command! All allies +2 to hit, +1 AC, bonus damage' });
  },
  // 🐊 Bombardiro：地毯式轰炸。AOE 2d6；每目标体质豁免失败则震慑。
  sig_bombardiro_carpet: (ctx) => {
    for (const t of ctx.targets) {
      if (t.dead || t.downed) continue;
      ctx.attack(t, { aoe: true });
      if (t.hp > 0 && !t.downed && !t.dead && !isControlImmune(t)) {
        // 平衡补丁：群体眩晕豁免 DC 13→11（更易抵抗；单体控制技仍为 13）
        const save = roll(ctx.rng, '1d20', t.stats.conMod);
        if (save.total < 11) {
          t.stunned = 1;
          ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 被震慑（豁免 ${save.total}<11）`, noteEn: `${t.name} is dazed (save ${save.total} < 11)` });
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
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `藤蔓缠绕！${t.name} 被定身（豁免 ${save.total}<13）`, noteEn: `Vines! ${t.name} is rooted (save ${save.total} < 13)` });
      } else {
        ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `${t.name} 挣脱了藤蔓（豁免 ${save.total}≥13）`, noteEn: `${t.name} broke free of the vines (save ${save.total} ≥ 13)` });
      }
    }
  },
  // 🐸🛞 Boneca：轮胎冲撞。必中高伤（蓄力档 4d6），命中后撞退（下回合命中 −3）。
  sig_boneca_ram: (ctx) => {
    const t = first(ctx);
    if (!t || t.dead || t.downed) return;
    ctx.attack(t, { charged: true, autoHit: true }); // 必中是签名特权（蓄力重击已无必中）
    if (t.hp > 0 && !t.downed && !t.dead) {
      t.hitPenaltyTurns = 2; // 覆盖目标下一回合
      t.hitPenaltyAmt = Math.max(t.hitPenaltyAmt, 3);
      ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `撞退！${t.name} 下回合命中 −3`, noteEn: `Knockback! ${t.name} −3 to hit next turn` });
    }
  },
  // 🐪🧊 Frigo：冰封护盾。本回合 AC+3，接下来 2 回合免疫控制。
  sig_frigo_iceshield: (ctx) => {
    ctx.actor.acBonus += 3;
    ctx.actor.acBonusTurns = 4; // 平衡补丁二轮：AC+3 持续 3 回合（4 因本方回合开始先衰减 1）
    ctx.actor.controlImmuneTurns = 4; // 同步 3 回合免控
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: '冰封护盾！AC +3，免疫控制', noteEn: 'Ice shield! AC +3, immune to control effects' });
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
    if (hits >= 2) {
      ctx.actor.acBonus += 1;
      ctx.actor.acBonusTurns = Math.max(ctx.actor.acBonusTurns, 2);
    }
  },
  // 🍌🐒 Chimpanzini：狂猿连击。攻击次数 = 当前能量数（≥1），打完清空能量。
  sig_chimpanzini_frenzy: (ctx) => {
    const t = first(ctx);
    if (!t) return;
    const hits = Math.max(1, ctx.actor.energy);
    ctx.actor.energy = 0;
    ctx.emit({ t: 'buff', who: ref(ctx.actor), note: `狂猿连击！连打 ${hits} 次`, noteEn: `Ape frenzy! ${hits} strikes in a row` });
    for (let i = 0; i < hits; i++) {
      if (t.hp <= 0 || t.downed || t.dead) break;
      const before = t.hp;
      ctx.attack(t, { extraHitBonus: 2 }); // 平衡补丁：狂暴更准（每击 +2 命中），提高每点能量的转化率
      // 平衡补丁：渐入佳境——第 i 击命中后追加 i−1 点 flat 伤害（越打越疯；3 能量 +3、5 能量 +10）。
      // flat 伤害不走命中/减伤（与被动 dealFlatDamage 同约定），给它头部角色同款的 flat 词条。
      if (i > 0 && t.hp < before && t.hp > 0 && !t.dead) {
        const dealt = Math.min(i, t.hp);
        t.hp -= dealt;
        ctx.emit({ t: 'damage', to: { team: t.team, id: t.id }, roll: { spec: '狂暴', rolls: [dealt], bonus: 0, total: dealt }, mitigated: 0, dealt, hpLeft: t.hp });
      }
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
