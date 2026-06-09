/**
 * 平衡模拟 CLI —— 跑标准 build 循环赛，打印胜率表。
 * 用法：npx tsx packages/shared/src/sim.cli.ts [level] [gamesPer]
 */
import { standardBuilds, roundRobin, formatRoundRobin, buildTeam, describeBuild } from './sim.js';

const level = Number(process.argv[2] ?? 10);
const gamesPer = Number(process.argv[3] ?? 200);

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
