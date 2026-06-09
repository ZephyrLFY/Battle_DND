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
  | 'war_cry'
  // 角色签名技能（每个 archetype 专属，只有本角色能学，占技能栏）
  | 'sig_tung_combo'
  | 'sig_bombombini_blast'
  | 'sig_trippi_hiss'
  | 'sig_lirili_timestop'
  | 'sig_cappuccino_behead'
  | 'sig_ballerina_waltz'
  | 'sig_bombardiro_carpet'
  | 'sig_patapim_vines'
  | 'sig_boneca_ram'
  | 'sig_frigo_iceshield'
  | 'sig_tralalero_dash'
  | 'sig_chimpanzini_frenzy';

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

/** 技能栏上限：一个角色最多装备的技能数。 */
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

  // ── 角色签名技能（专属，占技能栏；只有对应 archetype 能学）──
  sig_tung_combo: {
    id: 'sig_tung_combo',
    name: 'Tung-Tung-Tung 连敲',
    category: 'multi_attack',
    targetType: 'one_enemy',
    cost: 3,
    unlockLevel: 6,
    desc: '【Tung 专属】一回合连敲 3 次，每次命中递减 −2（第 1 击 +0、第 2 击 −2、第 3 击 −4）。',
  },
  sig_bombombini_blast: {
    id: 'sig_bombombini_blast',
    name: '自爆冲锋',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '【Bombombini 专属】对单体造成 4d6 伤害，自身受到当前生命 1/4 的反噬。配合「引信」层数威力暴涨。',
  },
  sig_trippi_hiss: {
    id: 'sig_trippi_hiss',
    name: '哈气',
    category: 'support',
    targetType: 'one_enemy',
    cost: 1,
    unlockLevel: 3,
    desc: '【Trippi 专属】猫式威吓：令一个敌人下回合命中 −4。',
  },
  sig_lirili_timestop: {
    id: 'sig_lirili_timestop',
    name: '时间静止',
    category: 'support',
    targetType: 'self',
    cost: 3,
    unlockLevel: 6,
    desc: '【Lirilì 专属】静止时间：本回合不行动，但下个属于自己的回合连续行动 2 次。',
  },
  sig_cappuccino_behead: {
    id: 'sig_cappuccino_behead',
    name: '斩首一击',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '【Cappuccino 专属】必中的处决斩；目标生命低于 25% 时伤害骰翻倍。',
  },
  sig_ballerina_waltz: {
    id: 'sig_ballerina_waltz',
    name: '华尔兹号令',
    category: 'support',
    targetType: 'all_allies',
    cost: 2,
    unlockLevel: 6,
    desc: '【Ballerina 专属】优雅起舞：全体友方下回合命中 +2 且 AC +1。',
  },
  sig_bombardiro_carpet: {
    id: 'sig_bombardiro_carpet',
    name: '地毯式轰炸',
    category: 'aoe',
    targetType: 'all_enemies',
    cost: 3,
    unlockLevel: 8,
    desc: '【Bombardiro 专属】对全体敌方各 2d6 轰炸；每个目标体质豁免失败则被震慑（昏迷）。',
  },
  sig_patapim_vines: {
    id: 'sig_patapim_vines',
    name: '藤蔓缠绕',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '【Patapim 专属】攻击命中并令目标定身：体质豁免失败则下回合昏迷。',
  },
  sig_boneca_ram: {
    id: 'sig_boneca_ram',
    name: '轮胎冲撞',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '【Boneca 专属】必中的高伤冲撞；命中后撞退目标，使其下回合命中 −3。',
  },
  sig_frigo_iceshield: {
    id: 'sig_frigo_iceshield',
    name: '冰封护盾',
    category: 'defense',
    targetType: 'self',
    cost: 2,
    unlockLevel: 6,
    desc: '【Frigo 专属】本回合 AC +3，并在接下来 2 回合免疫控制（眩晕/定身/哈气）。',
  },
  sig_tralalero_dash: {
    id: 'sig_tralalero_dash',
    name: '疾游连斩',
    category: 'multi_attack',
    targetType: 'one_enemy',
    cost: 2,
    unlockLevel: 6,
    desc: '【Tralalero 专属】疾游 2 次攻击；每次命中后本回合 AC +1（打得越多越灵活）。',
  },
  sig_chimpanzini_frenzy: {
    id: 'sig_chimpanzini_frenzy',
    name: '狂猿连击',
    category: 'multi_attack',
    targetType: 'one_enemy',
    cost: 0,
    unlockLevel: 3,
    desc: '【Chimpanzini 专属】攻击次数 = 当前能量数（≥1 次）；打完清空全部能量。',
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
