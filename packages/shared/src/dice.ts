/**
 * 掷骰工具 —— 走确定性 RNG（rng.ts），可单测、可在 PvP 权威态复现。
 *
 * 战斗里每次掷骰都返回明细（掷了哪几个、调整值、总和、是否自然20/1），
 * 这样事件流能渲染成跑团风日志："🎲 1d20+5 = [14]+5 = 19"。
 */
import type { Rng } from './rng.js';

/** 一次掷骰的完整明细。 */
export interface RollDetail {
  /** 骰子规格，如 "2d6"、"1d20"。 */
  spec: string;
  /** 每颗骰子的点数。 */
  rolls: number[];
  /** 调整值（可正可负）。 */
  bonus: number;
  /** 总和 = sum(rolls) + bonus。 */
  total: number;
}

/** 掷一颗 d{sides}，返回 1..sides。 */
export function die(rng: Rng, sides: number): number {
  return rng.int(1, sides);
}

/** 掷一颗 d20。 */
export function d20(rng: Rng): number {
  return rng.int(1, 20);
}

/**
 * 解析并掷骰，如 roll(rng, "2d6", 3) => 掷两颗 d6 + 3。
 * spec 形如 "NdM"，N 省略视为 1（"d20" = "1d20"）。
 */
export function roll(rng: Rng, spec: string, bonus = 0): RollDetail {
  const m = /^(\d*)d(\d+)$/.exec(spec.trim());
  if (!m) throw new Error(`Invalid dice spec: ${spec}`);
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2]!, 10);
  if (count < 1 || sides < 1) throw new Error(`Invalid dice spec: ${spec}`);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rng.int(1, sides));
  const total = rolls.reduce((a, b) => a + b, 0) + bonus;
  return { spec, rolls, bonus, total };
}

/** 把骰面数量翻倍（5e 暴击：1d6 → 2d6）。仅支持 NdM。 */
export function doubleDice(spec: string): string {
  const m = /^(\d*)d(\d+)$/.exec(spec.trim());
  if (!m) throw new Error(`Invalid dice spec: ${spec}`);
  const count = m[1] ? parseInt(m[1], 10) : 1;
  return `${count * 2}d${m[2]}`;
}

/** 一次 d20 命中检定的结果。 */
export interface AttackRoll {
  natural: number; // 原始 d20 点数（用于判自然20/1）
  bonus: number;
  total: number;
  nat20: boolean;
  nat1: boolean;
}

/** 普通 d20 检定（命中）：1d20 + bonus，标记自然20/1。 */
export function attackRoll(rng: Rng, bonus: number): AttackRoll {
  const natural = d20(rng);
  return makeAttackRoll(natural, bonus);
}

/** 优势：掷 2d20 取高。劣势：取低。用于"精准瞄准"等技能。 */
export function attackRollAdvantage(rng: Rng, bonus: number, kind: 'adv' | 'dis'): AttackRoll {
  const r1 = d20(rng);
  const r2 = d20(rng);
  const natural = kind === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2);
  return makeAttackRoll(natural, bonus);
}

function makeAttackRoll(natural: number, bonus: number): AttackRoll {
  return {
    natural,
    bonus,
    total: natural + bonus,
    nat20: natural === 20,
    nat1: natural === 1,
  };
}

/** 把掷骰明细格式化成跑团风文本片段，如 "[5,6]+3 = 14"。 */
export function formatRoll(r: RollDetail): string {
  const dice = `[${r.rolls.join(',')}]`;
  const b = r.bonus === 0 ? '' : r.bonus > 0 ? `+${r.bonus}` : `${r.bonus}`;
  return `${dice}${b} = ${r.total}`;
}
