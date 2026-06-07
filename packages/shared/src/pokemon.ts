/**
 * 精灵数值模型 —— 移植自原版 legacy/client/petcreating.cpp
 *
 * 数值以原版为基线复刻；明显失衡处做了平衡性调整，每处都用
 * `// 平衡:` 注释标明「原版 → 新版」及理由。
 *
 * 战斗本身是确定性的纯函数（见 battle.ts），本文件只定义"精灵是什么"。
 */

/** 4 种类型。原版用 1/2/3/4 magic number，这里用语义化字符串。 */
export type PokemonType = 'str' | 'fat' | 'def' | 'agi';

export const TYPE_LABEL: Record<PokemonType, string> = {
  str: '力量型',
  fat: '肉盾型',
  def: '防御型',
  agi: '敏捷型',
};

/** 占位美术用的类型主题色（无贴图阶段，Canvas 用纯色块 + 名字）。 */
export const TYPE_COLOR: Record<PokemonType, string> = {
  str: '#e0533d', // 红
  fat: '#4a9d5b', // 绿
  def: '#8b8b8b', // 灰
  agi: '#f0c33c', // 黄
};

/** 一只精灵的派生战斗数值（某个等级下的结果）。 */
export interface Stats {
  atk: number;
  def: number;
  hp: number;
  fullHp: number;
  /** 攻击间隔（秒）。越小攻击越快。 */
  interval: number;
}

/** 原版基础值（1 级、未套类型）：petcreating.cpp pokemon::pokemon()。 */
const BASE = { atk: 15, def: 7, hp: 300, interval: 1.0 } as const;

/** 出生时按类型的一次性修正：petcreating.cpp changetype()。 */
const TYPE_BIRTH: Record<PokemonType, Partial<Stats> & { interval?: number }> = {
  str: { atk: +4, def: -2 },
  fat: { atk: -1, def: +1, hp: +20 },
  def: { atk: -2, def: +3 },
  agi: { atk: +1, def: -1, interval: -0.1 },
};

/**
 * 每级成长：petcreating.cpp lvlup()。
 *
 * 平衡: 原版 fat 每级 +108hp，是其他类型的近 2 倍，导致肉盾型血厚到碾压。
 *       新版把各类型每级 hp 成长拉到同量级，保留"肉盾偏厚"的定位但不离谱。
 *   原版 → 新版：
 *     str hp +62 → +60 ；  fat hp +108 → +75 ；
 *     def hp +60 → +65 ；  agi hp +50 → +50（不变）
 *   atk/def/interval 维持原版，类型定位（str 暴力 / def 双防 / agi 攻速）不动。
 */
const TYPE_GROWTH: Record<PokemonType, Stats> = {
  str: { atk: +12, def: +5, hp: +60, fullHp: +60, interval: 0 },
  fat: { atk: +7, def: +6, hp: +75, fullHp: +75, interval: 0 },
  def: { atk: +7, def: +7, hp: +65, fullHp: +65, interval: 0 },
  agi: { atk: +8, def: +5, hp: +50, fullHp: +50, interval: -0.03 },
};

export const MAX_LEVEL = 15;

/** 升到 `level` 级所需累计经验的"每级阈值"：原版 upornot() 用 exp >= 5*level。 */
export const expToLevelUp = (level: number): number => 5 * level;

/** 击败一只 `level` 级精灵获得的经验：原版 gain() = 10*level。 */
export const expGainFor = (level: number): number => 10 * level;

/** 每种类型的技能（特性）定义。具体效果在 battle.ts 的伤害管线里实现。 */
export type SkillKind = 'brave' | 'lifesteal' | 'stone' | 'stun';

export const TYPE_SKILL: Record<PokemonType, { kind: SkillKind; name: string }> = {
  str: { kind: 'brave', name: '英勇打击' }, // 接下来数回合普攻附加真伤
  fat: { kind: 'lifesteal', name: '生命汲取' }, // 立即回血
  def: { kind: 'stone', name: '石化表皮' }, // 接下来数回合减伤
  agi: { kind: 'stun', name: '眩晕' }, // 使对方下两回合无法攻击
};

/** 12 只精灵的静态定义：name + type + 战斗喊话。 */
export interface SpeciesDef {
  name: string;
  type: PokemonType;
  cry: string; // 普攻时的喊话（原版 attack() 返回值）
}

export const SPECIES: Record<string, SpeciesDef> = {
  Hitmonlee: { name: 'Hitmonlee', type: 'str', cry: 'Hit!' },
  Charmander: { name: 'Charmander', type: 'str', cry: 'Fire!' },
  Squirtle: { name: 'Squirtle', type: 'str', cry: 'Taste my water!' },
  Licktung: { name: 'Licktung', type: 'fat', cry: 'Lick, lick!' },
  Muk: { name: 'Muk', type: 'fat', cry: 'Eat my gross muk!' },
  Krabby: { name: 'Krabby', type: 'fat', cry: 'No one can live under my claw!' },
  Geodude: { name: 'Geodude', type: 'def', cry: 'Stone power!' },
  Shellder: { name: 'Shellder', type: 'def', cry: 'Shield smash!' },
  Onix: { name: 'Onix', type: 'def', cry: 'You will die for your arrogance!' },
  Bulbasaur: { name: 'Bulbasaur', type: 'agi', cry: 'Eat my seed!' },
  Pidgeotto: { name: 'Pidgeotto', type: 'agi', cry: 'Can you defend my air attack?' },
  Pikachu: { name: 'Pikachu', type: 'agi', cry: 'Pika pika!' },
};

export const SPECIES_NAMES = Object.keys(SPECIES);

/** 一只精灵的可序列化实例（存库 / 上线传输用）。 */
export interface PokemonInstance {
  species: string;
  level: number;
  exp: number;
}

/**
 * 计算某只精灵在给定等级的派生数值。
 * 复刻原版：构造时套一次 changetype，再 lvlup (level-1) 次。
 * 注意原版每次 lvlup 都回满血，所以满级数值 = 基础 + 出生修正 + 成长×(level-1)。
 */
export function computeStats(species: string, level: number): Stats {
  const def = SPECIES[species];
  if (!def) throw new Error(`Unknown species: ${species}`);
  const lvl = clampLevel(level);
  const birth = TYPE_BIRTH[def.type];
  const growth = TYPE_GROWTH[def.type];

  let atk = BASE.atk + (birth.atk ?? 0);
  let dfn = BASE.def + (birth.def ?? 0);
  let hp = BASE.hp + (birth.hp ?? 0);
  let interval = BASE.interval + (birth.interval ?? 0);

  for (let i = 1; i < lvl; i++) {
    atk += growth.atk;
    dfn += growth.def;
    hp += growth.hp;
    interval += growth.interval;
  }

  return { atk, def: dfn, hp, fullHp: hp, interval: round2(interval) };
}

export function clampLevel(level: number): number {
  if (level < 1) return 1;
  if (level > MAX_LEVEL) return MAX_LEVEL;
  return Math.floor(level);
}

export function speciesType(species: string): PokemonType {
  const def = SPECIES[species];
  if (!def) throw new Error(`Unknown species: ${species}`);
  return def.type;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
