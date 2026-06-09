/**
 * 平衡模拟工具 —— 批量跑 3v3 对局，统计胜率，做数据驱动的平衡分析。
 *
 * 纯函数（可单测、可被 CLI 复用）。双方都用贪心 AI（更接近"会玩的玩家"的强度），
 * 这样胜率反映 build 本身的强弱，而非 AI 失误。
 */
import { createBattle, applyAction, currentFighter, isOver } from './battle.js';
import { chooseActionGreedy } from './ai.js';
import { newCombatant, abilitiesOf, type Combatant, type AbilityKey } from './combatant.js';
import { allocate, learnSkill, availablePoints as availablePointsOf } from './leveling.js';
import { ARCHETYPE_IDS } from './roster.js';
import type { SkillId } from './skills.js';

export interface MatchResult {
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
  avgTurns: number;
  /** a 方胜率（0~1），平局不计入分母。 */
  aWinRate: number;
}

/** 跑 N 场 a vs b（双方贪心），返回统计。确定性：同入参恒等。 */
export function runMatch(teamA: Combatant[], teamB: Combatant[], games: number): MatchResult {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let turnsTotal = 0;
  for (let i = 0; i < games; i++) {
    const seed = i * 2654435761 + 1;
    let { state } = createBattle(teamA, teamB, seed);
    let guard = 0;
    while (!isOver(state) && guard++ < 5000) {
      const cur = currentFighter(state)!;
      const aiSeed = seed * 31 + guard;
      state = applyAction(state, chooseActionGreedy(state, aiSeed)).state;
    }
    turnsTotal += guard;
    if (state.winner === 'a') aWins++;
    else if (state.winner === 'b') bWins++;
    else draws++;
  }
  const decided = aWins + bWins;
  return {
    aWins,
    bWins,
    draws,
    games,
    avgTurns: turnsTotal / games,
    aWinRate: decided > 0 ? aWins / decided : 0.5,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// build 工厂：生成标准化的测试 build
// ─────────────────────────────────────────────────────────────────────────

export interface BuildSpec {
  name: string;
  /** 把可用属性点全砸到这些属性上（轮流）。 */
  focus: AbilityKey[];
  /** 给每个角色学的技能。 */
  skills: SkillId[];
}

/** 按 spec 造一个角色（用某 archetype），把点数砸到 focus，学技能。 */
export function buildCombatant(archetypeId: string, level: number, spec: BuildSpec): Combatant {
  let c = { ...newCombatant(archetypeId), level };
  // 轮流往 focus 属性加点，直到耗尽（超上限的属性自动跳过）
  // 优先把点砸进 focus 属性；focus 都满了再溢出到其余属性（理性玩家不浪费点）。
  const order: AbilityKey[] = [...spec.focus];
  for (const k of ['str', 'dex', 'con'] as AbilityKey[]) {
    if (!order.includes(k)) order.push(k);
  }
  let guard = 0;
  while (guard++ < 300 && availablePointsOf(c) > 0) {
    let added = false;
    for (const key of order) {
      try {
        c = allocate(c, key, 1);
        added = true;
        break;
      } catch {
        /* 该属性满，试下一个 */
      }
    }
    if (!added) break; // 所有属性都满
  }
  for (const s of spec.skills) {
    try {
      c = learnSkill(c, s);
    } catch {
      /* 未达等级/栏满则跳过 */
    }
  }
  return c;
}

/** 用同一个 spec 造一支 3 人队（取前 3 个不同 archetype）。 */
export function buildTeam(level: number, spec: BuildSpec): Combatant[] {
  return ARCHETYPE_IDS.slice(0, 3).map((id) => buildCombatant(id, level, spec));
}

/** 几个标准对照 build（攻击向/敏捷向/坦克向/均衡）。 */
export function standardBuilds(): BuildSpec[] {
  return [
    { name: '力量攻击', focus: ['str'], skills: ['brave_strike', 'flurry'] },
    { name: '敏捷闪避', focus: ['dex'], skills: ['precise_aim', 'brave_strike'] },
    { name: '体质坦克', focus: ['con'], skills: ['shield_block', 'heal'] },
    { name: '均衡', focus: ['str', 'dex', 'con'], skills: ['brave_strike', 'heal'] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// 循环赛：build 两两互打，输出胜率矩阵
// ─────────────────────────────────────────────────────────────────────────

export interface RoundRobinRow {
  build: string;
  /** 对各对手的胜率（含自己=镜像）。 */
  vs: Record<string, number>;
  /** 平均胜率（对所有对手）。 */
  overall: number;
}

export function roundRobin(level: number, specs: BuildSpec[], gamesPer: number): RoundRobinRow[] {
  const teams = specs.map((s) => ({ spec: s, team: buildTeam(level, s) }));
  const rows: RoundRobinRow[] = [];
  for (const a of teams) {
    const vs: Record<string, number> = {};
    let sum = 0;
    for (const b of teams) {
      const r = runMatch(a.team, b.team, gamesPer);
      vs[b.spec.name] = round2(r.aWinRate);
      sum += r.aWinRate;
    }
    rows.push({ build: a.spec.name, vs, overall: round2(sum / teams.length) });
  }
  return rows;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────
// 角色平衡：每个 archetype 只带自己的签名 + 被动（不学通用技能），最干净隔离单体强度
// ─────────────────────────────────────────────────────────────────────────

/**
 * 造一个「纯签名」build：自带签名（newCombatant 已放进 skills[0]）+ 被动 + 按天赋主属性撒点，
 * 不学任何通用技能。用于隔离对比各角色本体强度。
 */
export function signatureCombatant(archetypeId: string, level: number): Combatant {
  let c = { ...newCombatant(archetypeId), level };
  // 按天赋找主属性，把可用点全砸进去（溢出到次高）
  const t = abilitiesOf(newCombatant(archetypeId));
  const order = (['str', 'dex', 'con'] as AbilityKey[]).sort((a, b) => t[b] - t[a]);
  let guard = 0;
  while (guard++ < 300 && availablePointsOf(c) > 0) {
    let added = false;
    for (const k of order) {
      try {
        c = allocate(c, k, 1);
        added = true;
        break;
      } catch {
        /* 满，下一个 */
      }
    }
    if (!added) break;
  }
  return c;
}

/** 全 12 角色的纯签名 build（用于循环赛）。 */
export function signatureRoster(level: number): { id: string; combatant: Combatant }[] {
  return ARCHETYPE_IDS.map((id) => ({ id, combatant: signatureCombatant(id, level) }));
}

export interface ArchetypeRow {
  id: string;
  vs: Record<string, number>;
  overall: number;
}

/** 内部：N 人对 N 人的角色循环赛（teamSize=1 → 1v1 单体；=3 → 同名 3 人队）。 */
function archetypeRoundRobinN(level: number, gamesPer: number, teamSize: number): ArchetypeRow[] {
  const roster = signatureRoster(level);
  const mkTeam = (c: Combatant) => Array.from({ length: teamSize }, () => c);
  const rows: ArchetypeRow[] = [];
  for (const a of roster) {
    const vs: Record<string, number> = {};
    let sum = 0;
    for (const b of roster) {
      const r = runMatch(mkTeam(a.combatant), mkTeam(b.combatant), gamesPer);
      vs[b.id] = round2(r.aWinRate);
      sum += r.aWinRate;
    }
    rows.push({ id: a.id, vs, overall: round2(sum / roster.length) });
  }
  return rows;
}

/** 1v1 单角色对轰：隔离单体强度。 */
export function archetypeDuel(level: number, gamesPer: number): ArchetypeRow[] {
  return archetypeRoundRobinN(level, gamesPer, 1);
}

/**
 * 3v3 团队贡献：固定一支中性基准队，每个角色轮流**替换基准队的一个位置**去打原始基准队，
 * 看胜率——>50% 说明该角色比被换掉的强（团队里有正贡献），<50% 说明拖后腿。
 * 这样能测出团队联动（CA↔BC/Patapim），又不像镜像对局那样人人 50%。
 */
// 中性基准队：取 1v1 强度处于中段的三个角色（约 50% 一线），让"贡献 >50%"= 强于这条中线。
const BASELINE_TRIO = ['BombombiniGusini', 'BombardiroCrocodilo', 'FrigoCamelo'];

export interface ContribRow {
  id: string;
  /** 把该角色塞进基准队、打原始基准队的胜率（替换位取最低胜率，代表"至少能顶替谁"）。 */
  winRate: number;
}

export function archetypeTeamContribution(level: number, gamesPer: number): ContribRow[] {
  const sig = (id: string) => signatureCombatant(id, level);
  const baseline = BASELINE_TRIO.map(sig);
  const rows: ContribRow[] = [];
  for (const id of ARCHETYPE_IDS) {
    const me = sig(id);
    // 替换基准队每个位置各打一次，取平均胜率（避免站位偏差）。
    // 若该角色就是基准位本身，替换它等于镜像，仍计入（≈50%）。
    let sum = 0;
    for (let slot = 0; slot < baseline.length; slot++) {
      const team = baseline.map((c, i) => (i === slot ? me : c));
      sum += runMatch(team, baseline, gamesPer).aWinRate;
    }
    rows.push({ id, winRate: round2(sum / baseline.length) });
  }
  return rows;
}

/** ArchetypeRow（1v1）→ 按 overall 排序的可读排名表。 */
export function formatArchetypeRanking(rows: ArchetypeRow[], title: string): string {
  const sorted = [...rows].sort((a, b) => b.overall - a.overall);
  const lines = sorted.map(
    (r, i) => `  ${String(i + 1).padStart(2)}. ${r.id.padEnd(22)} ${(r.overall * 100).toFixed(0)}%`,
  );
  return [`=== ${title}（overall 胜率排名）===`, ...lines].join('\n');
}

/** ContribRow（3v3 贡献）→ 排名表。 */
export function formatContribRanking(rows: ContribRow[], title: string): string {
  const sorted = [...rows].sort((a, b) => b.winRate - a.winRate);
  const lines = sorted.map(
    (r, i) => `  ${String(i + 1).padStart(2)}. ${r.id.padEnd(22)} ${(r.winRate * 100).toFixed(0)}%`,
  );
  return [`=== ${title}（替换基准队一位，对原基准队胜率）===`, ...lines].join('\n');
}

/** 把循环赛结果格式化成可读表格文本。 */
export function formatRoundRobin(rows: RoundRobinRow[]): string {
  const names = rows.map((r) => r.build);
  const pad = (s: string, n: number) => s.padEnd(n);
  const head = pad('build \\ vs', 12) + names.map((n) => pad(n, 10)).join('') + 'overall';
  const lines = rows.map(
    (r) =>
      pad(r.build, 12) +
      names.map((n) => pad((r.vs[n] ?? 0).toFixed(2), 10)).join('') +
      r.overall.toFixed(2),
  );
  return [head, ...lines].join('\n');
}

/** 调试：打印一个 build 的属性/技能。 */
export function describeBuild(c: Combatant): string {
  const ab = abilitiesOf(c);
  return `${c.archetypeId} Lv${c.level} STR${ab.str}/DEX${ab.dex}/CON${ab.con} [${c.skills.join(',')}]`;
}
