/**
 * 把战斗事件流格式化成跑团风日志行 —— 摊开每次掷骰，观众清楚发生了什么。
 *
 * 事件用 FighterRef（team+id）引用角色；我方=a，敌方=b。
 * 双语：按传入 lang 输出；事件本身语言中立（动态 note 由 shared 带 noteEn）。
 * 注意：调用方持有 BattleEvent[] 并在渲染时格式化 → 切换语言历史日志也会跟着切。
 */
import { formatRoll, isSkillId, type BattleEvent, type FighterRef } from '@italian-brainrot/shared';
import { skillName, FLAT_SPEC_EN, type Lang } from './i18n.js';

const teamLabel = (team: 'a' | 'b', lang: Lang): string =>
  lang === 'en' ? (team === 'a' ? 'Ally' : 'Enemy') : team === 'a' ? '我方' : '敌方';
const who = (r: FighterRef, lang: Lang): string => `${teamLabel(r.team, lang)} ${r.id}`;

/** 伤害骰 spec：被动 flat 伤害用中文标签（'敲击' 等），英文日志映射翻译；普通 '1d6' 原样。 */
const spec = (s: string, lang: Lang): string => (lang === 'en' ? (FLAT_SPEC_EN[s] ?? s) : s);

/** 单条事件 → 0~多行日志文本。 */
export function eventToLines(ev: BattleEvent, lang: Lang = 'zh'): string[] {
  const en = lang === 'en';
  switch (ev.t) {
    case 'start':
      return [en ? '⚔ Battle begins!' : '⚔ 战斗开始！'];

    case 'turn':
      return []; // 回合标记靠界面高亮，不单独成行

    case 'skip': {
      const why = ev.why === 'downed' ? (en ? 'down' : '倒地') : en ? 'stunned' : '昏迷';
      return [en ? `💫 ${who(ev.who, lang)} is ${why}, turn skipped` : `💫 ${who(ev.who, lang)} ${why}，跳过这一回合`];
    }

    case 'action': {
      if (ev.action.kind === 'attack')
        return [en ? `▶ ${who(ev.who, lang)} attacks` : `▶ ${who(ev.who, lang)} 普通攻击`];
      const name = isSkillId(ev.action.skill) ? skillName(ev.action.skill, lang) : (ev.skillName ?? ev.action.skill);
      return [en ? `✦ ${who(ev.who, lang)} uses [${name}]` : `✦ ${who(ev.who, lang)} 使出【${name}】`];
    }

    case 'energy':
      // 只在消耗（放技能）时记日志；普攻/闪避 +1 攒能量不刷屏
      return ev.spent
        ? [en
            ? `⚡ ${who(ev.who, lang)} spends ${-ev.delta} energy (${ev.now} left)`
            : `⚡ ${who(ev.who, lang)} 消耗 ${-ev.delta} 能量（剩 ${ev.now}）`]
        : [];

    case 'hit': {
      const r = ev.roll;
      const dice = `[${r.natural}]${fmtBonus(r.bonus)} = ${r.total}`;
      const tag = r.nat20 ? (en ? ' (nat 20 · crit!)' : '（自然20·暴击）') : r.nat1 ? (en ? ' (nat 1 · fumble)' : '（自然1·大失败）') : '';
      return [en
        ? `🎲 To hit 1d20 ${dice} vs AC ${ev.vsAc} → ${ev.hit ? 'HIT' : 'MISS'}${tag}`
        : `🎲 命中 1d20 ${dice} vs AC ${ev.vsAc} → ${ev.hit ? '命中' : '落空'}${tag}`];
    }

    case 'damage': {
      const mit = ev.mitigated > 0 ? (en ? ` (−${ev.mitigated} mitigated)` : `（减伤 ${ev.mitigated}）`) : '';
      return [en
        ? `🎲 Damage ${spec(ev.roll.spec, lang)} ${formatRoll(ev.roll)}${mit} → ${who(ev.to, lang)} takes ${ev.dealt} (${ev.hpLeft} HP left)`
        : `🎲 伤害 ${ev.roll.spec} ${formatRoll(ev.roll)}${mit} → ${who(ev.to, lang)} 受到 ${ev.dealt} 点（剩 ${ev.hpLeft}）`];
    }

    case 'lifesteal':
      return [en
        ? `💚 ${who(ev.who, lang)} drains ${ev.amount} HP (${ev.hpLeft} HP)`
        : `💚 ${who(ev.who, lang)} 吸血回复 ${ev.amount}（剩 ${ev.hpLeft}）`];

    case 'heal':
      return [en
        ? `💚 ${who(ev.who, lang)} heals ${formatRoll(ev.roll)} → +${ev.amount} (${ev.hpLeft} HP)`
        : `💚 ${who(ev.who, lang)} 回复 ${formatRoll(ev.roll)} → ${ev.amount}（剩 ${ev.hpLeft}）`];

    case 'thorns':
      return [en
        ? `🛡 Thorns ${formatRoll(ev.roll)} → ${who(ev.to, lang)} takes ${ev.dealt} (${ev.hpLeft} HP)`
        : `🛡 反弹 ${formatRoll(ev.roll)} → ${who(ev.to, lang)} 受到 ${ev.dealt}（剩 ${ev.hpLeft}）`];

    case 'buff':
      return [`✨ ${en ? (ev.noteEn ?? ev.note) : ev.note}`];

    case 'stack':
      return []; // 被动计数变化由战场徽章/面板 pill 可视化，不产生日志行

    case 'downed':
      return [en ? `⬇ ${who(ev.who, lang)} goes down!` : `⬇ ${who(ev.who, lang)} 倒地！`];

    case 'revive':
      return [en
        ? `✟ ${who(ev.who, lang)} is back up (${ev.hpLeft} HP)`
        : `✟ ${who(ev.who, lang)} 被救起（剩 ${ev.hpLeft}）`];

    case 'dead':
      return [en ? `☠ ${who(ev.who, lang)} is dead` : `☠ ${who(ev.who, lang)} 阵亡`];

    case 'end':
      if (ev.winner === null) return [en ? '⚖ Mutual destruction!' : '⚖ 双方全灭！'];
      return [en ? `🏁 ${teamLabel(ev.winner, lang)} team wins!` : `🏁 ${teamLabel(ev.winner, lang)}获胜！`];
  }
}

function fmtBonus(b: number): string {
  return b === 0 ? '' : b > 0 ? `+${b}` : `${b}`;
}
