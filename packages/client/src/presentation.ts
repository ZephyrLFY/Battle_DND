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

/** 浮动战斗文字（跳字）：useBattle 按回放事件生成，BattleStage 上浮渐隐绘制。 */
export interface FloatFx {
  /** 自增 id（渲染 key + 横向错位用）。 */
  id: number;
  /** 目标角色 `${team}:${id}`。 */
  key: string;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'miss';
  /** 出生时间（performance.now()）。 */
  at: number;
}

/** 部署基础路径（GitHub Pages 等子路径部署时 ≠ '/'）。Vite 注入，恒以 '/' 结尾。 */
export const BASE = import.meta.env.BASE_URL;

/** 角色 sprite 路径（public 下，缺图时战场回退 idle → 圆形占位）。 */
export function fighterSprite(archetypeId: string, pose: Pose = 'idle'): string {
  return pose === 'idle' ? `${BASE}fighters/${archetypeId}.webp` : `${BASE}fighters/${archetypeId}.${pose}.webp`;
}

/** 战场背景图路径（public/backgrounds 下，由 manifest.json 列出可用项）。 */
export function backgroundUrl(name: string): string {
  return `${BASE}backgrounds/${name}.webp`;
}

// ─────────────────────────────────────────────────────────────────────────
// 被动计数可视化：passiveState 里的特殊计数 → 战场徽章 / 面板文字。
// 新增可视化计数时在 STACK_DEFS 加一条即可（战场 pill 和队伍面板自动生效）。
// ─────────────────────────────────────────────────────────────────────────

/** 一条被动计数徽章（n 已经过 value 变换，>0 才会返回）。 */
export interface StackBadge {
  icon: string;
  n: number;
  label: string;
  labelEn: string;
  /** 悬停简要说明（该计数的机制一句话）。 */
  desc: string;
  descEn: string;
}

const STACK_DEFS: {
  /** 只有该 archetype 显示（passiveState 是通用容器，必须按拥有者过滤）。 */
  owner: string;
  key: string;
  icon: string;
  label: string;
  labelEn: string;
  desc: string;
  descEn: string;
  /** 原始值 → 显示值（如九命：0=未用 → 显示 1 条命；1=已用 → 不显示）。 */
  value?: (n: number) => number;
}[] = [
  {
    owner: 'TungSahur', key: 'tung.hits', icon: '🥁',
    label: '敲击层数', labelEn: 'Drum stacks',
    desc: '命中时每层追加 1 点伤害，随后 +1 层（上限 3）；一整回合未出手或释放签名连打后清空。',
    descEn: 'Each hit deals +1 damage per stack, then gains a stack (max 3); resets after an idle turn or the signature combo.',
  },
  {
    owner: 'BombombiniGusini', key: 'bombombini.gunpowder', icon: '🧨',
    label: '火药层数', labelEn: 'Gunpowder stacks',
    desc: '受击 +1 层；下一个耗能技能命中时每层 +2 伤害，释放后引爆清空。',
    descEn: 'Gains a stack when hit; next energy skill adds +2 damage per stack on hit, then detonates all.',
  },
  {
    owner: 'TrippiTroppi', key: 'trippi.ninthUsed', icon: '🐱',
    label: '九命待发', labelEn: 'Nine lives ready',
    desc: '首次被打至倒地时不倒，以 15% 生命存活并清除负面（整场一次）。',
    descEn: 'First time going down: stays up at 15% HP and clears debuffs (once per battle).',
    value: (n) => (n > 0 ? 0 : 1),
  },
];

/** 该角色当前应显示的被动计数徽章（值为 0 的不显示）。 */
export function stackBadges(f: Pick<FighterRT, 'archetypeId' | 'passiveState'>): StackBadge[] {
  const out: StackBadge[] = [];
  for (const d of STACK_DEFS) {
    if (d.owner !== f.archetypeId) continue;
    const raw = f.passiveState[d.key] ?? 0;
    const n = d.value ? d.value(raw) : raw;
    if (n > 0) out.push({ icon: d.icon, n, label: d.label, labelEn: d.labelEn, desc: d.desc, descEn: d.descEn });
  }
  return out;
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
