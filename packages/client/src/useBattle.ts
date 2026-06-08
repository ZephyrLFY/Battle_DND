/**
 * 回合制战斗 hook —— 驱动 shared 的 NvN 状态机（当前 client 用 1v1：每方 1 个角色）。
 *
 * 玩家固定是 a 队，敌方 b 由随机 AI 操作。玩家选动作 → 推进 → 若轮到 b，
 * 自动用 AI 选动作推进（带小延迟，让日志逐行出）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBattle,
  applyAction,
  allActions,
  chooseAction,
  isOver,
  currentFighter,
  type Action,
  type ActionOption,
  type BattleState,
  type BattleEvent,
  type Combatant,
} from '@battle-pokemon/shared';
import { eventToLines } from './battleLog.js';

const AI_DELAY_MS = 700;

export interface UseBattle {
  state: BattleState | null;
  log: string[];
  myTurn: boolean;
  actions: ActionOption[]; // 玩家(a队当前角色)的全部动作选项，含不可用
  mySlots: number;
  finished: boolean;
  winner: 'a' | 'b' | null;
  start: (me: Combatant, enemy: Combatant, seed: number) => void;
  act: (action: Action) => void;
}

export function useBattle(): UseBattle {
  const [state, setState] = useState<BattleState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const seedRef = useRef(0);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendEvents = useCallback((events: BattleEvent[]) => {
    const lines = events.flatMap(eventToLines);
    if (lines.length) setLog((prev) => [...prev, ...lines]);
  }, []);

  const start = useCallback(
    (me: Combatant, enemy: Combatant, seed: number) => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      seedRef.current = seed;
      const { state: s0, events } = createBattle([me], [enemy], seed);
      setLog([]);
      appendEvents(events);
      setState(s0);
    },
    [appendEvents],
  );

  const step = useCallback(
    (cur: BattleState, action: Action): BattleState => {
      const { state: ns, events } = applyAction(cur, action);
      appendEvents(events);
      return ns;
    },
    [appendEvents],
  );

  const act = useCallback(
    (action: Action) => {
      setState((cur) => {
        if (!cur || isOver(cur) || currentFighter(cur)?.team !== 'a') return cur;
        return step(cur, action);
      });
    },
    [step],
  );

  // 轮到 AI（b 队）且未结束 → 自动延时推进
  useEffect(() => {
    if (!state || isOver(state) || currentFighter(state)?.team !== 'b') return;
    aiTimer.current = setTimeout(() => {
      setState((cur) => {
        if (!cur || isOver(cur) || currentFighter(cur)?.team !== 'b') return cur;
        const aiSeed = (seedRef.current * 2654435761 + cur.round * 40503 + cur.turnIndex) >>> 0;
        return step(cur, chooseAction(cur, aiSeed));
      });
    }, AI_DELAY_MS);
    return () => void (aiTimer.current && clearTimeout(aiTimer.current));
  }, [state, step]);

  useEffect(() => () => void (aiTimer.current && clearTimeout(aiTimer.current)), []);

  const finished = state ? isOver(state) : false;
  const cur = state ? currentFighter(state) : undefined;
  const myTurn = !!state && !finished && cur?.team === 'a';
  // 始终返回 a 队角色的动作选项，布局稳定（不随回合横跳）
  const myFighter = state?.teams.a[0];
  const actions = state && !finished && myFighter ? allActions(state, { team: 'a', id: myFighter.id }) : [];
  const mySlots = myFighter?.slots ?? 0;
  const winner = (state?.winner ?? null) as 'a' | 'b' | null;

  return { state, log, myTurn, actions, mySlots, finished, winner, start, act };
}
