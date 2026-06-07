import { useEffect, useRef, useState } from 'react';
import {
  SKILLS,
  SPECIES_NAMES,
  ALL_SKILL_IDS,
  newPokemon,
  learnSkill,
  allocate,
  type Action,
  type PokemonInstance,
} from '@battle-pokemon/shared';
import { BuildEditor } from './BuildEditor.js';
import { BattleStage } from './BattleStage.js';
import { useBattle } from './useBattle.js';

/** 给敌方一个随机 build（随机精灵 + 随机加点 + 随机学 2~3 个技能），让 PvE 有变化。 */
function randomEnemy(level: number, seed: number): PokemonInstance {
  let rnd = seed >>> 0;
  const rand = () => {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    return rnd / 0xffffffff;
  };

  let p = { ...newPokemon(SPECIES_NAMES[Math.floor(rand() * SPECIES_NAMES.length)]!), level };

  // 把可用点随机撒到三属性，直到点数耗尽（allocate 点数不足时抛错跳出）
  const keys = ['str', 'dex', 'con'] as const;
  for (let guard = 0; guard < 200; guard++) {
    try {
      p = allocate(p, keys[Math.floor(rand() * 3)]!, 1);
    } catch {
      break;
    }
  }

  // 随机学 2~3 个技能
  const shuffled = [...ALL_SKILL_IDS].sort(() => rand() - 0.5);
  for (const s of shuffled.slice(0, 2 + Math.floor(rand() * 2))) {
    try {
      p = learnSkill(p, s);
    } catch {
      /* 已学过则跳过 */
    }
  }
  return p;
}

export function App() {
  const [me, setMe] = useState<PokemonInstance>(() => newPokemon('Charmander'));
  const battle = useBattle();
  const [phase, setPhase] = useState<'build' | 'battle'>('build');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [battle.log]);

  const onStart = () => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const enemy = randomEnemy(me.level, seed ^ 0x9e3779b9);
    battle.start(me, enemy, seed);
    setPhase('battle');
  };

  return (
    <div className="app">
      <h1>
        Battle Pokemon <span className="sub">— D&D 回合制 · build + 对战</span>
      </h1>

      {phase === 'build' ? (
        <>
          <div className="section-title">配置你的精灵</div>
          <BuildEditor poke={me} onChange={setMe} />
          <div className="controls">
            <button className="fight" onClick={onStart}>
              ⚔ 开始战斗（随机敌人）
            </button>
          </div>
        </>
      ) : (
        <>
          <BattleStage state={battle.state} />
          <ActionPanel battle={battle} />
          {battle.finished && (
            <div
              className={`verdict ${battle.winner === 'a' ? 'win' : battle.winner === 'b' ? 'lose' : 'draw'}`}
            >
              {battle.winner === 'a' ? '🎉 你赢了！' : battle.winner === 'b' ? '💀 你输了' : '⚖ 同归于尽'}
            </div>
          )}
          <div className="controls">
            <button onClick={() => setPhase('build')}>← 回到配置</button>
            <button className="fight" onClick={onStart} disabled={!battle.finished && !!battle.state}>
              再来一场
            </button>
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
  if (battle.finished) return null;
  if (!battle.myTurn) {
    return <div className="action-panel waiting">敌方行动中…</div>;
  }
  return (
    <div className="action-panel">
      <div className="ap-title">你的回合 — 选择行动</div>
      <div className="ap-buttons">
        {battle.actions.map((a, i) => (
          <button key={i} className="ap-btn" onClick={() => battle.act(a)} title={tip(a)}>
            {label(a)}
          </button>
        ))}
      </div>
    </div>
  );
}

function label(a: Action): string {
  return a.kind === 'attack' ? '普通攻击' : SKILLS[a.skill].name;
}
function tip(a: Action): string {
  return a.kind === 'attack' ? '1d6 + 力量 伤害' : SKILLS[a.skill].desc;
}
