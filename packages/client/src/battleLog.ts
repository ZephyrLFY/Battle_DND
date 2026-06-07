/**
 * 把战斗事件流格式化成跑团风日志行 —— 这是"信息量"的核心：
 * 每次命中/伤害都摊开骰子明细，观众清楚发生了什么、为什么。
 */
import { formatRoll, skillDef, type BattleEvent } from '@battle-pokemon/shared';

const sideName = (s: 'a' | 'b'): string => (s === 'a' ? '我方' : '敌方');

/** 单条事件 → 0~多行日志文本。 */
export function eventToLines(ev: BattleEvent): string[] {
  switch (ev.t) {
    case 'start': {
      const ia = ev.initiative.a;
      const ib = ev.initiative.b;
      return [
        `⚔ 战斗开始！`,
        `🎲 先攻 我方 ${formatRoll(ia)} vs 敌方 ${formatRoll(ib)} → ${sideName(ev.first)}先手`,
      ];
    }
    case 'turn':
      return []; // 回合标记不单独成行，靠界面高亮当前方

    case 'stunned':
      return [`💫 ${sideName(ev.side)} 处于昏迷，跳过这一回合`];

    case 'action': {
      if (ev.action.kind === 'attack') return [`▶ ${sideName(ev.side)} 普通攻击`];
      return [`✦ ${sideName(ev.side)} 使出【${ev.skillName ?? skillDef(ev.action.skill).name}】`];
    }

    case 'hit': {
      const r = ev.roll;
      const dice = `[${r.natural}]${fmtBonus(r.bonus)} = ${r.total}`;
      const tag = r.nat20 ? '（自然20·暴击）' : r.nat1 ? '（自然1·大失败）' : '';
      const verdict = ev.hit ? '命中' : '落空';
      return [`🎲 命中 1d20 ${dice} vs AC ${ev.vsAc} → ${verdict}${tag}`];
    }

    case 'damage': {
      const mit = ev.mitigated > 0 ? `（减伤 ${ev.mitigated}）` : '';
      return [
        `🎲 伤害 ${ev.roll.spec} ${formatRoll(ev.roll)}${mit} → ${sideName(ev.to)} 受到 ${ev.dealt} 点（剩 ${ev.hpLeft}）`,
      ];
    }

    case 'heal':
      return [`💚 ${sideName(ev.side)} 生命汲取 ${ev.roll.spec} ${formatRoll(ev.roll)} → 回复 ${ev.amount}（剩 ${ev.hpLeft}）`];

    case 'thorns':
      return [`🛡 反弹 ${formatRoll(ev.roll)} → ${sideName(ev.to)} 受到 ${ev.dealt}（剩 ${ev.hpLeft}）`];

    case 'buff':
      return [`✨ ${ev.note}`];

    case 'cooldown':
      return [];

    case 'end':
      return [ev.winner === null ? '⚖ 同归于尽！' : `🏁 ${sideName(ev.winner)}获胜！`];
  }
}

function fmtBonus(b: number): string {
  return b === 0 ? '' : b > 0 ? `+${b}` : `${b}`;
}
