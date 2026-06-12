/**
 * 平衡模拟工具 —— 批量跑 3v3 对局，统计胜率，做数据驱动的平衡分析。
 *
 * 纯函数（可单测、可被 CLI 复用）。双方都用贪心 AI（更接近"会玩的玩家"的强度），
 * 这样胜率反映 build 本身的强弱，而非 AI 失误。
 */
import { Rng } from './rng.js';
import { createBattle, applyAction, currentFighter, isOver } from './battle.js';
import { chooseActionGreedy } from './ai.js';
import { newCombatant, abilitiesOf, type Combatant, type AbilityKey } from './combatant.js';
import { allocate, learnSkill, availablePoints as availablePointsOf } from './leveling.js';
import { ARCHETYPE_IDS } from './roster.js';
import { SKILLS, type SkillId } from './skills.js';

export interface MatchResult {
  aWins: number;
  bWins: number;
  draws: number;
  games: number;
  avgTurns: number;
  /** a 方胜率（0~1），平局不计入分母。 */
  aWinRate: number;
}

/**
 * 技能使用率统计（AI 健康度仪表盘）：archetypeId → 动作键('attack'|skillId) → 次数。
 * 任何角色的签名使用率 ≈ 0 都说明其胜率数据不反映 kit 强度（AI 不会用 ≠ 技能弱）。
 */
export type UsageTally = Record<string, Record<string, number>>;

function tallyAction(tally: UsageTally, archetypeId: string, action: { kind: string; skill?: string }): void {
  const key = action.kind === 'attack' ? 'attack' : (action as { skill: string }).skill;
  const row = (tally[archetypeId] ??= {});
  row[key] = (row[key] ?? 0) + 1;
}

/** UsageTally → 可读报表（每角色的动作分布，签名技能排前）。 */
export function formatUsage(tally: UsageTally, title = '技能使用率'): string {
  const lines: string[] = [`=== ${title}（AI 健康度：签名使用率≈0 ⇒ 该角色胜率数据失真）===`];
  for (const id of Object.keys(tally).sort()) {
    const row = tally[id]!;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    const parts = Object.entries(row)
      .sort(([a], [b]) => Number(b.startsWith('sig_')) - Number(a.startsWith('sig_')) || a.localeCompare(b))
      .map(([k, n]) => `${k} ${((100 * n) / total).toFixed(0)}%`);
    lines.push(`  ${id.padEnd(22)} ${parts.join(' | ')}  (n=${total})`);
  }
  return lines.join('\n');
}

