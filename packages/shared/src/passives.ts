/**
 * 角色被动插件 —— 每个 archetype 一个 Passive，注册到表里。
 *
 * 引擎（battle.ts）在固定钩子点（回合开始 / 命中 / 受击 / 将倒地 / 友方放 support）
 * 调本文件的薄分发层；加被动 = 在这里加一条注册项 + 写它的 handler，**不碰引擎核心**。
 *
 * 约定：
 * - 被动私有计数/标志存在 FighterRT.passiveState 这个通用袋里，键按 archetype 命名空间。
 * - 被动掷骰一律走 ctx.rng（引擎单一游标）→ 确定性。
 * - 被动造成的额外伤害走 dealFlatDamage（直接扣血 + emit），**绝不回调 doAttack**（避免递归）。
 * - 三个 modify* 是读时纯函数：无副作用、不写 passiveState。
 */
import { roll } from './dice.js';
import type { Passive, PassiveCtx, FighterRT } from './battleTypes.js';

// ─── passiveState 访问器（在弱类型 string-key 上补一层安全/便利）───

export function getStack(f: FighterRT, key: string): number {
  return f.passiveState[key] ?? 0;
}
export function setStack(f: FighterRT, key: string, n: number): void {
  f.passiveState[key] = n;
}
export function bumpStack(f: FighterRT, key: string, delta = 1): number {
  const n = getStack(f, key) + delta;
  f.passiveState[key] = n;
  return n;
}
export function clearStack(f: FighterRT, key: string): void {
  delete f.passiveState[key];
}

/** 引擎在每次成功行动后写的通用标志（供「上回合是否行动」类被动读）。 */
export const ACTED_KEY = '__acted';
/** 引擎跟踪「本回合是否已普攻」（供首击必中类被动，如 Tralalero）。 */
export const BASIC_DONE_KEY = '__basicDone';

// ─── 被动造成的扁平伤害（不走命中判定、不回调 doAttack）───

/** 直接对 target 造成 amount 点伤害（无视命中/AC），扣血并 emit damage 事件。 */
export function dealFlatDamage(ctx: PassiveCtx, target: FighterRT, amount: number, spec = 'passive'): void {
  if (target.dead || amount <= 0) return;
  const dealt = Math.max(0, Math.floor(amount));
  target.hp = Math.max(0, target.hp - dealt);
  ctx.emit({
    t: 'damage',
    to: { team: target.team, id: target.id },
    roll: { spec, rolls: [dealt], bonus: 0, total: dealt },
    mitigated: 0,
    dealt,
    hpLeft: target.hp,
  });
}

const ref = (f: FighterRT) => ({ team: f.team, id: f.id });

/** 目标是否免疫控制（冰封护盾等）。控制类技能施加前应先检查。 */
export function isControlImmune(f: FighterRT): boolean {
  return f.controlImmuneTurns > 0;
}

/** 某 archetype 是否在指定队伍中存活（未彻底死亡）。用于团队联动被动（CA↔BC）。 */
function teammateAlive(ctx: PassiveCtx, team: 'a' | 'b', archetypeId: string): boolean {
  return ctx.state.teams[team].some((f) => f.archetypeId === archetypeId && !f.dead);
}
/** 某 archetype 是否在指定队伍中存在但已彻底死亡。 */
function teammateDead(ctx: PassiveCtx, team: 'a' | 'b', archetypeId: string): boolean {
  return ctx.state.teams[team].some((f) => f.archetypeId === archetypeId && f.dead);
}

// ─────────────────────────────────────────────────────────────────────────
// 被动注册表
// ─────────────────────────────────────────────────────────────────────────

/** Tung 叠击层数上限。平衡补丁：5→3（flat 叠伤在 1d6 伤害尺度上过强，压缩头部）。 */
const TUNG_STACK_CAP = 3;

