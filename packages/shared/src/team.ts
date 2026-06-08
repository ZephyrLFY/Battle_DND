/**
 * 队伍（Team）—— 更符合 DND 世界观：我方是一支队伍，不是一堆独立角色。
 *
 * 约束：队内不能有重复角色（archetypeId 唯一）。出战固定 LINEUP_SIZE 个。
 * 纯净战斗：输赢不增减队员（角色获取/移除走别的路子，待设计）。
 */
import { Rng } from './rng.js';
import { newCombatant, type Combatant } from './combatant.js';
import { ARCHETYPE_IDS } from './roster.js';
import { ALL_SKILL_IDS, type SkillId } from './skills.js';
import { canLearn, allocate } from './leveling.js';

/** 出战人数（3v3）。 */
export const LINEUP_SIZE = 3;

/** 一支队伍。 */
export interface Team {
  /** 拥有的全部角色（archetypeId 互不相同）。 */
  members: Combatant[];
  /** 出战角色在 members 里的下标（长度 = LINEUP_SIZE）。 */
  lineup: number[];
}

/** 队内 archetypeId 是否唯一。 */
export function hasUniqueMembers(team: Team): boolean {
  const ids = team.members.map((m) => m.archetypeId);
  return new Set(ids).size === ids.length;
}

/** 能否把某角色加入队伍（不重复）。 */
export function canAddMember(team: Team, archetypeId: string): boolean {
  return !team.members.some((m) => m.archetypeId === archetypeId);
}

/** 出战阵容是否合法（人数对、下标有效、不重复）。 */
export function isLineupValid(team: Team): boolean {
  if (team.lineup.length !== LINEUP_SIZE) return false;
  if (new Set(team.lineup).size !== team.lineup.length) return false;
  return team.lineup.every((i) => i >= 0 && i < team.members.length);
}

/** 取出战的角色实例。 */
export function lineupMembers(team: Team): Combatant[] {
  return team.lineup.map((i) => team.members[i]!);
}

/**
 * 随机生成一支敌方队伍（去 UI 层手搓随机）。确定性：同 (level, seed) 恒等。
 * 选 LINEUP_SIZE 个不重复角色，各随机加点 + 随机学若干技能。
 */
export function generateEnemyTeam(level: number, seed: number): Combatant[] {
  const rng = new Rng(seed);
  const ids = [...ARCHETYPE_IDS];
  // 洗牌取前 LINEUP_SIZE 个（不重复）
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const chosen = ids.slice(0, LINEUP_SIZE);
  return chosen.map((id) => buildRandom(id, level, rng));
}

/** 给单个角色随机分配点 + 随机学技能（受等级/栏位限制）。 */
function buildRandom(archetypeId: string, level: number, rng: Rng): Combatant {
  let c = { ...newCombatant(archetypeId), level };
  const keys = ['str', 'dex', 'con'] as const;
  // 撒点直到耗尽
  for (let guard = 0; guard < 200; guard++) {
    try {
      c = allocate(c, keys[rng.int(0, 2)]!, 1);
    } catch {
      break;
    }
  }
  // 随机学技能：洗牌技能池，按 canLearn 学到栏满
  const skills: SkillId[] = [...ALL_SKILL_IDS];
  for (let i = skills.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [skills[i], skills[j]] = [skills[j]!, skills[i]!];
  }
  for (const s of skills) {
    if (canLearn(c, s)) c = { ...c, skills: [...c.skills, s] };
  }
  return c;
}
