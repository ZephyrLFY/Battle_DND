/**
 * 平衡模拟 CLI。
 *   npx tsx packages/shared/src/sim.cli.ts [level] [gamesPer]            —— 标准属性向 build 循环赛
 *   npx tsx packages/shared/src/sim.cli.ts balance [level] [gamesPer]    —— 12 角色平衡：1v1 + 3v3
 *   npx tsx packages/shared/src/sim.cli.ts pair <idA> <idB> [level] [teams] —— 双人组合联动专项
 */
import {
  standardBuilds,
  roundRobin,
  formatRoundRobin,
  buildTeam,
  describeBuild,
  signatureCombatant,
  archetypeDuel,
  archetypeDraftValue,
  archetypePairValue,
  formatArchetypeRanking,
  formatContribRanking,
  formatUsage,
  type UsageTally,
} from './sim.js';
import { ARCHETYPE_IDS } from './roster.js';

const mode = process.argv[2];
const isBalance = mode === 'balance';
const isPair = mode === 'pair';
const args = isBalance ? process.argv.slice(3) : isPair ? process.argv.slice(5) : process.argv.slice(2);
const level = Number(args[0] ?? 10);
const gamesPer = Number(args[1] ?? 200);

if (isPair) {
  const [idA, idB] = [process.argv[3]!, process.argv[4]!];
  const teams = Number(args[1] ?? 40);
  console.log(`\n=== 双人组合联动专项：${idA} + ${idB}（Lv${level}，${teams} 支随机队 × 8 场）===`);
  const pair = archetypePairValue(level, idA, idB, teams, 8);
  const solo = archetypeDraftValue(level, teams, 8);
  const a = solo.find((r) => r.id === idA)!;
  const b = solo.find((r) => r.id === idB)!;
  console.log(`  ${idA} 单独选秀价值: ${(a.winRate * 100).toFixed(0)}%`);
  console.log(`  ${idB} 单独选秀价值: ${(b.winRate * 100).toFixed(0)}%`);
  console.log(`  两人强制同队:      ${(pair.winRate * 100).toFixed(0)}%`);
  const base = Math.max(a.winRate, b.winRate);
  console.log(`  联动收益（同队 − 两人较强者）: ${((pair.winRate - base) * 100).toFixed(0)}pt`);
} else if (isBalance) {
  console.log(`\n=== 角色平衡模拟（Lv${level}，每组合 ${gamesPer} 场）===`);
  console.log('每个角色只带自己的签名 + 被动，不学通用技能（隔离单体强度）。\n');
  console.log('纯签名 build 示例：');
  for (const id of ARCHETYPE_IDS.slice(0, 3)) {
    console.log('  ' + describeBuild(signatureCombatant(id, level)));
  }
  const duelTally: UsageTally = {};
  const teamTally: UsageTally = {};
  console.log('\n' + formatArchetypeRanking(archetypeDuel(level, gamesPer, duelTally), '1v1 单角色对轰'));
  // 3v3 选秀价值：随机组队蒙特卡洛（队伍数 ≈ gamesPer/4，每对阵 8 场）
  const teamsPer = Math.max(12, Math.round(gamesPer / 4));
  console.log('\n' + formatContribRanking(archetypeDraftValue(level, teamsPer, 8, teamTally), `3v3 选秀价值（${teamsPer} 支随机队 × 8 场）`));
  console.log('\n' + formatUsage(duelTally, '1v1 技能使用率'));
  console.log('\n' + formatUsage(teamTally, '3v3 技能使用率'));
  console.log('');
} else {
  const specs = standardBuilds();
  console.log(`\n=== 标准 build（Lv${level}）===`);
  for (const s of specs) {
    console.log('  ' + describeBuild(buildTeam(level, s)[0]!));
  }
  console.log(`\n=== 循环赛胜率表（行=a方胜率，每组合 ${gamesPer} 场）===`);
  const tally: UsageTally = {};
  const rows = roundRobin(level, specs, gamesPer, tally);
  console.log(formatRoundRobin(rows));
  console.log('\n' + formatUsage(tally));
  console.log('\n=== 综合强度排名（overall 胜率）===');
  [...rows]
    .sort((x, y) => y.overall - x.overall)
    .forEach((r, i) => console.log(`  ${i + 1}. ${r.build}  ${(r.overall * 100).toFixed(0)}%`));
  console.log('');
}
