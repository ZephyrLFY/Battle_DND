/**
 * 技能池静态定义 —— 8 个技能（小而精）。
 *
 * 这里只放"技能是什么"（id/名字/CD/描述/类别）。技能的战斗中效果结算
 * 在 battle.ts 的伤害管线里集中实现（按 id 分派），避免与战斗状态循环依赖。
 *
 * 设计原则（见 DND_COMBAT.md v2 第四节）：技能不绑属性，任何 build 都能学；
 * 但效果吃属性（如生命汲取吃 CON、重击吃 STR 伤害调整），所以 build 影响技能强度。
 */

export type SkillId =
  | 'brave_strike'
  | 'stone_skin'
  | 'stun_strike'
  | 'flurry'
  | 'charge_smash'
  | 'precise_aim'
  | 'shield_block';

/** 技能在战斗中的行为类别（影响"放技能这一步该怎么走"）。 */
export type SkillCategory =
  | 'attack' // 立即发起一次（强化的）攻击
  | 'multi_attack' // 本回合多次攻击
  | 'defense' // 防御姿态，不攻击
  | 'charge'; // 蓄力，本回合不动，强化下回合

export interface SkillDef {
  id: SkillId;
  name: string;
  category: SkillCategory;
  /**
   * 法术位消耗（BG3 风长线资源）。
   * 0 = 戏法/小技能，可无限放；1 = 法术/大招，消耗 1 个整场不回的法术位。
   */
  cost: 0 | 1;
  desc: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  // ── 法术（消耗 1 法术位）──
  brave_strike: {
    id: 'brave_strike',
    name: '英勇打击',
    category: 'attack',
    cost: 1,
    desc: '本次攻击伤害骰 1d6→2d6，命中 +2。',
  },
  stun_strike: {
    id: 'stun_strike',
    name: '眩晕突袭',
    category: 'attack',
    cost: 1,
    desc: '攻击命中后，对方体质豁免(1d20+CON)<13 则下回合昏迷。',
  },
  flurry: {
    id: 'flurry',
    name: '疾风连击',
    category: 'multi_attack',
    cost: 1,
    desc: '本回合攻击 2 次（各自独立命中/伤害骰）。',
  },
  charge_smash: {
    id: 'charge_smash',
    name: '蓄力重击',
    category: 'charge',
    cost: 1,
    desc: '本回合不动，下回合攻击伤害骰 1d6→3d6 且必命中。',
  },
  // ── 戏法（无消耗）──
  precise_aim: {
    id: 'precise_aim',
    name: '精准瞄准',
    category: 'attack',
    cost: 0,
    desc: '本次攻击以优势掷命中（2d20 取高），更易暴击。',
  },
  shield_block: {
    id: 'shield_block',
    name: '护盾格挡',
    category: 'defense',
    cost: 0,
    desc: '本回合 AC +5，并反弹 1d4 伤害给攻击者。',
  },
  stone_skin: {
    id: 'stone_skin',
    name: '石化表皮',
    category: 'defense',
    cost: 0,
    desc: '接下来 2 回合受到的伤害减少 1d6（掷一次定减免量）。',
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
