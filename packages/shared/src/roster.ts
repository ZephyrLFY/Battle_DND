/**
 * 角色名册 —— 可替换的角色数据表。
 *
 * 这是"换皮"的关键：逻辑层只认 archetypeId（一个字符串 key），
 * 具体角色的名字 + 天赋属性都在这张表里。要换主题（宝可梦 → 别的角色），
 * 只改这张表，引擎/战斗/养成一行不动。
 *
 * 当前主题：Italian Brainrot（"意大利脑腐" meme 怪物）。
 * id 为代码引用用的 PascalCase key，name 为完整意大利展示名。
 * talent 分布沿用上一版（平衡不变）。
 */
import type { Abilities } from './combatant.js';
import type { SkillId } from './skills.js';

/** 一个角色原型的静态定义。 */
export interface Archetype {
  /** 逻辑层引用的唯一 id（当前用宝可梦名，换皮时改这张表即可）。 */
  id: string;
  /** 展示名（可与 id 不同；换皮时改这里）。 */
  name: string;
  /** 1 级天赋属性（三项总和固定 = STARTING_TOTAL，保证公平）。 */
  talent: Abilities;
  /** 专属签名技能 id：只有本角色能学，占技能栏（被动天生自带、不在此）。 */
  signatureSkillId?: SkillId;
}

/** 1 级天赋三属性总和（所有角色相同，分布不同）。 */
export const STARTING_TOTAL = 39;

/**
 * 12 个角色原型。总和均 39，分布呼应"力量/肉盾/防御/敏捷"定位。
 * 换皮 = 改这张表的 id/name（talent 可保留，逻辑不变）。
 */
export const ROSTER: Record<string, Archetype> = {
  // 力量系（高 STR）
  TungSahur: { id: 'TungSahur', name: 'Tung Tung Tung Sahur', talent: { str: 16, dex: 13, con: 10 }, signatureSkillId: 'sig_tung_combo' },
  CappuccinoAssassino: { id: 'CappuccinoAssassino', name: 'Cappuccino Assassino', talent: { str: 15, dex: 14, con: 10 }, signatureSkillId: 'sig_cappuccino_behead' },
  BombardiroCrocodilo: { id: 'BombardiroCrocodilo', name: 'Bombardiro Crocodilo', talent: { str: 15, dex: 10, con: 14 }, signatureSkillId: 'sig_bombardiro_carpet' },
  // 肉盾 / 防御系（高 CON）
  LiriliLarila: { id: 'LiriliLarila', name: 'Lirilì Larilà', talent: { str: 11, dex: 8, con: 20 }, signatureSkillId: 'sig_lirili_timestop' },
  BrrBrrPatapim: { id: 'BrrBrrPatapim', name: 'Brr Brr Patapim', talent: { str: 12, dex: 11, con: 16 }, signatureSkillId: 'sig_patapim_vines' },
  BombombiniGusini: { id: 'BombombiniGusini', name: 'Bombombini Gusini', talent: { str: 14, dex: 9, con: 16 }, signatureSkillId: 'sig_bombombini_blast' },
  TrippiTroppi: { id: 'TrippiTroppi', name: 'Trippi Troppi', talent: { str: 13, dex: 10, con: 16 }, signatureSkillId: 'sig_trippi_hiss' },
  BonecaAmbalabu: { id: 'BonecaAmbalabu', name: 'Boneca Ambalabu', talent: { str: 14, dex: 11, con: 14 }, signatureSkillId: 'sig_boneca_ram' },
  FrigoCamelo: { id: 'FrigoCamelo', name: 'Frigo Camelo', talent: { str: 11, dex: 12, con: 16 }, signatureSkillId: 'sig_frigo_iceshield' },
  // 敏捷系（高 DEX）
  TralaleroTralala: { id: 'TralaleroTralala', name: 'Tralalero Tralala', talent: { str: 12, dex: 17, con: 10 }, signatureSkillId: 'sig_tralalero_dash' },
  BallerinaCappuccina: { id: 'BallerinaCappuccina', name: 'Ballerina Cappuccina', talent: { str: 13, dex: 16, con: 10 }, signatureSkillId: 'sig_ballerina_waltz' },
  ChimpanziniBananini: { id: 'ChimpanziniBananini', name: 'Chimpanzini Bananini', talent: { str: 11, dex: 15, con: 13 }, signatureSkillId: 'sig_chimpanzini_frenzy' },
};

/** 所有角色 id。 */
export const ARCHETYPE_IDS = Object.keys(ROSTER);

/** 签名技能 → 拥有者 archetypeId 的反查表（用于「专属技能」学习门禁）。 */
export const SIGNATURE_OWNER: Record<string, string> = Object.fromEntries(
  Object.values(ROSTER)
    .filter((a) => a.signatureSkillId)
    .map((a) => [a.signatureSkillId as string, a.id]),
);

/** 某技能若是某角色的签名技能，返回其拥有者 id；否则 undefined（即通用技能）。 */
export function signatureOwner(skillId: string): string | undefined {
  return SIGNATURE_OWNER[skillId];
}

export function archetype(id: string): Archetype {
  const a = ROSTER[id];
  if (!a) throw new Error(`Unknown archetype: ${id}`);
  return a;
}

/** 取角色展示名（UI 用）。 */
export function archetypeName(id: string): string {
  return archetype(id).name;
}
