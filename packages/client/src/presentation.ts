/**
 * 表现层映射（颜色/图标/sprite）—— 属于 client，不污染 shared 领域逻辑。
 * 角色主题色按最高属性派生；sprite 指向 public/fighters/<id>.webp（缺图回退占位）。
 */
import { abilityMod, type FighterRT } from '@italian-brainrot/shared';

/** 角色姿势（静态图伪动画）：idle 默认；其余按战斗事件切换，缺图回退 idle。 */
export type Pose = 'idle' | 'attack' | 'hit' | 'downed';

/** 战斗中的瞬时姿势表（useBattle 按回放事件维护）：`${team}:${id}` → 姿势。 */
export type PoseMap = Record<string, 'attack' | 'hit'>;

/** 突进表：`攻击者 key` → `目标 key`。单体攻击时攻击者滑到目标面前；AOE/全体/自身原地。 */
export type LungeMap = Record<string, string>;

/** 角色 sprite 路径（public 下，缺图时战场回退 idle → 圆形占位）。 */
export function fighterSprite(archetypeId: string, pose: Pose = 'idle'): string {
  return pose === 'idle' ? `/fighters/${archetypeId}.webp` : `/fighters/${archetypeId}.${pose}.webp`;
}

/** 战场背景图路径（public/backgrounds 下，由 manifest.json 列出可用项）。 */
export function backgroundUrl(name: string): string {
  return `/backgrounds/${name}.webp`;
}

/**
 * 角色一句话简介（选队转盘展示用）。取自 CHARACTERS.md 的形象描述，浓缩成一行。
 * 表现层文案，放 client，不污染 shared。
 */
const BLURB: Record<string, string> = {
  TungSahur: '🥖 持棒球棍的木头人，执拗的催促者 + 钝器打击。',
  CappuccinoAssassino: '☕ 咖啡杯脑袋的武士刺客，双持武士刀，又快又致命。',
  BombardiroCrocodilo: '🐊 鳄鱼身体 + 轰炸机，从天而降的范围重火力。',
  LiriliLarila: '🌵🐘 拄拐杖的仙人掌大象，极致厚血 + 反伤，能静止时间。',
  BrrBrrPatapim: '🌳 树根身体 + 猴脸长鼻的森林精怪，辅助 / 增益型。',
  BombombiniGusini: '🦢💣 鹅 + 战斗机 / 手雷，自爆系，玉石俱焚。',
  TrippiTroppi: '🐱 各种生物的超现实混合体，猫头混沌坦克，赖一条命。',
  BonecaAmbalabu: '🐸🛞 青蛙脑袋 + 轮胎身体 + 人腿，均衡怪力士。',
  FrigoCamelo: '🐪🧊 冰箱 + 骆驼，补给 / 续航型防御，每回合回血。',
  TralaleroTralala: '🦈👟 三条腿穿耐克的蓝鲨鱼，极速突袭，先攻必先手。',
  BallerinaCappuccina: '🩰☕ 咖啡杯头的芭蕾舞女，优雅闪避 + 团队增益。',
  ChimpanziniBananini: '🍌🐒 香蕉壳里的小猩猩，灵巧 + 变形爆发。',
};

/** 取角色一句话简介（中文；英文版见 i18n.tsx 的 blurb()）。 */
export function fighterBlurb(archetypeId: string): string {
  return BLURB[archetypeId] ?? '';
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
