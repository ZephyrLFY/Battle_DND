import { describe, it, expect } from 'vitest';
import {
  createBattle,
  applyAction,
  currentFighter,
  find,
  type BattleState,
  type Action,
  type FighterRef,
} from './battle.js';
import { getStack, setStack, passiveOf, isControlImmune } from './passives.js';
import { Rng } from './rng.js';
import { newCombatant, type Combatant } from './combatant.js';
import { canLearn, learnableSkills, learnBlockReason, learnSkill } from './leveling.js';
import type { SkillId } from './skills.js';
import type { PassiveCtx, BattleEvent, FighterRT } from './battleTypes.js';

function mk(archetypeId: string, level: number, skills: SkillId[] = []): Combatant {
  return { ...newCombatant(archetypeId), level, skills };
}

/** 让某队某角色一直普攻对面第一个目标，直到该角色完成 n 次"轮到自己"的回合。 */
function attackRef(state: BattleState, team: 'a' | 'b'): FighterRef {
  const enemyTeam = team === 'a' ? 'b' : 'a';
  const e = state.teams[enemyTeam].find((f) => !f.dead && !f.downed)!;
  return { team: e.team, id: e.id };
}

describe('被动基础设施', () => {
  it('cloneFighter 深拷 passiveState —— 克隆的改动不回写原态', () => {
    const { state } = createBattle([mk('TungSahur', 6)], [mk('TrippiTroppi', 6)], 1);
    // applyAction 内部 clone；让 Tung 打一拳，新 state 应记到敲击层数，旧 state 不受影响。
    const before = getStack(state.teams.a[0]!, 'tung.hits');
    const cur = currentFighter(state)!;
    const act: Action =
      cur.team === 'a'
        ? { kind: 'attack', target: attackRef(state, 'a') }
        : { kind: 'attack', target: attackRef(state, 'b') };
    const { state: next } = applyAction(state, act);
    // 原 state 的栈不应被 next 的结算改动（纯函数边界）
    expect(getStack(state.teams.a[0]!, 'tung.hits')).toBe(before);
    void next;
  });

  it('确定性：同种子两次跑出的事件与栈完全一致', () => {
    const run = () => {
      let { state, events } = createBattle([mk('TungSahur', 8, ['sig_tung_combo'])], [mk('TrippiTroppi', 8)], 42);
      const all = [...events];
      let guard = 0;
      while (state.winner === undefined && guard++ < 2000) {
        const cur = currentFighter(state)!;
        const act: Action = { kind: 'attack', target: attackRef(state, cur.team) };
        const r = applyAction(state, act);
        state = r.state;
        all.push(...r.events);
      }
      return { winner: state.winner, n: all.length, log: JSON.stringify(all) };
    };
    const a = run();
    const b = run();
    expect(a.winner).toBe(b.winner);
    expect(a.n).toBe(b.n);
    expect(a.log).toBe(b.log);
  });
});

describe('Tung Sahur 被动「不眠的梆子」', () => {
  it('普攻命中后叠敲击层数；连续命中追加伤害', () => {
    // Tung 高 STR、对面脆 DEX 低 → 易命中。让 Tung 连打几拳，观察层数增长。
    let { state } = createBattle([mk('TungSahur', 8)], [mk('TrippiTroppi', 1)], 3);
    const tungRef = { team: 'a' as const, id: 'TungSahur' };
    let guard = 0;
    let sawStack = false;
    while (state.winner === undefined && guard++ < 200) {
      const cur = currentFighter(state)!;
      const act: Action = { kind: 'attack', target: attackRef(state, cur.team) };
      state = applyAction(state, act).state;
      const tung = find(state, tungRef);
      if (tung && getStack(tung, 'tung.hits') >= 2) sawStack = true;
    }
    expect(sawStack).toBe(true);
  });

  it('释放签名连打后敲击层数清空（轮4：爆发/叠层二选一）', () => {
    const { state } = createBattle([mk('TungSahur', 8, ['sig_tung_combo'])], [mk('TrippiTroppi', 8)], 7);
    const tung = fighter(state, 'a', 'TungSahur');
    const p = passiveOf('TungSahur')!;
    setStack(tung, 'tung.hits', 3);
    tung.energy = 5;
    p.onCastSpell!(pctx(state, tung), 'sig_tung_combo');
    expect(getStack(tung, 'tung.hits')).toBe(0);
    // 非签名耗能技能不清层
    setStack(tung, 'tung.hits', 2);
    p.onCastSpell!(pctx(state, tung), 'heal');
    expect(getStack(tung, 'tung.hits')).toBe(2);
  });
});

