/**
 * 把战斗事件流格式化成跑团风日志行 —— 摊开每次掷骰，观众清楚发生了什么。
 *
 * 事件用 FighterRef（team+id）引用角色；我方=a，敌方=b。
 * id 即 archetypeId（队内唯一），直接当显示名。
 */
import { formatRoll, type BattleEvent, type FighterRef } from '@italian-brainrot/shared';

const teamLabel = (team: 'a' | 'b'): string => (team === 'a' ? '我方' : '敌方');
const who = (r: FighterRef): string => `${teamLabel(r.team)} ${r.id}`;

/** 单条事件 → 0~多行日志文本。 */
export function eventToLines(ev: BattleEvent): string[] {
  switch (ev.t) {
    case 'start':
      return ['⚔ 战斗开始！'];

    case 'turn':
      return []; // 回合标记靠界面高亮，不单独成行

    case 'skip':
      return [`💫 ${who(ev.who)} ${ev.why === 'downed' ? '倒地' : '昏迷'}，跳过这一回合`];

    case 'action': {
      if (ev.action.kind === 'attack') return [`▶ ${who(ev.who)} 普通攻击`];
      return [`✦ ${who(ev.who)} 使出【${ev.skillName ?? ev.action.skill}】`];
    }

    case 'energy':
      // 只在消耗（放技能）时记日志；普攻 +1 攒能量不刷屏
      return ev.spent ? [`⚡ ${who(ev.who)} 消耗 ${-ev.delta} 能量（剩 ${ev.now}）`] : [];

    case 'hit': {
      const r = ev.roll;
      const dice = `[${r.natural}]${fmtBonus(r.bonus)} = ${r.total}`;
      const tag = r.nat20 ? '（自然20·暴击）' : r.nat1 ? '（自然1·大失败）' : '';
      return [`🎲 命中 1d20 ${dice} vs AC ${ev.vsAc} → ${ev.hit ? '命中' : '落空'}${tag}`];
    }

    case 'damage': {
      const mit = ev.mitigated > 0 ? `（减伤 ${ev.mitigated}）` : '';
      return [
        `🎲 伤害 ${ev.roll.spec} ${formatRoll(ev.roll)}${mit} → ${who(ev.to)} 受到 ${ev.dealt} 点（剩 ${ev.hpLeft}）`,
      ];
    }

    case 'lifesteal':
      return [`💚 ${who(ev.who)} 吸血回复 ${ev.amount}（剩 ${ev.hpLeft}）`];

    case 'heal':
      return [`💚 ${who(ev.who)} 回复 ${formatRoll(ev.roll)} → ${ev.amount}（剩 ${ev.hpLeft}）`];

    case 'thorns':
      return [`🛡 反弹 ${formatRoll(ev.roll)} → ${who(ev.to)} 受到 ${ev.dealt}（剩 ${ev.hpLeft}）`];

    case 'buff':
      return [`✨ ${ev.note}`];

    case 'downed':
      return [`⬇ ${who(ev.who)} 倒地！`];

    case 'revive':
      return [`✟ ${who(ev.who)} 被救起（剩 ${ev.hpLeft}）`];

    case 'dead':
      return [`☠ ${who(ev.who)} 阵亡`];

    case 'end':
      return [ev.winner === null ? '⚖ 双方全灭！' : `🏁 ${teamLabel(ev.winner)}获胜！`];
  }
}

function fmtBonus(b: number): string {
  return b === 0 ? '' : b > 0 ? `+${b}` : `${b}`;
}
