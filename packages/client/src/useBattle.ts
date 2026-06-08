/**
 * 回合制战斗 hook —— 驱动 shared 的 NvN 状态机（3v3）。
 *
 * 玩家固定是 a 队，敌方 b 由随机 AI。玩家选动作（两步：先动作，需选目标的再选目标）→
 * 推进 → 若轮到 b 或处于"自动"模式，自动用 AI 推进（带小延迟，让日志逐行出）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBattle,
  applyAction,
  allActions,
  legalTargets,
  chooseAction,
  isOver,
  currentFighter,
  skillDef,
  type Action,
  type ActionOption,
  type BattleState,
  type BattleEvent,
  type Combatant,
  type FighterRef,
  type TargetType,
} from '@battle-pokemon/shared';
import { eventToLines } from './battleLog.js';

const AI_DELAY_MS = 650;

/** 待选目标的"挂起动作"（两步选目标时用）。 */
export interface PendingTarget {
  kind: 'attack' | 'skill';
  skill?: string;
  targetType: TargetType;
  candidates: FighterRef[]; // 合法目标，UI 高亮可点
}

export interface UseBattle {
  state: BattleState | null;
  log: string[];
  myTurn: boolean;
  actions: ActionOption[];
  myEnergy: number;
  finished: boolean;
  winner: 'a' | 'b' | null;
  auto: boolean;
  pending: PendingTarget | null;
  start: (teamA: Combatant[], teamB: Combatant[], seed: number) => void;
  /** 选一个动作：不需要选目标的直接执行；需要的进入 pending 等待 chooseTarget。 */
  choose: (action: Action) => void;
  /** 为 pending 动作选定目标并执行。 */
  chooseTarget: (target: FighterRef) => void;
  cancelPending: () => void;
  setAuto: (on: boolean) => void;
}

export function useBattle(): UseBattle {
  const [state, setState] = useState<BattleState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(false);
  const [pending, setPending] = useState<PendingTarget | null>(null);
  const seedRef = useRef(0);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appendEvents = useCallback((events: BattleEvent[]) => {
    const lines = events.flatMap(eventToLines);
    if (lines.length) setLog((prev) => [...prev, ...lines]);
  }, []);

  const start = useCallback(
    (teamA: Combatant[], teamB: Combatant[], seed: number) => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
      seedRef.current = seed;
      setPending(null);
      const { state: s0, events } = createBattle(teamA, teamB, seed);
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

  const runAction = useCallback(
    (action: Action) => {
      setPending(null);
      setState((cur) => {
        if (!cur || isOver(cur) || currentFighter(cur)?.team !== 'a') return cur;
        return step(cur, action);
      });
    },
    [step],
  );

  /** 选动作：单体技能/普攻需选目标 → 进 pending；其余直接执行。 */
  const choose = useCallback(
    (action: Action) => {
      if (!state) return;
      const actor = currentFighter(state);
      if (!actor) return;
      const tt: TargetType = action.kind === 'attack' ? 'one_enemy' : skillDef(action.skill).targetType;
      const needPick = tt === 'one_enemy' || tt === 'one_ally';
      if (!needPick) {
        runAction(action);
        return;
      }
      const candidates = legalTargets(state, actor, tt);
      if (candidates.length <= 1) {
        runAction(action); // 只有一个目标，无需选
        return;
      }
      setPending({
        kind: action.kind,
        skill: action.kind === 'skill' ? action.skill : undefined,
        targetType: tt,
        candidates,
      });
    },
    [state, runAction],
  );

  const chooseTarget = useCallback(
    (target: FighterRef) => {
      if (!pending) return;
      const action: Action =
        pending.kind === 'attack'
          ? { kind: 'attack', target }
          : { kind: 'skill', skill: pending.skill as any, targets: [target] };
      runAction(action);
    },
    [pending, runAction],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  // 自动推进：轮到 AI（b），或玩家开了"自动"且轮到 a
  useEffect(() => {
    if (!state || isOver(state)) return;
    const cur = currentFighter(state);
    if (!cur) return;
    const aiDriven = cur.team === 'b' || (auto && cur.team === 'a');
    if (!aiDriven) return;
    aiTimer.current = setTimeout(() => {
      setState((s) => {
        if (!s || isOver(s)) return s;
        const c = currentFighter(s);
        if (!c) return s;
        if (!(c.team === 'b' || (auto && c.team === 'a'))) return s;
        const aiSeed = (seedRef.current * 2654435761 + s.round * 40503 + s.turnIndex) >>> 0;
        return step(s, chooseAction(s, aiSeed));
      });
    }, AI_DELAY_MS);
    return () => void (aiTimer.current && clearTimeout(aiTimer.current));
  }, [state, auto, step]);

  useEffect(() => () => void (aiTimer.current && clearTimeout(aiTimer.current)), []);

  const finished = state ? isOver(state) : false;
  const cur = state ? currentFighter(state) : undefined;
  const myTurn = !!state && !finished && cur?.team === 'a' && !auto;
  const actions = state && !finished && cur?.team === 'a' ? allActions(state, { team: 'a', id: cur.id }) : [];
  const myEnergy = cur?.team === 'a' ? cur.energy : (state?.teams.a.find((f) => !f.dead)?.energy ?? 0);
  const winner = (state?.winner ?? null) as 'a' | 'b' | null;

  return {
    state, log, myTurn, actions, myEnergy, finished, winner, auto, pending,
    start, choose, chooseTarget, cancelPending, setAuto,
  };
}