describe('签名技能学习门禁', () => {
  it('拥有者（Tung，Lv6）可学自己的签名技能', () => {
    expect(canLearn(mk('TungSahur', 6), 'sig_tung_combo')).toBe(true);
  });

  it('非拥有者学他人签名技能 → 专属技能', () => {
    expect(learnBlockReason(mk('TrippiTroppi', 15), 'sig_tung_combo')).toBe('专属技能');
    expect(canLearn(mk('TrippiTroppi', 15), 'sig_tung_combo')).toBe(false);
  });

  it('learnableSkills：签名技能只对拥有者可见', () => {
    expect(learnableSkills(mk('TungSahur', 6))).toContain('sig_tung_combo');
    expect(learnableSkills(mk('TrippiTroppi', 6))).not.toContain('sig_tung_combo');
  });

  it('签名技能占技能栏：学满 4 个含签名后不可再学', () => {
    let c = mk('TungSahur', 12);
    c = learnSkill(c, 'sig_tung_combo'); // 占 1 格
    c = learnSkill(c, 'brave_strike');
    c = learnSkill(c, 'flurry');
    c = learnSkill(c, 'feint');
    expect(c.skills).toHaveLength(4);
    expect(learnBlockReason(c, 'precise_aim')).toContain('技能栏已满');
  });
});

/** 给读时纯函数构造一个 PassiveCtx（self 取 state 中对应 archetype 的 fighter）。 */
function pctx(state: BattleState, self: FighterRT): PassiveCtx {
  const events: BattleEvent[] = [];
  return { self, state, rng: new Rng(1), emit: (e) => events.push(e) };
}
function fighter(state: BattleState, team: 'a' | 'b', archetypeId: string): FighterRT {
  return state.teams[team].find((f) => f.archetypeId === archetypeId)!;
}

describe('CA↔BC 联动「咖啡与舞伴」', () => {
  it('modifyStats：BC 存活 ×1.3、BC 阵亡 ×1.5、无 BC 不变', () => {
    const { state } = createBattle(
      [mk('CappuccinoAssassino', 10), mk('BallerinaCappuccina', 10)],
      [mk('TrippiTroppi', 10)],
      1,
    );
    const ca = fighter(state, 'a', 'CappuccinoAssassino');
    const p = passiveOf('CappuccinoAssassino')!;
    const base = ca.stats;
    // BC 存活 → ×1.3
    const alive = p.modifyStats!(base, pctx(state, ca));
    expect(alive.dmgBonus).toBe(Math.round(base.dmgBonus * 1.3));
    // BC 阵亡 → ×1.5
    fighter(state, 'a', 'BallerinaCappuccina').dead = true;
    const dead = p.modifyStats!(base, pctx(state, ca));
    expect(dead.dmgBonus).toBe(Math.round(base.dmgBonus * 1.5));
    expect(dead.toHit).toBeGreaterThanOrEqual(alive.toHit);
  });

  it('modifyOutgoingDamage：攻击敌方 BC ×0.9，攻击其他不变', () => {
    const { state } = createBattle([mk('CappuccinoAssassino', 10)], [mk('BallerinaCappuccina', 10), mk('TrippiTroppi', 10)], 1);
    const ca = fighter(state, 'a', 'CappuccinoAssassino');
    const bc = fighter(state, 'b', 'BallerinaCappuccina');
    const tt = fighter(state, 'b', 'TrippiTroppi');
    const p = passiveOf('CappuccinoAssassino')!;
    expect(p.modifyOutgoingDamage!(pctx(state, ca), bc, 20)).toBe(18); // ×0.9
    expect(p.modifyOutgoingDamage!(pctx(state, ca), tt, 20)).toBe(20); // 不变
  });

  it('modifyIncomingHeal：BC 存活时 CA 受到的治疗 +50%', () => {
    const { state } = createBattle([mk('CappuccinoAssassino', 10), mk('BallerinaCappuccina', 10)], [mk('TrippiTroppi', 10)], 1);
    const ca = fighter(state, 'a', 'CappuccinoAssassino');
    const p = passiveOf('CappuccinoAssassino')!;
    expect(p.modifyIncomingHeal!(pctx(state, ca), undefined, 10)).toBe(15);
    fighter(state, 'a', 'BallerinaCappuccina').dead = true;
    expect(p.modifyIncomingHeal!(pctx(state, ca), undefined, 10)).toBe(10);
  });
});