export const PASSIVES: Record<string, Passive> = {
  // 🥖 Tung Tung Tung Sahur ——「不眠的梆子」
  // 普攻/技能命中造成伤害时，先按已叠层数追加等量扁平伤害，再叠 1 层；
  // 一整回合没有行动则清空层数（连续敲打才积累）。
  TungSahur: {
    onDealDamage: (ctx, target, _raw, _crit) => {
      const stacks = getStack(ctx.self, 'tung.hits');
      if (stacks > 0) {
        dealFlatDamage(ctx, target, stacks, '敲击');
        ctx.emit({ t: 'buff', who: ref(ctx.self), note: `敲击 ${stacks} 层追加伤害`, noteEn: `Knock ×${stacks} bonus damage` });
      }
      // 叠击上限 5：封住中后期"一棒十几点"的滚雪球天花板。
      if (stacks < TUNG_STACK_CAP) bumpStack(ctx.self, 'tung.hits', 1);
    },
    onTurnStart: (ctx) => {
      // 上一整回合没出手 → 清空敲击层数。__acted 由引擎在行动后置 1、回合开始读后清 0。
      const acted = getStack(ctx.self, ACTED_KEY);
      if (acted === 0 && getStack(ctx.self, 'tung.hits') > 0) {
        clearStack(ctx.self, 'tung.hits');
        ctx.emit({ t: 'buff', who: ref(ctx.self), note: '一回合未出手，敲击层数清空', noteEn: 'Idle for a turn — knock stacks reset' });
      }
    },
  },

  // 🦢💣 Bombombini Gusini ——「引信」
  // 每次受击叠 1 层火药；耗能技能(fromSpell)命中时按层数追加扁平伤害；释放任意耗能技能后清空层数。
  BombombiniGusini: {
    onTakeHit: (ctx) => {
      bumpStack(ctx.self, 'bombombini.gunpowder', 1);
    },
    onDealDamage: (ctx, target, _raw, _crit, fromSpell) => {
      if (!fromSpell) return; // 普攻不吃加成
      const stacks = getStack(ctx.self, 'bombombini.gunpowder');
      if (stacks > 0) {
        dealFlatDamage(ctx, target, stacks * 2, '火药'); // 每层 +2 法术伤害
        ctx.emit({ t: 'buff', who: ref(ctx.self), note: `引信 ${stacks} 层引爆，追加伤害`, noteEn: `Fuse ×${stacks} detonated — bonus damage` });
      }
    },
    onCastSpell: (ctx) => {
      // 任意耗能技能释放后引爆：清空火药层数（不只签名技能）。
      if (getStack(ctx.self, 'bombombini.gunpowder') > 0) clearStack(ctx.self, 'bombombini.gunpowder');
    },
  },

  // 🐸 Trippi Troppi ——「九命怪猫」
  // 首次将被打至倒地时不倒，改以 15% maxHp 存活并清除负面状态（整场仅一次）。
  TrippiTroppi: {
    onWouldGoDown: (ctx) => {
      if (getStack(ctx.self, 'trippi.ninthUsed') > 0) return false; // 已用过 → 正常倒地
      setStack(ctx.self, 'trippi.ninthUsed', 1);
      // 平衡补丁：1 HP → 25% → 15% maxHp（三轮：哈气改为命中即眩晕后，被动让位补偿）
      ctx.self.hp = Math.max(1, Math.floor(ctx.self.stats.maxHp * 0.15));
      ctx.self.stunned = 0;
      ctx.self.hitPenaltyTurns = 0;
      ctx.self.hitPenaltyAmt = 0;
      ctx.emit({ t: 'buff', who: ref(ctx.self), note: `九命怪猫！以 ${ctx.self.hp} HP 起死回生，清除负面`, noteEn: `Nine lives! Back up at ${ctx.self.hp} HP, debuffs cleared` });
      // 濒死反扑（炸毛）：固定总伤害由全体存活敌人分摊 → 1v1 全砸一人(爆发足)、3v3 摊薄(不群秒)。
      const enemyTeam = ctx.self.team === 'a' ? 'b' : 'a';
      const targets = ctx.state.teams[enemyTeam].filter((e) => !e.dead && !e.downed);
      if (targets.length > 0) {
        const each = Math.floor(12 / targets.length);
        for (const e of targets) dealFlatDamage(ctx, e, each, '炸毛反扑');
      }
      return true;
    },
  },

  // 🌵🐘 Lirilì Larilà ——「仙人掌尖刺」
  // 常驻反伤：被命中时反弹固定伤害给攻击者。
  LiriliLarila: {
    onTakeHit: (ctx, attacker) => {
      if (attacker.dead || attacker.downed) return;
      dealFlatDamage(ctx, attacker, 1, '尖刺');
      ctx.emit({ t: 'buff', who: ref(ctx.self), note: '仙人掌尖刺反弹伤害', noteEn: 'Cactus spikes reflect damage' });
    },
  },

  // ☕ Cappuccino Assassino ——「咖啡与舞伴」（↔ Ballerina 联动）
  // BC 存活时自身全战斗属性 ×1.3、BC 阵亡时 ×1.5；攻击敌方 BC 时自身伤害 ×0.9；
  // 受到的治疗/增益在 BC 存活时增强（modifyIncomingHeal）。
  // 平衡补丁：1.1/1.3 → 1.3/1.5。pair 专项实测旧数值下 CA+BC 同队收益 −4pt（反协同）。
  CappuccinoAssassino: {
    modifyStats: (base, ctx) => {
      const mult = teammateDead(ctx, ctx.self.team, 'BallerinaCappuccina')
        ? 1.5
        : teammateAlive(ctx, ctx.self.team, 'BallerinaCappuccina')
          ? 1.3
          : 1;
      if (mult === 1) return base;
      return {
        ...base,
        toHit: Math.round(base.toHit * mult),
        dmgBonus: Math.round(base.dmgBonus * mult),
        ac: Math.round(base.ac * mult),
      };
    },
    modifyOutgoingDamage: (_ctx, target, raw) => {
      return target.archetypeId === 'BallerinaCappuccina' ? Math.floor(raw * 0.9) : raw;
    },
    modifyIncomingHeal: (ctx, _source, amount) => {
      // BC 存活时，舞伴给 CA 的治疗/增益增强 +50%。
      return teammateAlive(ctx, ctx.self.team, 'BallerinaCappuccina') ? Math.floor(amount * 1.5) : amount;
    },
  },

  // 🐊 Bombardiro Crocodilo ——「装甲蒙皮」：常驻减伤 1。
  // 平衡补丁：2→1。flat −2 在 1d6 伤害尺度 ≈25-35% 免伤且对多段攻击每段各减，双榜第一的根因。
  BombardiroCrocodilo: {
    modifyIncomingDamage: (_ctx, _attacker, raw) => Math.max(0, raw - 1),
  },

  // 🌳 Brr Brr Patapim ——「林间回响」
  // 任意友方释放 support 技能时，Patapim 免费给该友方回 1d4（森林的回声）。
  BrrBrrPatapim: {
    onAllySupport: (ctx, ally) => {
      if (ally.dead || ally.downed) return;
      const r = roll(ctx.rng, '1d4');
      const before = ally.hp;
      ally.hp = Math.min(ally.stats.maxHp, ally.hp + r.total);
      if (ally.hp > before) {
        ctx.emit({ t: 'heal', who: ref(ally), roll: r, amount: ally.hp - before, hpLeft: ally.hp });
        ctx.emit({ t: 'buff', who: ref(ctx.self), note: `林间回响：为 ${ally.name} 回复 ${ally.hp - before}`, noteEn: `Forest echo: heals ${ally.name} for ${ally.hp - before}` });
      }
    },
  },

  // 🐸🛞 Boneca Ambalabu ——「轮胎滚压」：普攻暴击时额外一段碾压伤害。
  BonecaAmbalabu: {
    onDealDamage: (ctx, target, raw, crit) => {
      if (!crit) return;
      dealFlatDamage(ctx, target, Math.max(2, Math.floor(raw / 2)), '碾压');
      ctx.emit({ t: 'buff', who: ref(ctx.self), note: '轮胎滚压！暴击追加碾压伤害', noteEn: 'Tire roll! Crit deals bonus crush damage' });
    },
  },

  // 🐪🧊 Frigo Camelo ——「冷藏续航」：每回合开始回复 1d6 HP。
  // 平衡补丁：1d4→1d6（双榜垫底 27/34；1d4 在新 AI 的爆发节奏下续不动）。
  FrigoCamelo: {
    onTurnStart: (ctx) => {
      if (ctx.self.hp >= ctx.self.stats.maxHp) return;
      const r = roll(ctx.rng, '1d6');
      const before = ctx.self.hp;
      ctx.self.hp = Math.min(ctx.self.stats.maxHp, ctx.self.hp + r.total);
      if (ctx.self.hp > before) {
        ctx.emit({ t: 'heal', who: ref(ctx.self), roll: r, amount: ctx.self.hp - before, hpLeft: ctx.self.hp });
      }
    },
  },

  // 🦈👟 Tralalero Tralala ——「三足疾行」：先攻加成（仍大概率先手，但不绝对）。
  TralaleroTralala: {
    initiativeBonus: 5, // +5：抢先手但高 DEX 角色仍有机会
  },

  // 🩰☕ Ballerina Cappuccina ——「为舞伴起舞」
  // 具体增强逻辑挂在 CappuccinoAssassino.modifyIncomingHeal（受益方）；此处仅作存在标记/将来扩展。
  // （BC 存活与否由 CA 被动读取，无需 BC 侧主动钩子。）

  // 🍌🐒 Chimpanzini Bananini ——「香蕉外壳」
  // 受击致 HP 跌破 75%/50%/25% 血线时破壳：每线 +3 能量 + 本回合减伤。
  // 无「首次」限制——被治疗拉回线上后再次跌破会再次触发，
  // 由此催生「奶妈循环喂猩猩 → 反复破壳爆发」的团战 build（配合能量无上限）。
  // 注：只看「这一击是否跨线」（受击前 > 线 ≥ 受击后）；灼烧等 DoT 掉血不触发（不算受击）。
  ChimpanziniBananini: {
    onTakeHit: (ctx, _attacker, raw) => {
      if (ctx.self.dead || ctx.self.downed) return;
      const max = ctx.self.stats.maxHp;
      const before = (ctx.self.hp + raw) / max; // onTakeHit 的 raw = 实际扣血量 → 反推受击前
      const after = ctx.self.hp / max;
      const lines = [0.75, 0.5, 0.25];
      const fired = lines.filter((line) => before > line && after <= line).length;
      if (fired > 0) {
        const gain = fired * 3; // 每条线 +3 能量
        ctx.self.energy += gain;
        ctx.self.stoneTurns = Math.max(ctx.self.stoneTurns, 2);
        ctx.self.stoneAmount = Math.max(ctx.self.stoneAmount, 3);
        ctx.emit({ t: 'buff', who: ref(ctx.self), note: `破壳！+${gain} 能量，进入战斗形态（减伤）`, noteEn: `Shell break! +${gain} energy, battle form (damage reduction)` });
      }
    },
  },
};

/** 取某 archetype 的被动（无则 undefined）。 */
export function passiveOf(archetypeId: string): Passive | undefined {
  return PASSIVES[archetypeId];
}
