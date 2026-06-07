/**
 * 确定性随机数 —— mulberry32。
 *
 * 原版用 qsrand/qrand + 当前时间种子，不可复现、不可测试。
 * 新版战斗引擎要求确定性：同样的种子 + 同样的双方精灵 => 同样的战斗。
 * 这样战斗既能服务端权威计算，又能在前端用同一种子原样回放，还能写单测。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // 保证种子落在 32 位无符号整数范围
    this.state = seed >>> 0;
  }

  /** [0, 1) 浮点。 */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 闭区间整数。 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 概率 p（0..1）命中。 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** 导出当前内部游标（用于序列化战斗状态 / PvP 权威态恢复）。 */
  get cursor(): number {
    return this.state >>> 0;
  }

  /** 从导出的游标恢复，使后续序列与导出点完全一致。 */
  set cursor(value: number) {
    this.state = value >>> 0;
  }
}