/** 跑 N 场 a vs b（双方贪心），返回统计。确定性：同入参恒等。可选 tally 收集动作分布。 */
export function runMatch(teamA: Combatant[], teamB: Combatant[], games: number, tally?: UsageTally): MatchResult {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let turnsTotal = 0;
  for (let i = 0; i < games; i++) {
    const seed = i * 2654435761 + 1;
    let { state } = createBattle(teamA, teamB, seed);
    let guard = 0;
    // guard 800：正常对局 <100 回合；超过的实质是双回血坦克死局（计平局）。
    // 5000 在推演 AI（每决策 ~30 次 applyAction）下会让死局吃掉全部模拟时间。
    while (!isOver(state) && guard++ < 800) {
      const cur = currentFighter(state)!;
      const aiSeed = seed * 31 + guard;
      const action = chooseActionGreedy(state, aiSeed);
      if (tally && cur && !cur.downed && cur.stunned <= 0) tallyAction(tally, cur.archetypeId, action);
      state = applyAction(state, action).state;
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

export function roundRobin(level: number, specs: BuildSpec[], gamesPer: number, tally?: UsageTally): RoundRobinRow[] {
  const teams = specs.map((s) => ({ spec: s, team: buildTeam(level, s) }));
  const rows: RoundRobinRow[] = [];
  for (const a of teams) {
    const vs: Record<string, number> = {};
    let sum = 0;
    for (const b of teams) {
      const r = runMatch(a.team, b.team, gamesPer, tally);
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
function archetypeRoundRobinN(level: number, gamesPer: number, teamSize: number, tally?: UsageTally): ArchetypeRow[] {
  const roster = signatureRoster(level);
  const mkTeam = (c: Combatant) => Array.from({ length: teamSize }, () => c);
  const rows: ArchetypeRow[] = [];
  for (const a of roster) {
    const vs: Record<string, number> = {};
    let sum = 0;
    for (const b of roster) {
      const r = runMatch(mkTeam(a.combatant), mkTeam(b.combatant), gamesPer, tally);
      vs[b.id] = round2(r.aWinRate);
      sum += r.aWinRate;
    }
    rows.push({ id: a.id, vs, overall: round2(sum / roster.length) });
  }
  return rows;
}

/** 1v1 单角色对轰：隔离单体强度。 */
export function archetypeDuel(level: number, gamesPer: number, tally?: UsageTally): ArchetypeRow[] {
  return archetypeRoundRobinN(level, gamesPer, 1, tally);
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

export function archetypeTeamContribution(level: number, gamesPer: number, tally?: UsageTally): ContribRow[] {
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
      sum += runMatch(team, baseline, gamesPer, tally).aWinRate;
    }
    rows.push({ id, winRate: round2(sum / baseline.length) });
  }
  return rows;
}

/**
 * 3v3 随机组队「选秀价值」（替代固定基准队替换位指标）：
 * 对每个角色采样 N 支**包含它的随机三人队**，对阵随机敌方三人队，取平均胜率。
 *
 * 为什么换：固定基准队指标的分数被「被换下的人有多强 + 与留下两人的配合」主导
 * （基准队成员自带主场优势，T1 角色被换下时全员分数塌方），不反映角色自身的团队价值。
 * 随机采样消除基准偏置，且联动（CA+BC 同队）会自然出现在样本里。
 *
 * 确定性：组队采样用固定种子的 Rng；同入参恒等。
 * 公平性：所有被测角色共用同一批敌方队伍（配对比较，降方差）。
 */
export function archetypeDraftValue(
  level: number,
  teamsPer: number,
  gamesPer: number,
  tally?: UsageTally,
): ContribRow[] {
  const sig = (id: string) => signatureCombatant(id, level);
  const rng = new Rng(0xd2af7);
  /** 从全角色池抽 size 个不同 archetype（可要求包含 include）。 */
  const sampleTeam = (size: number, include?: string): string[] => {
    const pool = include ? ARCHETYPE_IDS.filter((x) => x !== include) : [...ARCHETYPE_IDS];
    // Fisher–Yates 局部洗牌取前 k
    for (let i = 0; i < size; i++) {
      const j = rng.int(i, pool.length - 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const picked = pool.slice(0, include ? size - 1 : size);
    return include ? [include, ...picked] : picked;
  };
  // 共用敌方队伍组（所有被测角色面对同一批对手）
  const enemyTeams = Array.from({ length: teamsPer }, () => sampleTeam(3).map(sig));
  const rows: ContribRow[] = [];
  for (const id of ARCHETYPE_IDS) {
    let sum = 0;
    for (let s = 0; s < teamsPer; s++) {
      const myTeam = sampleTeam(3, id).map(sig);
      sum += runMatch(myTeam, enemyTeams[s]!, gamesPer, tally).aWinRate;
    }
    rows.push({ id, winRate: round2(sum / teamsPer) });
  }
  return rows;
}

/**
 * 双人组合专项：强制 idA + idB 同队（第三人随机），对阵与 archetypeDraftValue
 * **同一批**随机敌队（同种子采样）。与两人各自的选秀价值对比即可量化联动收益：
 *   synergy ≈ pairValue − max(draft(A), draft(B))
 * 用于评判 CA↔BC 这类依赖同队的被动（随机组队里两人同队概率仅 ~18%，会被稀释）。
 */
export function archetypePairValue(
  level: number,
  idA: string,
  idB: string,
  teamsPer: number,
  gamesPer: number,
  tally?: UsageTally,
): ContribRow {
  const sig = (id: string) => signatureCombatant(id, level);
  const rng = new Rng(0xd2af7); // 与 archetypeDraftValue 同种子 → 敌队序列一致，可比
  const sampleTrio = (exclude: string[]): string[] => {
    const pool = ARCHETYPE_IDS.filter((x) => !exclude.includes(x));
    for (let i = 0; i < 3; i++) {
      const j = rng.int(i, pool.length - 1);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  };
  // 敌队：与 draftValue 相同的采样方式（全池随机三人）
  const enemyTeams = Array.from({ length: teamsPer }, () => sampleTrio([]).map(sig));
  let sum = 0;
  for (let s = 0; s < teamsPer; s++) {
    const third = sampleTrio([idA, idB])[0]!;
    const myTeam = [sig(idA), sig(idB), sig(third)];
    sum += runMatch(myTeam, enemyTeams[s]!, gamesPer, tally).aWinRate;
  }
  return { id: `${idA}+${idB}`, winRate: round2(sum / teamsPer) };
}

// ─────────────────────────────────────────────────────────────────────────
// 技能消融实验：量化每个技能的胜率贡献
// ─────────────────────────────────────────────────────────────────────────

/** 从全角色池抽 3 个不同 archetype（Fisher–Yates 局部洗牌）。 */
function sampleTrioIds(rng: Rng, include?: string): string[] {
  const pool = include ? ARCHETYPE_IDS.filter((x) => x !== include) : [...ARCHETYPE_IDS];
  for (let i = 0; i < 3; i++) {
    const j = rng.int(i, pool.length - 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, include ? 2 : 3);
  return include ? [include, ...picked] : picked;
}

export interface AblationRow {
  id: string;
  /** 实验组胜率（带该技能）。 */
  withRate: number;
  /** 对照组胜率（不带）。 */
  withoutRate: number;
  /** 贡献值 = with − without（百分点，-1~1）。 */
  delta: number;
}

/**
 * 通用技能 add-one 消融：对照组 = 纯签名随机三人队 vs 共用敌队组（纯签名）；
 * 实验组 = 我方全员额外学技能 s，其余（队伍组合/敌队/对局种子）完全相同 → 配对比较。
 * delta = 该技能给团队带来的平均胜率增益。
 *
 * 注意口径：「全员同学一个技能」放大团队向技能（heal/war_cry 有 3 份），
 * 衡量的是"这个技能值不值得被带"的强度信号，非单卡严格边际。
 * level 建议 ≥12（charge_smash/revive Lv11 解锁，低等级会测不到）。
 */
export function genericSkillAblation(
  level: number,
  teamsPer: number,
  gamesPer: number,
  onlySkills?: SkillId[],
): AblationRow[] {
  const generic = (onlySkills ?? (Object.keys(SKILLS) as SkillId[])).filter((s) => !s.startsWith('sig_'));
  const sig = (id: string) => signatureCombatant(id, level);
  // 固定种子：队伍组合与敌队在所有变体间一致（配对比较，降方差）
  const rng = new Rng(0xab1a7e);
  const enemyTrios = Array.from({ length: teamsPer }, () => sampleTrioIds(rng));
  const myTrios = Array.from({ length: teamsPer }, () => sampleTrioIds(rng));
  const runWith = (build: (id: string) => Combatant): number => {
    let sum = 0;
    for (let s = 0; s < teamsPer; s++) {
      sum += runMatch(myTrios[s]!.map(build), enemyTrios[s]!.map(sig), gamesPer).aWinRate;
    }
    return sum / teamsPer;
  };
  const ctrl = runWith(sig);
  return generic.map((s) => {
    const withRate = runWith((id) => {
      try {
        return learnSkill(sig(id), s);
      } catch {
        return sig(id); // 等级不够解锁 → 退回纯签名（该角色不贡献差异）
      }
    });
    return { id: s, withRate: round2(withRate), withoutRate: round2(ctrl), delta: round2(withRate - ctrl) };
  });
}

/**
 * 签名技能 remove-one 消融：每个角色测「带签名 vs 剥离签名」的随机组队胜率差。
 * 只动焦点角色（队友/敌人都正常带签名）；同一角色的两个变体用相同的队伍组合与敌队。
 * delta = 该签名对其拥有者的胜率贡献（被动不动，仍然生效）。
 */
export function signatureAblation(
  level: number,
  teamsPer: number,
  gamesPer: number,
  onlyIds?: string[],
): AblationRow[] {
  const sig = (id: string) => signatureCombatant(id, level);
  const stripped = (id: string): Combatant => ({ ...sig(id), skills: [] });
  const rows: AblationRow[] = [];
  for (const focal of onlyIds ?? ARCHETYPE_IDS) {
    const rng = new Rng(0x51947 ^ ARCHETYPE_IDS.indexOf(focal)); // 每角色独立但确定
    const enemyTrios = Array.from({ length: teamsPer }, () => sampleTrioIds(rng));
    const myTrios = Array.from({ length: teamsPer }, () => sampleTrioIds(rng, focal));
    const runFocal = (mkFocal: (id: string) => Combatant): number => {
      let sum = 0;
      for (let s = 0; s < teamsPer; s++) {
        const team = myTrios[s]!.map((id) => (id === focal ? mkFocal(id) : sig(id)));
        sum += runMatch(team, enemyTrios[s]!.map(sig), gamesPer).aWinRate;
      }
      return sum / teamsPer;
    };
    const withRate = runFocal(sig);
    const withoutRate = runFocal(stripped);
    rows.push({ id: focal, withRate: round2(withRate), withoutRate: round2(withoutRate), delta: round2(withRate - withoutRate) });
  }
  return rows;
}

/** AblationRow → 按 delta 排序的可读表。 */
export function formatAblation(rows: AblationRow[], title: string): string {
  const sorted = [...rows].sort((a, b) => b.delta - a.delta);
  const lines = sorted.map(
    (r, i) =>
      `  ${String(i + 1).padStart(2)}. ${r.id.padEnd(24)} ${(r.withRate * 100).toFixed(0).padStart(3)}% vs ${(r.withoutRate * 100).toFixed(0).padStart(3)}%  Δ ${(r.delta >= 0 ? '+' : '') + (r.delta * 100).toFixed(0)}pt`,
  );
  return [`=== ${title}（带 vs 不带，Δ=贡献）===`, ...lines].join('\n');
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
  return [`=== ${title} ===`, ...lines].join('\n');
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
