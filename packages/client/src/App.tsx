import { useEffect, useRef, useState } from 'react';
import {
  SKILLS,
  generateEnemyTeam,
  currentFighter,
  archetypeName,
  type Action,
  type Combatant,
} from '@italian-brainrot/shared';
import { TeamCarousel, emptyTeam } from './TeamCarousel.js';
import { BuildEditor } from './BuildEditor.js';
import { BattleStage } from './BattleStage.js';
import { useBattle } from './useBattle.js';

type Step = 'select' | 'build' | 'battle';
const STEPS: { key: Step; label: string }[] = [
  { key: 'select', label: '① 选队' },
  { key: 'build', label: '② 养成' },
  { key: 'battle', label: '③ 战斗' },
];

export function App() {
  const [team, setTeam] = useState<Combatant[]>(() => emptyTeam());
  const battle = useBattle();
  const [step, setStep] = useState<Step>('select');
  const [editIdx, setEditIdx] = useState(0); // 养成步：正在调第几个出战角色
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log]);

  const canFight = team.length >= 1; // 至少 1 人即可出战（最多 LINEUP_SIZE）

  const setMember = (idx: number, c: Combatant) => {
    const next = [...team];
    next[idx] = c;
    setTeam(next);
  };

  const onStart = () => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const enemyLevel = team[0]?.level ?? 8;
    // 敌队人数 = 我方出战人数（等量对战）
    const enemy = generateEnemyTeam(enemyLevel, seed ^ 0x9e3779b9, team.length);
    battle.start(team, enemy, seed);
    setStep('battle');
  };

  return (
    <div className="app">
      <h1>
        意大利山海经 <span className="sub">Italian Brainrot — 3v3 D&D 队伍战</span>
      </h1>

      {/* 步骤指示条 */}
      <div className="stepbar">
        {STEPS.map((s, i) => (
          <span key={s.key} className={`stepbar-item ${step === s.key ? 'on' : ''}`}>
            {s.label}
            {i < STEPS.length - 1 && <span className="stepbar-sep">—</span>}
          </span>
        ))}
      </div>

      {step === 'select' ? (
        <>
          <TeamCarousel team={team} onChange={setTeam} />
          <div className="controls">
            <button
              className="fight"
              disabled={!canFight}
              onClick={() => {
                setEditIdx(0);
                setStep('build');
              }}
            >
              {canFight ? `下一步 · 养成 →（出战 ${team.length}）` : '至少选 1 人'}
            </button>
          </div>
        </>
      ) : step === 'build' ? (
        <>
          <div className="section-title">养成你的出战角色（加点 / 学技能）</div>
          <div className="lineup-tabs">
            {team.map((m, i) => (
              <button
                key={i}
                className={`lineup-tab ${i === editIdx ? 'on' : ''}`}
                onClick={() => setEditIdx(i)}
              >
                {archetypeName(m.archetypeId)}
                <small> Lv{m.level}</small>
              </button>
            ))}
          </div>
          {team[editIdx] && (
            <BuildEditor poke={team[editIdx]!} onChange={(c) => setMember(editIdx, c)} />
          )}
          <div className="controls">
            <button onClick={() => setStep('select')}>← 返回选队</button>
            <button className="fight" onClick={onStart}>
              ⚔ 开始战斗（随机敌队）
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="stage-wrap">
            <BattleStage
              state={battle.state}
              candidates={battle.pending?.candidates}
              onPickTarget={battle.chooseTarget}
            />
            {battle.finished && (
              <div className={`verdict-overlay ${battle.winner === 'a' ? 'win' : battle.winner === 'b' ? 'lose' : 'draw'}`}>
                <div className="verdict-text">
                  {battle.winner === 'a' ? '🎉 你的队伍获胜！' : battle.winner === 'b' ? '💀 你的队伍落败' : '⚖ 双方全灭'}
                </div>
              </div>
            )}
          </div>
          <ActionPanel battle={battle} />
          <div className="controls">
            <button onClick={() => setStep('select')}>← 重新选队</button>
            <button onClick={() => setStep('build')}>← 调整养成</button>
            <button className="fight" onClick={onStart}>
              再来一场
            </button>
            <label className="auto-toggle">
              <input
                type="checkbox"
                checked={battle.auto}
                onChange={(e) => battle.setAuto(e.target.checked)}
              />
              自动战斗
            </label>
            <label className="auto-toggle">
              速度
              <select
                value={battle.speed}
                onChange={(e) => battle.setSpeed(e.target.value as typeof battle.speed)}
              >
                <option value="1x">1x</option>
                <option value="2x">2x</option>
                <option value="instant">瞬间</option>
              </select>
            </label>
          </div>
          <div className="log" ref={logRef}>
            {battle.log.map((l, i) => (
              <div key={i} className="log-line">
                {l}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionPanel({ battle }: { battle: ReturnType<typeof useBattle> }) {
  if (!battle.state) return null;

  // 战斗结束：保持面板占位（不塌缩布局），胜负信息由战场蒙层展示。
  if (battle.finished) {
    return (
      <div className="action-panel">
        <div className="ap-title">战斗结束</div>
      </div>
    );
  }

  // 选目标阶段
  if (battle.pending) {
    return (
      <div className="action-panel">
        <div className="ap-title">
          选择目标（{battle.pending.skill ? SKILLS[battle.pending.skill as keyof typeof SKILLS].name : '普攻'}）
        </div>
        <div className="ap-hint">点击战场上高亮的角色作为目标</div>
        <div className="ap-buttons">
          {battle.pending.candidates.map((r, i) => (
            <button key={i} className="ap-btn" onClick={() => battle.chooseTarget(r)}>
              {r.team === 'a' ? '我方' : '敌方'} {r.id}
            </button>
          ))}
          <button className="ap-btn cancel" onClick={battle.cancelPending}>
            取消
          </button>
        </div>
      </div>
    );
  }

  const cur = currentFighter(battle.state);
  const waiting = !battle.myTurn;
  const curName = cur ? archetypeName(cur.id) : '';
  // 标题按「显示态当前角色属于哪队」判断，回放中也给出有意义的回合归属，而非笼统的"回放中"。
  const title = cur?.team === 'b'
    ? `敌方回合 · ${curName}`
    : battle.auto
      ? `自动战斗 · ${curName}`
      : cur?.team === 'a'
        ? `${curName} 的回合`
        : '你的回合';

  return (
    <div className="action-panel">
      <div className="ap-title">
        {title}
        <span className="ap-slots">⚡ 能量 {battle.myEnergy}</span>
      </div>
      <div className="ap-buttons">
        {battle.actions.map((opt, i) => (
          <button
            key={i}
            className={`ap-btn ${opt.usable ? '' : 'disabled'}`}
            onClick={() => opt.usable && battle.choose(opt.action)}
            disabled={!opt.usable}
            title={tip(opt.action)}
          >
            {label(opt.action)}
            {cost(opt.action) > 0 && <small className="ap-cost">⚡×{cost(opt.action)}</small>}
            {!waiting && !opt.usable && opt.reason && <small className="ap-reason">{opt.reason}</small>}
          </button>
        ))}
      </div>
      {waiting && !battle.auto && (
        <div className="ap-overlay">
          <span>{cur?.team === 'b' ? '敌方行动中…' : '处理中…'}</span>
        </div>
      )}
    </div>
  );
}

function label(a: Action): string {
  return a.kind === 'attack' ? '普通攻击' : SKILLS[a.skill].name;
}
function cost(a: Action): number {
  return a.kind === 'attack' ? 0 : SKILLS[a.skill].cost;
}
function tip(a: Action): string {
  return a.kind === 'attack' ? '1d6 + 力量 伤害（命中后按 CON 吸血）' : SKILLS[a.skill].desc;
}
