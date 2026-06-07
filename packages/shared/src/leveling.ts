/**
 * 养成系统 —— 升级、加点、洗点、选技能。
 *
 * 模型：PokemonInstance.abilities 存的是"天赋 + 已分配点"的最终值。
 * 可分配总点数由等级推出（每升一级 +POINTS_PER_LEVEL）；已分配点 = 当前属性 − 天赋之和。
 * 洗点 = 把属性重置回天赋，剩余点全部退回待分配。
 */
import {
  SPECIES_TALENT,
  POINTS_PER_LEVEL,
  MAX_ABILITY,
  MAX_LEVEL,
  expToLevelUp,
  type Abilities,
  type AbilityKey,
  type PokemonInstance,
} from './pokemon.js';
import {
  ALL_SKILL_IDS,
  isSkillId,
  skillDef,
  MAX_EQUIPPED_SKILLS,
  type SkillId,
} from './skills.js';

/** 该等级累计可分配的属性点（1 级 0 点，之后每级 +POINTS_PER_LEVEL）。 */
export function totalPoints(level: number): number {
  return Math.max(0, (Math.min(level, MAX_LEVEL) - 1) * POINTS_PER_LEVEL);
}

/** 已花掉的点 = 当前属性总和 − 天赋总和。 */
export function spentPoints(p: PokemonInstance): number {
  const t = talentOf(p.species);
  const cur = p.abilities.str + p.abilities.dex + p.abilities.con;
  const base = t.str + t.dex + t.con;
  return cur - base;
}

/** 剩余可分配点。 */
export function availablePoints(p: PokemonInstance): number {
  return totalPoints(p.level) - spentPoints(p);
}

function talentOf(species: string): Abilities {
  const t = SPECIES_TALENT[species];
  if (!t) throw new Error(`Unknown species: ${species}`);
  return t;
}

/**
 * 给某个属性加 n 点（默认 1）。校验：有足够剩余点、不超过属性上限、不低于天赋值。
 * 返回新实例（不修改入参）。n 可为负（仅用于撤销，下限是天赋值）。
 */
export function allocate(p: PokemonInstance, key: AbilityKey, n = 1): PokemonInstance {
  const t = talentOf(p.species);
  if (n > 0 && availablePoints(p) < n) {
    throw new Error('属性点不足');
  }
  const nextVal = p.abilities[key] + n;
  if (nextVal > MAX_ABILITY) throw new Error(`${key} 超过上限 ${MAX_ABILITY}`);
  if (nextVal < t[key]) throw new Error(`${key} 不能低于天赋值 ${t[key]}`);
  return { ...p, abilities: { ...p.abilities, [key]: nextVal } };
}

/** 洗点：属性重置回天赋，所有已分配点退回（等级/经验/技能不变）。 */
export function respec(p: PokemonInstance): PokemonInstance {
  return { ...p, abilities: { ...talentOf(p.species) } };
}

/** 技能栏是否已满（最多 MAX_EQUIPPED_SKILLS 个）。 */
export function skillBarFull(p: PokemonInstance): boolean {
  return p.skills.length >= MAX_EQUIPPED_SKILLS;
}

/** 某技能能否学：未学过 + 等级达到解锁 + 技能栏未满。返回原因（可学时为 null）。 */
export function learnBlockReason(p: PokemonInstance, id: string): string | null {
  if (!isSkillId(id)) return '未知技能';
  if (p.skills.includes(id)) return '已学过';
  if (p.level < skillDef(id).unlockLevel) return `需 Lv${skillDef(id).unlockLevel}`;
  if (skillBarFull(p)) return `技能栏已满(${MAX_EQUIPPED_SKILLS})`;
  return null;
}

export function canLearn(p: PokemonInstance, id: string): boolean {
  return learnBlockReason(p, id) === null;
}

/** 还没学的技能（不论是否满足等级/栏位，UI 自行用 canLearn 区分可学/灰显）。 */
export function learnableSkills(p: PokemonInstance): SkillId[] {
  return ALL_SKILL_IDS.filter((id) => !p.skills.includes(id));
}

/** 学一个技能。校验：合法 + 未学 + 达到解锁等级 + 技能栏未满。返回新实例。 */
export function learnSkill(p: PokemonInstance, id: string): PokemonInstance {
  const reason = learnBlockReason(p, id);
  if (reason) throw new Error(`无法学习：${reason}`);
  return { ...p, skills: [...p.skills, id as SkillId] };
}

/** 卸下一个已学技能（技能栏满时可换技能）。 */
export function forgetSkill(p: PokemonInstance, id: string): PokemonInstance {
  return { ...p, skills: p.skills.filter((s) => s !== id) };
}

/**
 * 加经验，自动升级。每次升级 level+1（满级封顶），经验清零进入下一级。
 * 升级本身只提升等级（解锁更多可分配点 + 一次选技能机会）；
 * 加点/选技能是玩家手动的另外步骤，不在这里自动做。
 * 返回 { pokemon, leveledUp:升了几级 }。
 */
export function gainExp(p: PokemonInstance, amount: number): { pokemon: PokemonInstance; leveledUp: number } {
  let level = p.level;
  let exp = p.exp + Math.max(0, amount);
  let gained = 0;
  while (level < MAX_LEVEL && exp >= expToLevelUp(level)) {
    exp -= expToLevelUp(level);
    level++;
    gained++;
  }
  if (level >= MAX_LEVEL) exp = 0; // 满级不再囤经验
  return { pokemon: { ...p, level, exp }, leveledUp: gained };
}

/** 该精灵在当前等级是否还有"待领"的成长（剩余点或当前真能学的技能）。给 UI 提示用。 */
export function hasPendingGrowth(p: PokemonInstance): boolean {
  return availablePoints(p) > 0 || learnableSkills(p).some((id) => canLearn(p, id));
}
