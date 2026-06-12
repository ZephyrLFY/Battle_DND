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
} from '@italian-brainrot/shared';
import { cloneView, applyEventToView } from './playback.js';
import type { PoseMap, LungeMap } from './presentation.js';

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
  /** 瞬时姿势表（按回放事件维护）：出手者→attack、被命中者→hit；新回合清空。 */
  poses: PoseMap;
  /** 突进表：单体攻击时 攻击者→目标（战场把攻击者画到目标面前）；新回合清空。 */
  lunges: LungeMap;
  /** 已回放的事件（日志数据源）。渲染时按当前语言格式化 → 切语言历史日志也跟着切。 */
  logEvents: BattleEvent[];
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
  const [logEvents, setLogEvents] = useState<BattleEvent[]>([]);
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
  // 瞬时姿势表（attack/hit）+ 突进表（单体攻击者→目标），随事件更新、新回合清空
  const posesRef = useRef<PoseMap>({});
  const [poses, setPoses] = useState<PoseMap>({});
  const lungesRef = useRef<LungeMap>({});
  const [lunges, setLunges] = useState<LungeMap>({});
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
    if (aiTimer.current) clearTimeout(aiTimer.current);
    tickTimer.current = null;
    aiTimer.current = null;
  }, []);

  /** 按事件更新瞬时姿势表 + 突进表（静态图伪动画的驱动源）。返回是否有变化。 */
  const updateFx = useCallback((ev: BattleEvent): boolean => {
    const m = posesRef.current;
    const lg = lungesRef.current;
    const key = (r: FighterRef) => `${r.team}:${r.id}`;
    switch (ev.t) {
      case 'turn': {
        // 新回合：清空上一回合的瞬时姿势与突进
        if (Object.keys(m).length === 0 && Object.keys(lg).length === 0) return false;
        posesRef.current = {};
        lungesRef.current = {};
        return true;
      }
      case 'action': {
        m[key(ev.who)] = 'attack';
        // 单体指向性动作 → 突进到目标面前；AOE/全体/自身 → 原地
        const a = ev.action;
        if (a.kind === 'attack') {
          lg[key(ev.who)] = key(a.target);
        } else if (skillDef(a.skill).targetType === 'one_enemy' && a.targets[0]) {
          lg[key(ev.who)] = key(a.targets[0]);
        }
        return true;
      }
      case 'hit':
        if (!ev.hit) return false;
        m[key(ev.to)] = 'hit';
        return true;
      case 'damage':
        m[key(ev.to)] = 'hit';
        return true;
      case 'revive':
        if (!(key(ev.who) in m)) return false;
        delete m[key(ev.who)];
        return true;
      default:
        return false;
    }
  }, []);

  /** 折叠一个事件到显示态 + 更新姿势/突进 + 追加日志事件。 */
  const foldOne = useCallback((ev: BattleEvent) => {
    if (viewRef.current) {
      applyEventToView(viewRef.current, ev);
      setView(cloneView(viewRef.current)); // 新引用触发重渲染
    }
    if (updateFx(ev)) {
      setPoses({ ...posesRef.current });
      setLunges({ ...lungesRef.current });
    }
    setLogEvents((prev) => [...prev, ev]);
  }, [updateFx]);

  /**
   * 回放清空后，把显示态的「当前行动者」对齐到逻辑态。
   * 因为 turn 事件在行动者**行动时**才 emit：AI 回合放完后，view 仍高亮"刚行动的"敌方，
   * 而逻辑已轮到下一位（如玩家）。纯 AI 流会被下一步立刻覆盖，但切回手动时会卡住高亮——
   * 这里手动对齐 turnIndex，让先攻条指向「下一个该行动的人」。
   */
  const syncViewToLogic = useCallback(() => {
    const v = viewRef.current;
    const l = logicRef.current;
    if (!v || !l) return;
    const curRef = l.order[l.turnIndex];
    if (!curRef) return;
    const i = v.order.findIndex((r) => r.team === curRef.team && r.id === curRef.id);
    if (i >= 0 && i !== v.turnIndex) {
      v.turnIndex = i;
      setView(cloneView(v));
    }
  }, []);

  /** 启动回放循环：按当前速度逐个出队折叠；瞬间档同步清空。清空后置 playing=false。 */
  const drain = useCallback(() => {
    const ms = SPEED_MS[speedRef.current];
    if (ms === 0) {
      // 瞬间：一次性折叠完
      if (tickTimer.current) {
        clearTimeout(tickTimer.current);
        tickTimer.current = null;
      }
      for (const ev of queueRef.current) {
        if (viewRef.current) applyEventToView(viewRef.current, ev);
      }
      const drained = queueRef.current;
      queueRef.current = [];
      if (viewRef.current) setView(cloneView(viewRef.current));
      if (drained.length) setLogEvents((prev) => [...prev, ...drained]);
      posesRef.current = {}; // 瞬间档不播姿势/突进
      lungesRef.current = {};
      setPoses({});
      setLunges({});
      syncViewToLogic();
      setPlaying(false);
      return;
    }
    const tick = () => {
      const ev = queueRef.current.shift();
      if (!ev) {
        tickTimer.current = null; // 清空句柄：否则 enqueue 的 `!tickTimer.current` 守卫永远拦截后续回放
        posesRef.current = {}; // 回放播完：全员归位 idle、突进归位
        lungesRef.current = {};
        setPoses({});
        setLunges({});
        syncViewToLogic(); // 对齐先攻条到下一个该行动的人
        setPlaying(false);
        return;
      }
      foldOne(ev);
      tickTimer.current = setTimeout(tick, SPEED_MS[speedRef.current]);
    };
    tick();
  }, [foldOne, syncViewToLogic]);

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
      posesRef.current = {};
      lungesRef.current = {};
      setPoses({});
      setLunges({});
      setLogEvents([]);
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

  // 自动推进：回放清空（!playing）后推进一步——条件是当前行动者不该等玩家输入：
  //   ① AI 驱动（b 队，或开了自动的 a 队）；
  //   ② 当前行动者无法行动（倒地/昏迷）——引擎会自动 skip，但需有人替它调用 applyAction，
  //      否则手动模式下倒地的 a 角色轮到回合时既不自动跳、又没法手动操作 → 死锁。
  const canAct = (f: { downed: boolean; stunned: number } | undefined) => !!f && !f.downed && f.stunned <= 0;
  useEffect(() => {
    if (playing) return; // 回放中不推进
    const s = logicRef.current;
    if (!s || isOver(s)) return;
    const cur = currentFighter(s);
    if (!cur) return;
    const aiDriven = cur.team === 'b' || (auto && cur.team === 'a');
    const mustAutoStep = aiDriven || !canAct(cur); // 倒地/昏迷者一律自动推进（引擎内部 skip）
    if (!mustAutoStep) return;
    aiTimer.current = setTimeout(() => {
      const cs = logicRef.current;
      if (!cs || isOver(cs)) return;
      const c = currentFighter(cs);
      if (!c) return;
      const aiNow = c.team === 'b' || (auto && c.team === 'a');
      if (!aiNow && canAct(c)) return; // 又轮到能行动的玩家角色了 → 交还控制权
      const aiSeed = (seedRef.current * 2654435761 + cs.round * 40503 + cs.turnIndex) >>> 0;
      // 倒地/昏迷者传任意动作即可（引擎会忽略并 skip）；其余走 AI 决策。
      const action = canAct(c) ? chooseAction(cs, aiSeed) : ({ kind: 'attack', target: { team: 'b', id: c.id } } as Action);
      const { state: ns, events } = applyAction(cs, action);
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
  // 只有「能行动的」我方角色才交给玩家；倒地/昏迷的由自动推进替它 skip。
  const myActable = cur?.team === 'a' && canAct(cur);
  const myTurn = !!logic && !finished && myActable && !auto && idle;
  const actions = logic && !finished && myActable && idle ? allActions(logic, { team: 'a', id: cur!.id }) : [];
  const myEnergy = cur?.team === 'a' ? cur.energy : (logic?.teams.a.find((f) => !f.dead)?.energy ?? 0);
  const winner = (logic?.winner ?? null) as 'a' | 'b' | null;

  return {
    state: view,
    poses,
    lunges,
    logEvents,
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
