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
  | 'feint'
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
   * 能量消耗，分阶 0/1/2/3。0 = 不耗能（随时可放）；1/2/3 = 低/中/高阶，越强耗能越多。
   */
  cost: 0 | 1 | 2 | 3;
  /** 解锁等级：达到此等级才能学这个技能。 */
  unlockLevel: number;
  desc: string;
}

/** 技能栏上限：一个角色最多装备的技能数。 */
export const MAX_EQUIPPED_SKILLS = 4;

export const SKILLS: Record<SkillId, SkillDef> = {
  // ── 不耗能技能（Lv1 解锁，cost 0，随时可放）──
  feint: {
    id: 'feint',
    name: '佯攻',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 0,
    unlockLevel: 1,
    desc: '一次小伤害（1d4）并撕开对方防御：目标接下来 1 回合 AC −2（给队友铺路）。',
  },
  precise_aim: {
    id: 'precise_aim',
    name: '精准瞄准',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 0,
    unlockLevel: 1,
    desc: '本次攻击以优势掷命中（2d20 取高），更易暴击；但本回合命中不攒能量（不耗能的代价）。',
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
    desc: '本回合 AC +3，反弹 1 点伤害给下一次攻击者，并回复 2 点能量（防御转资源）。',
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
    desc: '全体友方接下来 1 回合内攻击命中 +2 且伤害 +2。',
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
    desc: '【Bombombini 专属】对单体造成 4d6 必中伤害，自身受到实际造成伤害 3/4 的反噬。配合「引信」层数威力暴涨（反噬也随之上涨）。',
  },
  sig_trippi_hiss: {
    id: 'sig_trippi_hiss',
    name: '哈气',
    category: 'support',
    targetType: 'one_enemy',
    cost: 0, // 平衡补丁：1→0。猫哈气不要钱——免费 tempo 工具（原 EV 低于普攻，sim 使用率≈0）。
    unlockLevel: 3,
    desc: '【Trippi 专属】猫式威吓（不耗能）：抓一爪（1d4）并令一个敌人接下来 2 回合命中 −4。',
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
    desc: '【Ballerina 专属】优雅起舞：全体友方下回合命中 +2、AC +1 且伤害 +4（含基础鼓舞 +2 与舞步强化 +2）。', // 平衡补丁：附带伤害增益
  },
  sig_bombardiro_carpet: {
    id: 'sig_bombardiro_carpet',
    name: '地毯式轰炸',
    category: 'aoe',
    targetType: 'all_enemies',
    cost: 3,
    unlockLevel: 8,
    desc: '【Bombardiro 专属】对全体敌方各 2d6 轰炸；每个目标体质豁免（DC 11）失败则被震慑（昏迷）。',
  },
  sig_patapim_vines: {
    id: 'sig_patapim_vines',
    name: '藤蔓缠绕',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 1, // 平衡补丁：2→1。原成本下定身 EV 抵不过能量机会成本（sim 使用率≈0）。
    unlockLevel: 6,
    desc: '【Patapim 专属】攻击命中并令目标定身：体质豁免失败则下回合昏迷。',
  },
  sig_boneca_ram: {
    id: 'sig_boneca_ram',
    name: '轮胎冲撞',
    category: 'attack',
    targetType: 'one_enemy',
    cost: 3,
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
    desc: '【Frigo 专属】接下来 3 回合 AC +3 并免疫控制（眩晕/定身/哈气）。', // 平衡补丁二轮：持续 2→3 回合
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
    desc: '【Chimpanzini 专属】攻击次数 = 当前能量数（≥1 次），每击命中 +2，且第 N 击命中追加 N−1 点伤害（越打越疯）；打完清空全部能量。', // 平衡补丁：+2 命中 + 渐入佳境 flat 伤害
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