describe('Trippi 九命怪猫', () => {
  it('onWouldGoDown 首次拦截：15% maxHp 存活 + 清负面；第二次放行', () => {
    const { state } = createBattle([mk('TrippiTroppi', 10)], [mk('TungSahur', 10)], 1);
    const tt = fighter(state, 'a', 'TrippiTroppi');
    const p = passiveOf('TrippiTroppi')!;
    tt.hp = 0;
    tt.stunned = 2;
    const vetoed = p.onWouldGoDown!(pctx(state, tt));
    expect(vetoed).toBe(true);
    expect(tt.hp).toBe(Math.max(1, Math.floor(tt.stats.maxHp * 0.15))); // 平衡补丁三轮：25% → 15%（哈气重做补偿）
    expect(tt.stunned).toBe(0);
    // 第二次：已用过 → 不拦截
    tt.hp = 0;
    expect(p.onWouldGoDown!(pctx(state, tt))).toBe(false);
  });
});

describe('Bombombini 引信', () => {
  it('受击叠层；耗能技能命中追加伤害、普攻不吃；释放后清空', () => {
    const { state } = createBattle([mk('BombombiniGusini', 10)], [mk('TrippiTroppi', 10)], 1);
    const bg = fighter(state, 'a', 'BombombiniGusini');
    const enemy = fighter(state, 'b', 'TrippiTroppi');
    const p = passiveOf('BombombiniGusini')!;
    // 攒 3 层
    p.onTakeHit!(pctx(state, bg), enemy, 5, false);
    p.onTakeHit!(pctx(state, bg), enemy, 5, false);
    p.onTakeHit!(pctx(state, bg), enemy, 5, false);
    expect(getStack(bg, 'bombombini.gunpowder')).toBe(3);
    // 普攻命中（fromSpell=false）：不追加伤害
    const hpBefore = enemy.hp;
    p.onDealDamage!(pctx(state, bg), enemy, 4, false, false);
    expect(enemy.hp).toBe(hpBefore);
    // 耗能技能命中（fromSpell=true）：追加 3层×2=6 伤害
    p.onDealDamage!(pctx(state, bg), enemy, 4, false, true);
    expect(enemy.hp).toBe(hpBefore - 6);
    // 释放耗能技能后清空层数
    p.onCastSpell!(pctx(state, bg), 'sig_bombombini_blast');
    expect(getStack(bg, 'bombombini.gunpowder')).toBe(0);
  });
});

