/**
 * 角色实例与战斗数值派生 —— 中性命名（去 Pokemon 化）。
 *
 * 一个 Combatant 是"某个角色原型 + 等级 + 已分配属性 + 已学技能"的可序列化实例。
 * 战斗数值（AC/命中/HP/法术位/吸血）由属性 + 等级派生（D&D 5e 风）。
 *
 * 角色的静态数据（名字/天赋）在 roster.ts；本文件只管"实例是什么、数值怎么算"。
 */
import { archetype, type Archetype } from './roster.js';
import type { SkillId } from './skills.js';

/** 三核心属性（D&D 精简版）。 */
export interface Abilities {
  str: number;
  dex: number;
  con: number;
}

export const ABILITY_KEYS = ['str', 'dex', 'con'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: '力量',
  dex: '敏捷',
  con: '体质',
};

export const MAX_LEVEL = 15;
export const MAX_ABILITY = 20;
/** 每升一级获得的可分配属性点。 */
export const POINTS_PER_LEVEL = 2;

/** 5e 调整值：floor((属性 - 10) / 2)。 */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** 熟练加值随等级（5e 曲线）。 */
export function proficiency(level: number): number {
  const l = clampLevel(level);
  if (l <= 4) return 2;
  if (l <= 8) return 3;
  if (l <= 12) return 4;
  return 5;
}

export function clampLevel(level: number): number {
  return level < 1 ? 1 : level > MAX_LEVEL ? MAX_LEVEL : Math.floor(level);
}

/** 派生战斗数值。 */
export interface DerivedStats {
  ac: number; // 护甲值 = 10 + DEX_mod
  toHit: number; // 命中调整 = STR_mod + PRO
  dmgBonus: number; // 伤害调整 = STR_mod
  maxHp: number; // (8 + CON_mod) * level，下限每级至少 1
  initiative: number; // 先攻调整 = DEX_mod
  maxEnergy: number; // 能量上限（从 0 起、普攻 +1、技能消耗）= 3 + floor(level/4)
  lifestealRate: number; // 吸血比例（0~0.25）= max(0, CON_mod) * 5%
  strMod: number;
  dexMod: number;
  conMod: number;
  pro: number;
}

/** 由"具体属性 + 等级"派生战斗数值。 */
export function deriveStats(ab: Abilities, level: number): DerivedStats {
  const lvl = clampLevel(level);
  const strMod = abilityMod(ab.str);
  const dexMod = abilityMod(ab.dex);
  const conMod = abilityMod(ab.con);
  const pro = proficiency(lvl);
  const perLevelHp = Math.max(1, 8 + conMod);
  return {
    ac: 10 + dexMod,
    toHit: strMod + pro,
    dmgBonus: strMod,
    maxHp: perLevelHp * lvl,
    initiative: dexMod,
    maxEnergy: 3 + Math.floor(lvl / 4),
    lifestealRate: Math.max(0, conMod) * 0.05,
    strMod,
    dexMod,
    conMod,
    pro,
  };
}

/**
 * 一个角色实例（可序列化：存库 / 上线传输 / 战斗输入）。
 *
 * 属性分两段存：天赋（来自 roster，不存）+ 玩家分配的 allocations（存）。
 * 当前属性 = abilitiesOf(c) = 天赋 + allocations。这样存档稳健、洗点干净
 * （清空 allocations 即可，不依赖"当前−天赋"反推），天赋表调整也不影响已分配点。
 */
export interface Combatant {
  /** 指向 roster 的角色原型 id。 */
  archetypeId: string;
  level: number;
  exp: number;
  /** 玩家往三属性各加的点（默认全 0）。最终属性 = 天赋 + 此项。 */
  allocations: Abilities;
  /** 已学技能 id 列表（见 skills.ts）。 */
  skills: SkillId[];
}

const ZERO_ALLOC: Abilities = { str: 0, dex: 0, con: 0 };

/** 用天赋起点 new 一个 1 级角色（未加点、未学技能）。 */
export function newCombatant(archetypeId: string): Combatant {
  archetype(archetypeId); // 校验存在
  return {
    archetypeId,
    level: 1,
    exp: 0,
    allocations: { ...ZERO_ALLOC },
    skills: [],
  };
}

/** 当前属性 = 天赋 + 已分配点。 */
export function abilitiesOf(c: Combatant): Abilities {
  const t: Archetype = archetype(c.archetypeId);
  return {
    str: t.talent.str + c.allocations.str,
    dex: t.talent.dex + c.allocations.dex,
    con: t.talent.con + c.allocations.con,
  };
}

/** 取一个角色的派生战斗数值。 */
export function statsOf(c: Combatant): DerivedStats {
  return deriveStats(abilitiesOf(c), c.level);
}

/** 取角色展示名（便捷转发）。 */
export function nameOf(c: Combatant): string {
  return archetype(c.archetypeId).name;
}

/** 升级所需经验阈值（沿用原版 5*level 的温和曲线）。 */
export const expToLevelUp = (level: number): number => 5 * level;
/** 击败 level 级角色获得经验（沿用原版 10*level）。 */
export const expGainFor = (level: number): number => 10 * level;
