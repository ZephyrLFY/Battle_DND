import { useEffect, useRef, useState } from 'react';
import {
  SKILLS,
  generateEnemyTeam,
  currentFighter,
  type Action,
  type Combatant,
} from '@battle-pokemon/shared';
import { TeamEditor, defaultTeam } from './TeamEditor.js';
import { BattleStage } from './BattleStage.js';
import { useBattle } from './useBattle.js';

export function App() {
  const [team, setTeam] = useState<Combatant[]>(() => defaultTeam());
  const battle = useBattle();
  const [phase, setPhase] = useState<'build' | 'battle'>('build');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log]);

  const onStart = () => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const enemyLevel = team[0]?.level ?? 8;
    const enemy = generateEnemyTeam(enemyLevel, seed ^ 0x9e3779b9);
    battle.start(team, enemy, seed);
    setPhase('battle');
  };

  return (
    <div className="app">
      <h1>
        Battle Pokemon <span className="sub">— 3v3 D&D 队伍战</span>
      </h1>

      {phase === 'build' ? (
        <>
          <div className="section-title">配置你的队伍（3 人出战）</div>
          <TeamEditor team={team} onChange={setTeam} />
          <div className="controls">
            <button className="fight" onClick={onStart}>
              ⚔ 开始战斗（随机敌队）
            </button>
          </div>
        </>
      ) : (
        <>
          <BattleStage
            state={battle.state}
            candidates={battle.pending?.candidates}
            onPickTarget={battle.chooseTarget}
          />
          <ActionPanel battle={battle} />
          <div className={`verdict ${battle.winner === 'a' ? 'win' : battle.winner === 'b' ? 'lose' : 'draw'}`}>
            {battle.finished
              ? battle.winner === 'a'
                ? '🎉 你的队伍获胜！'
                : battle.winner === 'b'
                  ? '💀 你的队伍落败'
                  : '⚖ 双方全灭'
              : ' '}
          </div>
          <div className="controls">
            <button onClick={() => setPhase('build')}>← 回到配置</button>
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
  if (battle.finished || !battle.state) return null;

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
  const actorName = cur?.team === 'a' ? cur.id : null;

  return (
    <div className="action-panel">
      <div className="ap-title">
        {battle.auto ? '自动战斗中…' : actorName ? `${actorName} 的回合` : '你的回合'}
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
          <span>敌方行动中…</span>
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