describe('Lirilì 时间静止 — 额外回合', () => {
  it('放时间静止后立即获得一次额外行动（先攻指针不前进，仍是 Lirilì）', () => {
    // 1v1，给 Lirilì 充足能量直接放时间静止。1v1 下若不给额外回合，回合会切到敌方。
    const lirili: Combatant = { ...mk('LiriliLarila', 12, ['sig_lirili_timestop']), energy: 3 } as Combatant;
    let { state } = createBattle([lirili], [mk('TrippiTroppi', 1)], 7);
    // 确保当前是 Lirilì（1v1 它 DEX 低可能后手）——推进到它的回合。
    let guard = 0;
    while (state.winner === undefined && currentFighter(state)!.archetypeId !== 'LiriliLarila' && guard++ < 20) {
      const cur = currentFighter(state)!;
      state = applyAction(state, { kind: 'attack', target: attackRef(state, cur.team) }).state;
    }
    // 手动设满能量（推进过程可能没攒够），再放时间静止。
    const liNow = find(state, { team: 'a', id: 'LiriliLarila' })!;
    liNow.energy = 3;
    const r = applyAction(state, {
      kind: 'skill',
      skill: 'sig_lirili_timestop',
      targets: [{ team: 'a', id: 'LiriliLarila' }],
    });
    // 额外回合生效：先攻指针不前进，下一个行动者仍是 Lirilì（随后还能再行动一次）。
    expect(currentFighter(r.state)?.archetypeId).toBe('LiriliLarila');
    expect(find(r.state, { team: 'a', id: 'LiriliLarila' })!.extraTurns).toBe(1);
  });
});

// setStack 在导出面上可用（被动 reset 用），冒烟一下避免未用告警。
describe('passiveState 访问器', () => {
  it('setStack/getStack 往返', () => {
    const { state } = createBattle([mk('TungSahur', 1)], [mk('TrippiTroppi', 1)], 1);
    const f = fighter(state, 'a', 'TungSahur');
    setStack(f, 'x', 5);
    expect(getStack(f, 'x')).toBe(5);
  });
});

