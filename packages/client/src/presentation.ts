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

/** 取角色一句话简介（无则空串）。 */
export function fighterBlurb(archetypeId: string): string {
  return BLURB[archetypeId] ?? '';
}

/**
 * 角色被动的展示文案（逻辑在 shared/passives.ts，这里只管 UI 描述；与 CHARACTERS.md 同步）。
 * 养成页用：被动天生自带、不占技能栏，玩家配技能前应该先看到它。
 */
const PASSIVE_INFO: Record<string, { name: string; desc: string }> = {
  TungSahur: {
    name: '不眠的梆子',
    desc: '普攻命中叠 1 层「敲击」（每层伤害 +1，最多 3 层）；一整回合没出手则清空。连续敲打，越打越狠。',
  },
  CappuccinoAssassino: {
    name: '咖啡与舞伴',
    desc: '队伍中 Ballerina Cappuccina 存活时全属性 ×1.3；BC 阵亡后 ×1.5（为爱复仇）；攻击敌方 BC 时伤害 ×0.9（下不去手）。',
  },
  BombardiroCrocodilo: {
    name: '装甲蒙皮',
    desc: '常驻减伤 1（每次受击减免 1 点伤害）。',
  },
  LiriliLarila: {
    name: '仙人掌尖刺',
    desc: '常驻反伤：被命中时反弹 1 点伤害给攻击者。',
  },
  BrrBrrPatapim: {
    name: '林间回响',
    desc: '任意友方释放增益/治疗类技能时，免费为该友方回复 1d4（森林的回声）。',
  },
  BombombiniGusini: {
    name: '引信',
    desc: '每次受击叠 1 层「火药」；下一个耗能技能每层 +2 伤害，释放后清空（一次性引爆）。',
  },
  TrippiTroppi: {
    name: '九命怪猫',
    desc: '首次被打至倒地时不倒，改以 25% 最大生命存活并清除负面，同时炸毛反扑（固定总伤由存活敌人分摊）。整场仅一次。',
  },
  BonecaAmbalabu: {
    name: '轮胎滚压',
    desc: '普攻暴击时额外造成一段碾压伤害。',
  },
  FrigoCamelo: {
    name: '冷藏续航',
    desc: '每回合开始回复 1d6 生命。',
  },
  TralaleroTralala: {
    name: '三足疾行',
    desc: '先攻 +5（大概率先手，但不绝对）。',
  },
  BallerinaCappuccina: {
    name: '为舞伴起舞',
    desc: '自身释放的所有增益效果（含治疗术）对 Cappuccino Assassino 效果增强。',
  },
  ChimpanziniBananini: {
    name: '香蕉外壳',
    desc: 'HP 首次跌破 75% / 50% / 25% 各破壳一次：每次 +3 能量并获得当回合减伤。',
  },
};

/** 取角色被动的名称与描述（无则 undefined）。 */
export function fighterPassive(archetypeId: string): { name: string; desc: string } | undefined {
  return PASSIVE_INFO[archetypeId];
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
