/**
 * 角色名册 —— 可替换的角色数据表。
 *
 * 这是"换皮"的关键：逻辑层只认 archetypeId（一个字符串 key），
 * 具体角色的名字 + 天赋属性都在这张表里。要换主题（宝可梦 → 别的角色），
 * 只改这张表，引擎/战斗/养成一行不动。
 *
 * 当前主题：原版 12 只宝可梦（沿用名字，但概念上已是中性的 archetype）。
 */
import type { Abilities } from './combatant.js';

/** 一个角色原型的静态定义。 */
export interface Archetype {
  /** 逻辑层引用的唯一 id（当前用宝可梦名，换皮时改这张表即可）。 */
  id: string;
  /** 展示名（可与 id 不同；换皮时改这里）。 */
  name: string;
  /** 1 级天赋属性（三项总和固定 = STARTING_TOTAL，保证公平）。 */
  talent: Abilities;
}

/** 1 级天赋三属性总和（所有角色相同，分布不同）。 */
export const STARTING_TOTAL = 39;

/**
 * 12 个角色原型。总和均 39，分布呼应原版"力量/肉盾/防御/敏捷"定位。
 * 换皮 = 改这张表的 id/name（talent 可保留，逻辑不变）。
 */
export const ROSTER: Record<string, Archetype> = {
  Hitmonlee: { id: 'Hitmonlee', name: 'Hitmonlee', talent: { str: 16, dex: 13, con: 10 } },
  Charmander: { id: 'Charmander', name: 'Charmander', talent: { str: 15, dex: 14, con: 10 } },
  Squirtle: { id: 'Squirtle', name: 'Squirtle', talent: { str: 15, dex: 10, con: 14 } },
  Muk: { id: 'Muk', name: 'Muk', talent: { str: 11, dex: 8, con: 20 } },
  Licktung: { id: 'Licktung', name: 'Licktung', talent: { str: 12, dex: 11, con: 16 } },
  Krabby: { id: 'Krabby', name: 'Krabby', talent: { str: 14, dex: 9, con: 16 } },
  Onix: { id: 'Onix', name: 'Onix', talent: { str: 13, dex: 10, con: 16 } },
  Geodude: { id: 'Geodude', name: 'Geodude', talent: { str: 14, dex: 11, con: 14 } },
  Shellder: { id: 'Shellder', name: 'Shellder', talent: { str: 11, dex: 12, con: 16 } },
  Pikachu: { id: 'Pikachu', name: 'Pikachu', talent: { str: 12, dex: 17, con: 10 } },
  Pidgeotto: { id: 'Pidgeotto', name: 'Pidgeotto', talent: { str: 13, dex: 16, con: 10 } },
  Bulbasaur: { id: 'Bulbasaur', name: 'Bulbasaur', talent: { str: 11, dex: 15, con: 13 } },
};

/** 所有角色 id。 */
export const ARCHETYPE_IDS = Object.keys(ROSTER);

export function archetype(id: string): Archetype {
  const a = ROSTER[id];
  if (!a) throw new Error(`Unknown archetype: ${id}`);
  return a;
}

/** 取角色展示名（UI 用）。 */
export function archetypeName(id: string): string {
  return archetype(id).name;
}