describe('Phase 2 被动', () => {
  it('Bombardiro 装甲蒙皮：受伤 −1（modifyIncomingDamage，平衡补丁 2→1）', () => {
    const { state } = createBattle([mk('TungSahur', 10)], [mk('BombardiroCrocodilo', 10)], 1);
    const bc = fighter(state, 'b', 'BombardiroCrocodilo');
    const p = passiveOf('BombardiroCrocodilo')!;
    expect(p.modifyIncomingDamage!(pctx(state, bc), fighter(state, 'a', 'TungSahur'), 10)).toBe(9);
    expect(p.modifyIncomingDamage!(pctx(state, bc), fighter(state, 'a', 'TungSahur'), 1)).toBe(0);
  });

  it('Frigo 冷藏续航：onTurnStart 回血（受伤时）', () => {
    const { state } = createBattle([mk('FrigoCamelo', 10)], [mk('TungSahur', 10)], 1);
    const fc = fighter(state, 'a', 'FrigoCamelo');
    fc.hp = 5;
    passiveOf('FrigoCamelo')!.onTurnStart!(pctx(state, fc));
    expect(fc.hp).toBeGreaterThan(5);
  });

  it('Boneca 轮胎滚压：暴击追加碾压伤害', () => {
    const { state } = createBattle([mk('BonecaAmbalabu', 10)], [mk('TrippiTroppi', 10)], 1);
    const ba = fighter(state, 'a', 'BonecaAmbalabu');
    const enemy = fighter(state, 'b', 'TrippiTroppi');
    const p = passiveOf('BonecaAmbalabu')!;
    const before = enemy.hp;
    p.onDealDamage!(pctx(state, ba), enemy, 10, false, false); // 非暴击：无追加
    expect(enemy.hp).toBe(before);
    p.onDealDamage!(pctx(state, ba), enemy, 10, true, false); // 暴击：追加
    expect(enemy.hp).toBeLessThan(before);
  });

  it('Tralalero 三足疾行：先攻加成 + 首击优势（不再必先手/必中）', () => {
    const p = passiveOf('TralaleroTralala')!;
    expect(p.initiativeBonus).toBe(5);
    // +5 先攻 → 多数种子下先手（但不绝对）：12 个种子里至少过半先手即可。
    let firstCount = 0;
    for (let seed = 0; seed < 12; seed++) {
      const { state } = createBattle([mk('TralaleroTralala', 10)], [mk('BonecaAmbalabu', 10)], seed);
      if (currentFighter(state)?.archetypeId === 'TralaleroTralala') firstCount++;
    }
    expect(firstCount).toBeGreaterThan(6);
  });

  it('Chimpanzini 香蕉外壳：受击跨越 75/50/25 血线破壳（+3/线，无上限），可重复触发', () => {
    const { state } = createBattle([mk('ChimpanziniBananini', 10)], [mk('TungSahur', 10)], 1);
    const cb = fighter(state, 'a', 'ChimpanziniBananini');
    const p = passiveOf('ChimpanziniBananini')!;
    const enemy = fighter(state, 'b', 'TungSahur');
    const max = cb.stats.maxHp;
    // 模拟一次「实际扣 raw 血后」的受击回调：受击前 = hp + raw
    const hitTo = (hpAfter: number, raw: number) => {
      cb.hp = hpAfter;
      p.onTakeHit!(pctx(state, cb), enemy, raw, false);
    };
    cb.energy = 0;
    // 90% → 80%：没跨线 → 不触发
    hitTo(Math.floor(max * 0.8), Math.ceil(max * 0.1));
    expect(cb.energy).toBe(0);
    // 80% → 70%：跨 75 线 → +3
    hitTo(Math.floor(max * 0.7), Math.floor(max * 0.8) - Math.floor(max * 0.7));
    expect(cb.energy).toBe(3);
    // 70% → 65%：同区间没跨线 → 不触发
    hitTo(Math.floor(max * 0.65), Math.floor(max * 0.7) - Math.floor(max * 0.65));
    expect(cb.energy).toBe(3);
    // 奶回 80% 再被打到 70%：再次跨 75 线 → 可重复触发，再 +3
    hitTo(Math.floor(max * 0.7), Math.floor(max * 0.8) - Math.floor(max * 0.7));
    expect(cb.energy).toBe(6);
    // 70% → 20%：一击连跨 50、25 两线 → +6（能量无上限，不封顶）
    hitTo(Math.floor(max * 0.2), Math.floor(max * 0.7) - Math.floor(max * 0.2));
    expect(cb.energy).toBe(12);
  });

  it('Patapim 林间回响：友方放 support 时给该施法友方回血（端到端）', () => {
    // 受伤的 FrigoCamelo 放 war_cry（support）→ 同队的 Patapim 触发 onAllySupport，回声给施法者回血。
    let { state } = createBattle(
      [mk('FrigoCamelo', 10, ['war_cry']), mk('BrrBrrPatapim', 10)],
      [mk('BombardiroCrocodilo', 12)], // 够肉，战斗不立即结束
      1,
    );
    let guard = 0;
    while (state.winner === undefined && currentFighter(state)?.archetypeId !== 'FrigoCamelo' && guard++ < 20) {
      const cur = currentFighter(state)!;
      state = applyAction(state, { kind: 'attack', target: attackRef(state, cur.team) }).state;
    }
    expect(currentFighter(state)?.archetypeId).toBe('FrigoCamelo');
    const fc = find(state, { team: 'a', id: 'FrigoCamelo' })!;
    fc.hp = 5; // 施法者受伤 → 回声有回血空间
    fc.energy = 5;
    const allyRefs = state.teams.a.filter((f) => !f.downed).map((f) => ({ team: f.team, id: f.id }));
    const r = applyAction(state, { kind: 'skill', skill: 'war_cry', targets: allyRefs });
    // 回声：施法者 FrigoCamelo 应收到一次（来自 Patapim 的）heal 事件。
    const echoed = r.events.some((e) => e.t === 'heal' && e.who.id === 'FrigoCamelo');
    expect(echoed).toBe(true);
  });

  it('冰封护盾：isControlImmune 随 controlImmuneTurns 生效', () => {
    const { state } = createBattle([mk('FrigoCamelo', 10)], [mk('TrippiTroppi', 10)], 1);
    const fc = fighter(state, 'a', 'FrigoCamelo');
    expect(isControlImmune(fc)).toBe(false);
    fc.controlImmuneTurns = 2;
    expect(isControlImmune(fc)).toBe(true);
  });
});
