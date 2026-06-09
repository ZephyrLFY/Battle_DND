/**
 * 事件回放折叠 —— 把引擎一次性吐出的事件流，按事件逐个折叠进一个「显示态」。
 *
 * 引擎的 applyAction 是原子的：(state, action) → (newState, events)，events 已含每步明细
 * （damage.hpLeft / downed.who / dead.who …）。本模块据此从「上一帧显示态」逐事件推进，
 * 让 UI 能一步步走到逻辑终态，而不是瞬间跳变。纯前端、不碰 shared 逻辑。
 *
 * 显示态沿用 BattleState 的形状（BattleStage 直接吃），但只反映事件携带的字段变化。
 */
import {
  type BattleState,
  type BattleEvent,
  type FighterRT,
  type FighterRef,
} from '@battle-pokemon/shared';

const keyOf = (r: FighterRef): string => `${r.team}:${r.id}`;

/** 深拷一个显示态（与引擎 cloneState 同构，避免回放时改到上一帧）。 */
export function cloneView(s: BattleState): BattleState {
  return {
    teams: {
      a: s.teams.a.map(cloneF),
      b: s.teams.b.map(cloneF),
    },
    order: s.order.map((r) => ({ ...r })),
    turnIndex: s.turnIndex,
    round: s.round,
    rngCursor: s.rngCursor,
    winner: s.winner,
  };
}

function cloneF(f: FighterRT): FighterRT {
  return { ...f, skills: [...f.skills], stats: { ...f.stats }, passiveState: { ...f.passiveState } };
}

function find(s: BattleState, r: FighterRef): FighterRT | undefined {
  return s.teams[r.team].find((f) => f.id === r.id);
}

/**
 * 把单个事件折叠进显示态（原地修改传入的 view，返回它）。
 * 只处理「会改变画面」的字段：hp / downed / dead / stunned / energy / 当前行动者 / 胜负。
 */
export function applyEventToView(view: BattleState, ev: BattleEvent): BattleState {
  switch (ev.t) {
    case 'turn': {
      // 把先攻指针对到行动者，驱动 BattleStage 高亮当前角色。
      const i = view.order.findIndex((r) => keyOf(r) === keyOf(ev.who));
      if (i >= 0) view.turnIndex = i;
      view.round = ev.round;
      break;
    }
    case 'damage':
    case 'thorns': {
      const t = find(view, ev.to);
      if (t) t.hp = ev.hpLeft;
      break;
    }
    case 'lifesteal':
    case 'heal': {
      const w = find(view, ev.who);
      if (w) w.hp = ev.hpLeft;
      break;
    }
    case 'energy': {
      const w = find(view, ev.who);
      if (w) w.energy = ev.now;
      break;
    }
    case 'downed': {
      const w = find(view, ev.who);
      if (w) {
        w.downed = true;
        w.hp = 0;
      }
      break;
    }
    case 'revive': {
      const w = find(view, ev.who);
      if (w) {
        w.downed = false;
        w.hp = ev.hpLeft;
      }
      break;
    }
    case 'dead': {
      const w = find(view, ev.who);
      if (w) {
        w.dead = true;
        w.downed = true;
      }
      // 与引擎一致：彻底死亡移出先攻序列（保持当前行动者定位稳定）。
      const curRef = view.order[view.turnIndex];
      view.order = view.order.filter((r) => keyOf(r) !== keyOf(ev.who));
      if (curRef && keyOf(curRef) !== keyOf(ev.who)) {
        const ni = view.order.findIndex((r) => keyOf(r) === keyOf(curRef));
        view.turnIndex = ni >= 0 ? ni : 0;
      } else if (view.turnIndex >= view.order.length) {
        view.turnIndex = 0;
      }
      break;
    }
    case 'end':
      view.winner = ev.winner;
      break;
    // start / skip / action / hit / buff：不直接改显示态字段（hit 的扣血由后续 damage 事件体现）。
    default:
      break;
  }
  return view;
}
