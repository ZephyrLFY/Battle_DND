/**
 * 回合制战斗 hook —— 驱动 shared 的 NvN 状态机（3v3），带事件回放。
 *
 * 玩家固定是 a 队，敌方 b 由 AI。引擎的 applyAction 一次原子算出 (新逻辑态, 事件流)；
 * 本 hook 不再瞬时跳到终态，而是把事件**入队按节拍逐个回放**到一个「显示态 view」上，
 * 让战斗有节奏（受击/倒地一步步发生）。可调速：1x / 2x / 瞬间（瞬间=旧的无动画行为）。
 *
 * 两个状态分离：
 * - state：逻辑终态（引擎真相），决定可选动作、AI 决策。
 * - view ：显示态（事件折叠出来的当前画面），BattleStage 渲染它。
 * 回放进行中（队列未清空）锁输入；清空后若轮到 AI 或开了自动，再推进下一步。
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
import { cloneView, applyEventToView } from './playback.js';

/** 回放速度：每个事件之间的间隔（ms）。instant=0 → 同步清空（等价旧无动画）。 */
export type PlaybackSpeed = '1x' | '2x' | 'instant';
const SPEED_MS: Record<PlaybackSpeed, number> = { '1x': 300, '2x': 150, instant: 0 };
const AI_GAP_MS = 350; // 一步回放完到 AI 下一步之间的停顿

export interface PendingTarget {
  kind: 'attack' | 'skill';
  skill?: string;
  targetType: TargetType;
  candidates: FighterRef[];
}

export interface UseBattle {
  /** 显示态（回放当前帧）；BattleStage 渲染它。 */
  state: BattleState | null;
  log: string[];
  myTurn: boolean;
  actions: ActionOption[];
  myEnergy: number;
  finished: boolean;
  winner: 'a' | 'b' | null;
  auto: boolean;
  pending: PendingTarget | null;
  /** 回放进行中（动画播放中，输入锁定）。 */
  playing: boolean;
  speed: PlaybackSpeed;
  start: (teamA: Combatant[], teamB: Combatant[], seed: number) => void;
  choose: (action: Action) => void;
  chooseTarget: (target: FighterRef) => void;
  cancelPending: () => void;
  setAuto: (on: boolean) => void;
  setSpeed: (s: PlaybackSpeed) => void;
}

