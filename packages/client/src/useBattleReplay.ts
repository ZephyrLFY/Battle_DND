import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleEvent, BattleResult, FighterPublic, Side } from '@battle-pokemon/shared';

/** 回放过程中某一方的渲染状态。 */
export interface SideView {
  info: FighterPublic;
  hp: number;
  /** 最近一次飘字（伤害/闪避/暴击/回血），给 Canvas 做浮动文字。带递增 id 触发动画。 */
  floating: { id: number; text: string; kind: 'dmg' | 'crit' | 'dodge' | 'heal' | 'stun' } | null;
}

export interface ReplayState {
  a: SideView | null;
  b: SideView | null;
  log: string[];
  finished: boolean;
  winner: Side | null;
  playing: boolean;
}

const STEP_MS = 600; // 每个事件之间的间隔，肉眼可跟

/**
 * 把战斗事件流回放成随时间推进的渲染状态。
 * 纯展示：不重算任何数值，只消费引擎给的 events。
 */
export function useBattleReplay(result: BattleResult | null) {
  const [state, setState] = useState<ReplayState>(emptyState());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);
  const floatIdRef = useRef(0);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    idxRef.current = 0;
    setState(emptyState());
  }, []);

  const start = useCallback(() => {
    if (!result) return;
    reset();
    setState((s) => ({ ...s, playing: true }));
    // 用 ref 在闭包里逐个推进事件
    const tick = () => {
      const events = result.events;
      if (idxRef.current >= events.length) {
        setState((s) => ({ ...s, playing: false, finished: true }));
        return;
      }
      const ev = events[idxRef.current++]!;
      setState((prev) => applyEvent(prev, ev, () => ++floatIdRef.current));
      timerRef.current = setTimeout(tick, STEP_MS);
    };
    tick();
  }, [result, reset]);

  useEffect(() => () => void (timerRef.current && clearTimeout(timerRef.current)), []);

  return { state, start, reset };
}

function emptyState(): ReplayState {
  return { a: null, b: null, log: [], finished: false, winner: null, playing: false };
}

function applyEvent(prev: ReplayState, ev: BattleEvent, nextFloatId: () => number): ReplayState {
  switch (ev.t) {
    case 'start':
      return {
        a: { info: ev.a, hp: ev.a.fullHp, floating: null },
        b: { info: ev.b, hp: ev.b.fullHp, floating: null },
        log: ['战斗开始！'],
        finished: false,
        winner: null,
        playing: true,
      };

    case 'attack': {
      const name = sideName(prev, ev.by);
      const text = ev.skill ? `${name} 使出【${ev.skill}】！「${ev.cry}」` : `${name}：「${ev.cry}」`;
      return { ...prev, log: pushLog(prev.log, text) };
    }

    case 'damage': {
      const target = ev.to;
      const view = sideOf(prev, target);
      if (!view) return prev;
      const floating = ev.dodged
        ? ({ id: nextFloatId(), text: '闪避!', kind: 'dodge' } as const)
        : ev.crit
          ? ({ id: nextFloatId(), text: `暴击 -${ev.amount}`, kind: 'crit' } as const)
          : ({ id: nextFloatId(), text: `-${ev.amount}`, kind: 'dmg' } as const);
      const logText = ev.dodged
        ? `${sideName(prev, target)} 闪避了攻击！`
        : `${sideName(prev, target)} 受到 ${ev.amount} 点伤害${ev.crit ? '（暴击）' : ''}。`;
      return {
        ...prev,
        ...setSide(prev, target, { ...view, hp: ev.hpLeft, floating }),
        log: pushLog(prev.log, logText),
      };
    }

    case 'heal': {
      const view = sideOf(prev, ev.who);
      if (!view) return prev;
      return {
        ...prev,
        ...setSide(prev, ev.who, {
          ...view,
          hp: ev.hpLeft,
          floating: { id: nextFloatId(), text: `+${ev.amount}`, kind: 'heal' },
        }),
        log: pushLog(prev.log, `${sideName(prev, ev.who)} 回复了 ${ev.amount} 点生命。`),
      };
    }

    case 'stunned': {
      const view = sideOf(prev, ev.who);
      if (!view) return prev;
      return {
        ...prev,
        ...setSide(prev, ev.who, {
          ...view,
          floating: { id: nextFloatId(), text: '眩晕!', kind: 'stun' },
        }),
        log: pushLog(prev.log, `${sideName(prev, ev.who)} 被眩晕，无法行动！`),
      };
    }

    case 'buff': {
      const label = ev.kind === 'brave' ? '进入英勇状态' : '石化护体';
      return { ...prev, log: pushLog(prev.log, `${sideName(prev, ev.who)} ${label}。`) };
    }

    case 'end':
      return {
        ...prev,
        finished: true,
        playing: false,
        winner: ev.winner,
        log: pushLog(prev.log, endText(prev, ev.winner)),
      };
  }
}

const pushLog = (log: string[], line: string): string[] => [...log, line].slice(-50);

function sideOf(s: ReplayState, side: Side): SideView | null {
  return side === 'a' ? s.a : s.b;
}

function setSide(s: ReplayState, side: Side, view: SideView): Partial<ReplayState> {
  return side === 'a' ? { a: view } : { b: view };
}

function sideName(s: ReplayState, side: Side): string {
  const v = sideOf(s, side);
  const who = side === 'a' ? '我方' : '敌方';
  return v ? `${who} ${v.info.species}` : who;
}

function endText(s: ReplayState, winner: Side | null): string {
  if (winner === null) return '同归于尽！';
  return winner === 'a' ? '🎉 我方获胜！' : '💀 我方落败……';
}
