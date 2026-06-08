/**
 * 表现层映射（颜色/图标）—— 属于 client，不污染 shared 领域逻辑。
 * 占位美术阶段：按角色最高属性给一个主题色。
 */
import { abilityMod, type FighterRT } from '@battle-pokemon/shared';

const ABILITY_COLOR = {
  str: '#e0533d', // 红
  dex: '#f0c33c', // 黄
  con: '#4a9d5b', // 绿
} as const;

/** 由 fighter 的派生 mod 反推最高属性，取其主题色。 */
export function fighterColor(f: FighterRT): string {
  const s = f.stats;
  const entries: [keyof typeof ABILITY_COLOR, number][] = [
    ['str', s.strMod],
    ['dex', s.dexMod],
    ['con', s.conMod],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return ABILITY_COLOR[entries[0]![0]];
}

/** 由 abilities 取主题色（养成界面用，那里有完整属性）。 */
export function abilityColor(ab: { str: number; dex: number; con: number }): string {
  const entries: [keyof typeof ABILITY_COLOR, number][] = [
    ['str', abilityMod(ab.str)],
    ['dex', abilityMod(ab.dex)],
    ['con', abilityMod(ab.con)],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return ABILITY_COLOR[entries[0]![0]];
}
