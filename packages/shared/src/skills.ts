/**
 * 技能池静态定义 —— 7 个技能（小而精）。
 *
 * 这里只放"技能是什么"（id/名字/法术位消耗/解锁等级/描述/类别）。
 * 技能的战斗中效果结算在 battle.ts 的伤害管线里集中实现（按 id 分派），
 * 避免与战斗状态循环依赖。
 *
 * 设计原则：技能不绑属性，任何 build 都能学；但效果吃属性
 * （如重击吃 STR 伤害调整），所以 build 影响技能强度。
 */

export type SkillId =
  | 'brave_strike'
  | 'stone_skin'
  | 'stun_strike'
  | 'flurry'
  | 'charge_smash'
  | 'precise_aim'
  | 'shield_block'
  // 团队技能（3v3）
  | 'heal'
  | 'revive'
  | 'firestorm'
  | 'war_cry';

/** 技能在战斗中的行为类别（影响"放技能这一步该怎么走"）。 */
export type SkillCategory =
  | 'attack' // 立即发起一次（强化的）攻击
  | 'multi_attack' // 本回合多次攻击
  | 'defense' // 防御姿态，不攻击
  | 'charge' // 蓄力，本回合不动，强化下回合
  | 'support' // 辅助：治疗/复活/增益，不攻击
  | 'aoe'; // 范围攻击

/** 技能的作用目标类型（决定 UI 怎么选目标、引擎怎么收集 targets）。 */
export type TargetType =
  | 'self' // 仅自己，无需选
  | 'one_enemy' // 单个敌方，选 1
  | 'all_enemies' // 全体敌方（AOE），自动
  | 'one_ally' // 单个友方（含倒地，治疗/复活），选 1
  | 'all_allies' // 全体友方，自动
  | 'everyone'; // 全场，自动

export interface SkillDef {
  id: SkillId;
  name: string;
  category: SkillCategory;
  /** 作用目标类型。普攻固定 one_enemy（不在此表，单独处理）。 */
  targetType: TargetType;
  /**
   * 法术位消耗（BG3 风长线资源），分阶 0/1/2/3。
   * 0 = 戏法，可无限放；1/2/3 = 低/中/高阶法术，越强消耗越多整场不回的法术位。
   */
  cost: 0 | 1 | 2 | 3;
  /** 解锁等级：达到此等级才能学这个技能。戏法均为 1。 */
  unlockLevel: number;
  desc: string;
}

/** 技能栏上限：一只精灵最多装备的技能数。 */
export const MAX_EQUIPPED_SKILLS = 4;

export const SKILLS: Record<SkillId, SkillDef> = {
  // ── 戏法（Lv1 解锁，cost 0，无限放）──
  stone_skin: {
    id: 'stone_skin',
    name: '石化表皮',
    category: 'defense',
    targetType: 'self',
    cost: 0,
    unlockLevel: 1,
    desc: '接下来 2 回合受到的伤害减少 1d6（掷一次定减免量）。',
  },
  precise_aim: {
    id: 'precise_aim',
    name: '精准瞄准',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 0,
    unlockLevel: 1,
    desc: '本次攻击以优势掷命中（2d20 取高），更易暴击。',
  },
  // ── 低阶法术（Lv3，cost 1）──
  brave_strike: {
    id: 'brave_strike',
    name: '英勇打击',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 1,
    unlockLevel: 3,
    desc: '本次攻击伤害骰 1d6→3d6，命中 +2。',
  },
  shield_block: {
    id: 'shield_block',
    name: '护盾格挡',
    category: 'defense',
    targetType: 'self',
    cost: 1,
    unlockLevel: 3,
    desc: '本回合 AC +3，并反弹 1 点伤害给下一次攻击者。',
  },
  // ── 中阶法术（Lv6/8，cost 2）──
  stun_strike: {
    id: 'stun_strike',
    name: '眩晕突袭',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '攻击命中后，对方体质豁免(1d20+CON)<13 则下回合昏迷。',
  },
  flurry: {
    id: 'flurry',
    name: '疾风连击',
    category: 'multi_attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 8,
    desc: '本回合攻击 2 次（各自独立命中/伤害骰）。',
  },
  // ── 高阶法术（Lv11，cost 3，终极一击）──
  charge_smash: {
    id: 'charge_smash',
    name: '蓄力重击',
    category: 'charge',
    targetType: 'one_enemy',
    cost: 3,
    unlockLevel: 11,
    desc: '本回合不动，下回合攻击伤害骰 1d6→4d6 且必命中。',
  },

  // ── 团队技能（3v3）──
  heal: {
    id: 'heal',
    name: '治疗术',
    category: 'support',
    targetType: 'one_ally',
    cost: 2,
    unlockLevel: 3,
    desc: '回复一个友方 2d4 + CON 调整 的生命（消耗 2 能量，不能作用于阵亡者）。',
  },
  war_cry: {
    id: 'war_cry',
    name: '战吼',
    category: 'support',
    targetType: 'all_allies',
    cost: 2,
    unlockLevel: 6,
    desc: '全体友方接下来 1 回合内攻击命中 +2。',
  },
  firestorm: {
    id: 'firestorm',
    name: '烈焰风暴',
    category: 'aoe',
    targetType: 'all_enemies',
    cost: 2,
    unlockLevel: 8,
    desc: '对全体敌方各掷命中 + 2d6 伤害（AOE）。',
  },
  revive: {
    id: 'revive',
    name: '复活术',
    category: 'support',
    targetType: 'one_ally',
    cost: 3,
    unlockLevel: 11,
    desc: '拉起一个倒地友方，回复其 1d8 生命（仅对倒地者生效）。',
  },
};

export const ALL_SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export function skillDef(id: string): SkillDef {
  const def = SKILLS[id as SkillId];
  if (!def) throw new Error(`Unknown skill: ${id}`);
  return def;
}

export function isSkillId(id: string): id is SkillId {
  return id in SKILLS;
}
