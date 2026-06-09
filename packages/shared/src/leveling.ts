/**
 * 养成系统 —— 升级、加点、洗点、选技能。
 *
 * 模型：Combatant 存 allocations（玩家往三属性各加的点）；当前属性 = 天赋 + allocations。
 * 可分配总点数由等级推出（每升一级 +POINTS_PER_LEVEL）；已花点数 = allocations 之和。
 * 洗点 = 清空 allocations（不依赖反推，存档稳健）。
 */
import {
  POINTS_PER_LEVEL,
  MAX_ABILITY,
  MAX_LEVEL,
  expToLevelUp,
  abilitiesOf,
  type Abilities,
  type AbilityKey,
  type Combatant,
} from './combatant.js';
import { archetype, signatureOwner } from './roster.js';
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

/** 已花掉的点 = allocations 三项之和。 */
export function spentPoints(c: Combatant): number {
  return c.allocations.str + c.allocations.dex + c.allocations.con;
}

/** 剩余可分配点。 */
export function availablePoints(c: Combatant): number {
  return totalPoints(c.level) - spentPoints(c);
}

function talentOf(archetypeId: string): Abilities {
  return archetype(archetypeId).talent;
}

/**
 * 给某个属性加 n 点（默认 1）。校验：有足够剩余点、不超过属性上限、分配不为负。
 * 返回新实例（不修改入参）。n 可为负（仅用于撤销，allocations 下限是 0）。
 */
export function allocate(c: Combatant, key: AbilityKey, n = 1): Combatant {
  const t = talentOf(c.archetypeId);
  if (n > 0 && availablePoints(c) < n) {
    throw new Error('属性点不足');
  }
  const nextAlloc = c.allocations[key] + n;
  if (nextAlloc < 0) throw new Error(`${key} 分配不能为负`);
  if (t[key] + nextAlloc > MAX_ABILITY) throw new Error(`${key} 超过上限 ${MAX_ABILITY}`);
  return { ...c, allocations: { ...c.allocations, [key]: nextAlloc } };
}

/** 洗点：清空 allocations，所有已分配点退回（等级/经验/技能不变）。 */
export function respec(c: Combatant): Combatant {
  return { ...c, allocations: { str: 0, dex: 0, con: 0 } };
}

/** 技能栏是否已满（最多 MAX_EQUIPPED_SKILLS 个）。 */
export function skillBarFull(c: Combatant): boolean {
  return c.skills.length >= MAX_EQUIPPED_SKILLS;
}

/** 某技能能否学：未学过 + 等级达到解锁 + 非他人签名 + 技能栏未满。返回原因（可学时为 null）。 */
export function learnBlockReason(c: Combatant, id: string): string | null {
  if (!isSkillId(id)) return '未知技能';
  if (c.skills.includes(id)) return '已学过';
  if (c.level < skillDef(id).unlockLevel) return `需 Lv${skillDef(id).unlockLevel}`;
  // 签名技能仅本角色可学（占技能栏，与普通技能同栏）。
  const owner = signatureOwner(id);
  if (owner && owner !== c.archetypeId) return '专属技能';
  if (skillBarFull(c)) return `技能栏已满(${MAX_EQUIPPED_SKILLS})`;
  return null;
}

export function canLearn(c: Combatant, id: string): boolean {
  return learnBlockReason(c, id) === null;
}

/**
 * 还没学的技能（不论是否满足等级/栏位，UI 自行用 canLearn 区分可学/灰显）。
 * 他人的签名技能不出现在池里——只有拥有者能看到自己的签名技能。
 */
export function learnableSkills(c: Combatant): SkillId[] {
  return ALL_SKILL_IDS.filter((id) => {
    if (c.skills.includes(id)) return false;
    const owner = signatureOwner(id);
    return !owner || owner === c.archetypeId;
  });
}

/** 学一个技能。校验：合法 + 未学 + 达到解锁等级 + 技能栏未满。返回新实例。 */
export function learnSkill(c: Combatant, id: string): Combatant {
  const reason = learnBlockReason(c, id);
  if (reason) throw new Error(`无法学习：${reason}`);
  return { ...c, skills: [...c.skills, id as SkillId] };
}

/** 该技能是否为本角色的签名技能（出生自带、占固定槽、不可卸）。 */
export function isOwnSignature(c: Combatant, id: string): boolean {
  return signatureOwner(id) === c.archetypeId;
}

/** 卸下一个已学技能（技能栏满时可换技能）。签名技能不可卸（角色身份）。 */
export function forgetSkill(c: Combatant, id: string): Combatant {
  if (isOwnSignature(c, id)) return c; // 签名固定占栏，拒绝卸下
  return { ...c, skills: c.skills.filter((s) => s !== id) };
}

/**
 * 加经验，自动升级。每次升级 level+1（满级封顶），经验清零进入下一级。
 * 升级本身只提升等级（解锁更多可分配点 + 一次选技能机会）；
 * 加点/选技能是玩家手动的另外步骤，不在这里自动做。
 * 返回 { combatant, leveledUp:升了几级 }。
 */
export function gainExp(c: Combatant, amount: number): { combatant: Combatant; leveledUp: number } {
  let level = c.level;
  let exp = c.exp + Math.max(0, amount);
  let gained = 0;
  while (level < MAX_LEVEL && exp >= expToLevelUp(level)) {
    exp -= expToLevelUp(level);
    level++;
    gained++;
  }
  if (level >= MAX_LEVEL) exp = 0; // 满级不再囤经验
  return { combatant: { ...c, level, exp }, leveledUp: gained };
}

/** 该角色在当前等级是否还有"待领"的成长（剩余点或当前真能学的技能）。给 UI 提示用。 */
export function hasPendingGrowth(c: Combatant): boolean {
  return availablePoints(c) > 0 || learnableSkills(c).some((id) => canLearn(c, id));
}
