/**
 * 表现层映射（颜色/图标/sprite）—— 属于 client，不污染 shared 领域逻辑。
 * 角色主题色按最高属性派生；sprite 指向 public/fighters/<id>.webp（缺图回退占位）。
 */
import { abilityMod, type FighterRT } from '@battle-pokemon/shared';

/** 角色 sprite 路径（public 下，缺图时战场回退圆形占位）。 */
export function fighterSprite(archetypeId: string): string {
  return `/fighters/${archetypeId}.webp`;
}

/**
 * 每个角色 sprite 的「原生朝向」——图里角色本来面朝哪边。
 * 战场要让所有角色朝向中线（a 队朝右 / b 队朝左）；原生朝向 ≠ 目标朝向时水平翻转。
 * 'front' = 正面图，不翻转（朝哪队都不违和）。
 */
export type Facing = 'left' | 'right' | 'front';
const NATIVE_FACING: Record<string, Facing> = {
  // 朝左
  BombardiroCrocodilo: 'left',
  BombombiniGusini: 'left',
  FrigoCamelo: 'left',
  TralaleroTralala: 'left',
  TungSahur: 'left',
  // 正面
  CappuccinoAssassino: 'front',
  // 其余朝右
  LiriliLarila: 'right',
  BrrBrrPatapim: 'right',
  TrippiTroppi: 'right',
  BonecaAmbalabu: 'right',
  BallerinaCappuccina: 'right',
  ChimpanziniBananini: 'right',
};

export function nativeFacing(archetypeId: string): Facing {
  return NATIVE_FACING[archetypeId] ?? 'front';
}

/**
 * 该角色在战场上是否需要水平翻转。
 * want：队伍期望朝向（a 队→'right' 朝中线，b 队→'left'）。
 * 正面图不翻；原生朝向与期望相反才翻。
 */
export function shouldFlip(archetypeId: string, want: 'left' | 'right'): boolean {
  const native = nativeFacing(archetypeId);
  if (native === 'front') return false;
  return native !== want;
}

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