export function useBattle(): UseBattle {
  // 逻辑终态（引擎真相）
  const logicRef = useRef<BattleState | null>(null);
  // 显示态（回放帧）
  const [view, setView] = useState<BattleState | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [auto, setAuto] = useState(false);
  const [pending, setPending] = useState<PendingTarget | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>('1x');

  const seedRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>('1x');
  speedRef.current = speed;

  // 事件回放队列 + 当前折叠中的显示态
  const queueRef = useRef<BattleEvent[]>([]);
  const viewRef = useRef<BattleState | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
    if (aiTimer.current) clearTimeout(aiTimer.current);
    tickTimer.current = null;
    aiTimer.current = null;
  }, []);

  /** 折叠一个事件到显示态 + 追加日志。 */
  const foldOne = useCallback((ev: BattleEvent) => {
    if (viewRef.current) {
      applyEventToView(viewRef.current, ev);
      setView(cloneView(viewRef.current)); // 新引用触发重渲染
    }
    const lines = eventToLines(ev);
    if (lines.length) setLog((prev) => [...prev, ...lines]);
  }, []);

  /** 启动回放循环：按当前速度逐个出队折叠；瞬间档同步清空。清空后置 playing=false。 */
  const drain = useCallback(() => {
    const ms = SPEED_MS[speedRef.current];
    if (ms === 0) {
      // 瞬间：一次性折叠完
      for (const ev of queueRef.current) {
        if (viewRef.current) applyEventToView(viewRef.current, ev);
      }
      const allLines = queueRef.current.flatMap(eventToLines);
      queueRef.current = [];
      if (viewRef.current) setView(cloneView(viewRef.current));
      if (allLines.length) setLog((prev) => [...prev, ...allLines]);
      setPlaying(false);
      return;
    }
    const tick = () => {
      const ev = queueRef.current.shift();
      if (!ev) {
        setPlaying(false);
        return;
      }
      foldOne(ev);
      tickTimer.current = setTimeout(tick, SPEED_MS[speedRef.current]);
    };
    tick();
  }, [foldOne]);

  /** 把一批事件入队并（若未在播）启动回放。 */
  const enqueue = useCallback(
    (events: BattleEvent[]) => {
      if (!events.length) return;
      queueRef.current.push(...events);
      setPlaying(true);
      if (!tickTimer.current) drain();
    },
    [drain],
  );

  const start = useCallback(
    (teamA: Combatant[], teamB: Combatant[], seed: number) => {
      clearTimers();
      queueRef.current = [];
      seedRef.current = seed;
      setPending(null);
      const { state: s0, events } = createBattle(teamA, teamB, seed);
      logicRef.current = s0;
      viewRef.current = cloneView(s0);
      setLog([]);
      setView(cloneView(s0));
      setPlaying(false);
      enqueue(events);
    },
    [clearTimers, enqueue],
  );

  /** 执行一个动作：推进逻辑态，把产生的事件入队回放。 */
  const runAction = useCallback(
    (action: Action) => {
      setPending(null);
      const cur = logicRef.current;
      if (!cur || isOver(cur) || currentFighter(cur)?.team !== 'a') return;
      const { state: ns, events } = applyAction(cur, action);
      logicRef.current = ns;
      enqueue(events);
    },
    [enqueue],
  );

  const choose = useCallback(
    (action: Action) => {
      const s = logicRef.current;
      if (!s) return;
      const actor = currentFighter(s);
      if (!actor) return;
      const tt: TargetType = action.kind === 'attack' ? 'one_enemy' : skillDef(action.skill).targetType;
      const needPick = tt === 'one_enemy' || tt === 'one_ally';
      if (!needPick) {
        runAction(action);
        return;
      }
      const candidates = legalTargets(s, actor, tt);
      if (candidates.length <= 1) {
        runAction(action);
        return;
      }
      setPending({
        kind: action.kind,
        skill: action.kind === 'skill' ? action.skill : undefined,
        targetType: tt,
        candidates,
      });
    },
    [runAction],
  );

  const chooseTarget = useCallback(
    (target: FighterRef) => {
      if (!pending) return;
      const action: Action =
        pending.kind === 'attack'
          ? { kind: 'attack', target }
          : { kind: 'skill', skill: pending.skill as Extract<Action, { kind: 'skill' }>['skill'], targets: [target] };
      runAction(action);
    },
    [pending, runAction],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  // 自动推进：回放清空（!playing）后，若轮到 AI（b）或开了自动且轮到 a，则推进一步。
  useEffect(() => {
    if (playing) return; // 回放中不推进
    const s = logicRef.current;
    if (!s || isOver(s)) return;
    const cur = currentFighter(s);
    if (!cur) return;
    const aiDriven = cur.team === 'b' || (auto && cur.team === 'a');
    if (!aiDriven) return;
    aiTimer.current = setTimeout(() => {
      const cs = logicRef.current;
      if (!cs || isOver(cs)) return;
      const c = currentFighter(cs);
      if (!c || !(c.team === 'b' || (auto && c.team === 'a'))) return;
      const aiSeed = (seedRef.current * 2654435761 + cs.round * 40503 + cs.turnIndex) >>> 0;
      const { state: ns, events } = applyAction(cs, chooseAction(cs, aiSeed));
      logicRef.current = ns;
      enqueue(events);
    }, AI_GAP_MS);
    return () => void (aiTimer.current && clearTimeout(aiTimer.current));
  }, [playing, auto, view, enqueue]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // 派生 UI 状态：基于逻辑态 + 是否回放中。
  const logic = logicRef.current;
  // 胜负横幅等回放播完再显示（别在死亡动画播放时就剧透结果）。
  const finished = logic ? isOver(logic) && !playing : false;
  const cur = logic ? currentFighter(logic) : undefined;
  const idle = !playing && !pending;
  const myTurn = !!logic && !finished && cur?.team === 'a' && !auto && idle;
  const actions = logic && !finished && cur?.team === 'a' && idle ? allActions(logic, { team: 'a', id: cur.id }) : [];
  const myEnergy = cur?.team === 'a' ? cur.energy : (logic?.teams.a.find((f) => !f.dead)?.energy ?? 0);
  const winner = (logic?.winner ?? null) as 'a' | 'b' | null;

  return {
    state: view,
    log,
    myTurn,
    actions,
    myEnergy,
    finished,
    winner,
    auto,
    pending,
    playing,
    speed,
    start,
    choose,
    chooseTarget,
    cancelPending,
    setAuto,
    setSpeed,
  };
}
