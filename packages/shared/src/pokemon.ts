/**
 * 精灵属性模型 —— v2：废除"类型"，改 D&D 风属性点。
 *
 * 每只精灵有 STR/DEX/CON 三属性，1 级有不同的"天赋起点"（总和固定 39，分布不同），
 * 之后玩家升级自由加点、可洗点。战斗数值（AC/命中/HP）由属性派生。
 *
 * 见 DND_COMBAT.md 设计表 v2。
 */
import type { SkillId } from './skills.js';

/** 三核心属性。 */
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
/** 1 级天赋三属性总和（所有精灵相同，保证公平）。 */
export const STARTING_TOTAL = 39;

/** 占位美术用色：无贴图阶段按"最高属性"给个主题色。 */
export const ABILITY_COLOR: Record<AbilityKey, string> = {
  str: '#e0533d', // 红
  dex: '#f0c33c', // 黄
  con: '#4a9d5b', // 绿
};

/** 12 只精灵的天赋起点。总和均为 39，分布呼应原版类型定位。 */
export const SPECIES_TALENT: Record<string, Abilities> = {
  Hitmonlee: { str: 16, dex: 13, con: 10 }, // 极致力量
  Charmander: { str: 15, dex: 14, con: 10 }, // 力量偏敏
  Squirtle: { str: 15, dex: 10, con: 14 }, // 力量偏肉
  Muk: { str: 11, dex: 8, con: 20 }, // 极致体质
  Licktung: { str: 12, dex: 11, con: 16 }, // 肉盾偏均
  Krabby: { str: 14, dex: 9, con: 16 }, // 肉盾偏攻
  Onix: { str: 13, dex: 10, con: 16 }, // 防御
  Geodude: { str: 14, dex: 11, con: 14 }, // 防御偏攻
  Shellder: { str: 11, dex: 12, con: 16 }, // 防御偏敏
  Pikachu: { str: 12, dex: 17, con: 10 }, // 极致敏捷
  Pidgeotto: { str: 13, dex: 16, con: 10 }, // 敏捷偏攻
  Bulbasaur: { str: 11, dex: 15, con: 13 }, // 敏捷偏肉
};

export const SPECIES_NAMES = Object.keys(SPECIES_TALENT);

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
  maxSlots: number; // 法术位（整场可施放大招的次数）= 1 + floor(level/4)
  lifestealRate: number; // 吸血比例（0~0.25）= max(0, CON_mod) * 5%
  strMod: number;
  dexMod: number;
  conMod: number;
  pro: number;
}

/** 由"具体属性 + 等级"派生战斗数值（不依赖 species，属性已是分配后的结果）。 */
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
    maxSlots: 1 + Math.floor(lvl / 4),
    lifestealRate: Math.max(0, conMod) * 0.05,
    strMod,
    dexMod,
    conMod,
    pro,
  };
}

/** 一只精灵的可序列化实例（存库 / 上线传输 / 战斗输入）。 */
export interface PokemonInstance {
  species: string;
  level: number;
  exp: number;
  /** 当前属性 = 天赋 + 已分配点（已合并好的最终值）。 */
  abilities: Abilities;
  /** 已学技能 id 列表（见 skills.ts）。 */
  skills: SkillId[];
}

/** 用天赋起点 new 一只 1 级精灵（未加点、未学技能）。 */
export function newPokemon(species: string): PokemonInstance {
  const talent = SPECIES_TALENT[species];
  if (!talent) throw new Error(`Unknown species: ${species}`);
  return {
    species,
    level: 1,
    exp: 0,
    abilities: { ...talent },
    skills: [],
  };
}

/** 取一只精灵的派生战斗数值。 */
export function statsOf(p: PokemonInstance): DerivedStats {
  return deriveStats(p.abilities, p.level);
}

/** 占位美术主题色：取最高的核心属性。 */
export function themeColor(ab: Abilities): string {
  const entries: [AbilityKey, number][] = [
    ['str', ab.str],
    ['dex', ab.dex],
    ['con', ab.con],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return ABILITY_COLOR[entries[0]![0]];
}

/** 升级所需经验阈值（沿用原版 5*level 的温和曲线）。 */
export const expToLevelUp = (level: number): number => 5 * level;
/** 击败 level 级精灵获得经验（沿用原版 10*level）。 */
export const expGainFor = (level: number): number => 10 * level;
