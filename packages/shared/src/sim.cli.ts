/**
 * 平衡模拟 CLI。
 *   npx tsx packages/shared/src/sim.cli.ts [level] [gamesPer]            —— 标准属性向 build 循环赛
 *   npx tsx packages/shared/src/sim.cli.ts balance [level] [gamesPer]    —— 12 角色平衡：1v1 + 3v3
 */
import {
  standardBuilds,
  roundRobin,
  formatRoundRobin,
  buildTeam,
  describeBuild,
  signatureCombatant,
  archetypeDuel,
  archetypeTeamContribution,
  formatArchetypeRanking,
  formatContribRanking,
} from './sim.js';
import { ARCHETYPE_IDS } from './roster.js';

const isBalance = process.argv[2] === 'balance';
const args = isBalance ? process.argv.slice(3) : process.argv.slice(2);
const level = Number(args[0] ?? 10);
const gamesPer = Number(args[1] ?? 200);

if (isBalance) {
  console.log(`\n=== 角色平衡模拟（Lv${level}，每组合 ${gamesPer} 场）===`);
  console.log('每个角色只带自己的签名 + 被动，不学通用技能（隔离单体强度）。\n');
  console.log('纯签名 build 示例：');
  for (const id of ARCHETYPE_IDS.slice(0, 3)) {
    console.log('  ' + describeBuild(signatureCombatant(id, level)));
  }
  console.log('\n' + formatArchetypeRanking(archetypeDuel(level, gamesPer), '1v1 单角色对轰'));
  console.log('\n' + formatContribRanking(archetypeTeamContribution(level, gamesPer), '3v3 团队贡献'));
  console.log('');
} else {
  const specs = standardBuilds();
  console.log(`\n=== 标准 build（Lv${level}）===`);
  for (const s of specs) {
    console.log('  ' + describeBuild(buildTeam(level, s)[0]!));
  }
  console.log(`\n=== 循环赛胜率表（行=a方胜率，每组合 ${gamesPer} 场）===`);
  const rows = roundRobin(level, specs, gamesPer);
  console.log(formatRoundRobin(rows));
  console.log('\n=== 综合强度排名（overall 胜率）===');
  [...rows]
    .sort((x, y) => y.overall - x.overall)
    .forEach((r, i) => console.log(`  ${i + 1}. ${r.build}  ${(r.overall * 100).toFixed(0)}%`));
  console.log('');
}
