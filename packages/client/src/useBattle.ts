/**
 * 回合制战斗 hook —— 驱动 shared 的状态机。
 *
 * 玩家固定是 a 方，敌方 b 由随机 AI 操作。玩家选动作 → 推进 a 回合 →
 * 若轮到 b，自动用 AI 选动作推进（带小延迟，让日志逐行出，有节奏感）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBattle,
  applyAction,
  legalActions,
  chooseAction,
  isOver,
  type Action,
  type BattleState,
  type BattleEvent,
  type PokemonInstance,
} from '@battle-pokemon/shared';
import { eventToLines } from './battleLog.js';

const AI_DELAY_MS = 700;

export interface UseBattle {
  state: BattleState | null;
  log: string[];
  myTurn: boolean;
  actions: Action[]; // 玩家当前可选动作（仅当 myTurn）
  finished: boolean;
  winner: 'a' | 'b' | null;
  start: (me: PokemonInstance, enemy: PokemonInstance, seed: number) => void;
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
    (me: PokemonInstance, enemy: PokemonInstance, seed: number) => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      seedRef.current = seed;
      const { state: s0, events } = createBattle(me, enemy, seed);
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
        if (!cur || isOver(cur) || cur.turn !== 'a') return cur;
        return step(cur, action);
      });
    },
    [step],
  );

  // 当轮到 AI（b 方）且未结束，自动延时推进
  useEffect(() => {
    if (!state || isOver(state) || state.turn !== 'b') return;
    aiTimer.current = setTimeout(() => {
      setState((cur) => {
        if (!cur || isOver(cur) || cur.turn !== 'b') return cur;
        // 每步用递增种子，避免每回合相同选择
        const aiSeed = (seedRef.current * 2654435761 + cur.round * 40503) >>> 0;
        const action = chooseAction(cur, aiSeed);
        return step(cur, action);
      });
    }, AI_DELAY_MS);
    return () => void (aiTimer.current && clearTimeout(aiTimer.current));
  }, [state, step]);

  useEffect(() => () => void (aiTimer.current && clearTimeout(aiTimer.current)), []);

  const finished = state ? isOver(state) : false;
  const myTurn = !!state && !finished && state.turn === 'a';
  const actions = myTurn ? legalActions(state!) : [];
  const winner = (state?.winner ?? null) as 'a' | 'b' | null;

  return { state, log, myTurn, actions, finished, winner, start, act };
}
