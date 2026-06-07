import { useMemo, useState } from 'react';
import {
  SPECIES,
  SPECIES_NAMES,
  TYPE_LABEL,
  computeStats,
  simulateBattle,
  type BattleResult,
} from '@battle-pokemon/shared';
import { BattleStage } from './BattleStage.js';
import { useBattleReplay } from './useBattleReplay.js';

export function App() {
  const [mySpecies, setMySpecies] = useState('Charmander');
  const [myLevel, setMyLevel] = useState(8);
  const [enmSpecies, setEnmSpecies] = useState('Onix');
  const [enmLevel, setEnmLevel] = useState(8);

  const [result, setResult] = useState<BattleResult | null>(null);
  const { state, start, reset } = useBattleReplay(result);

  const onFight = () => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const r = simulateBattle(
      { species: mySpecies, level: myLevel },
      { species: enmSpecies, level: enmLevel },
      seed,
    );
    setResult(r);
    // 等 state 设置后再开始回放（result 是新引用，useBattleReplay 会拿到）
    setTimeout(start, 0);
  };

  return (
    <div className="app">
      <h1>Battle Pokemon <span className="sub">— Web 重写 · 战斗预览</span></h1>

      <div className="pickers">
        <PokePicker
          title="我方"
          species={mySpecies}
          level={myLevel}
          onSpecies={setMySpecies}
          onLevel={setMyLevel}
        />
        <div className="vs">VS</div>
        <PokePicker
          title="敌方"
          species={enmSpecies}
          level={enmLevel}
          onSpecies={setEnmSpecies}
          onLevel={setEnmLevel}
        />
      </div>

      <div className="controls">
        <button className="fight" onClick={onFight} disabled={state.playing}>
          {state.playing ? '战斗中…' : '⚔ 开打'}
        </button>
        <button onClick={reset} disabled={state.playing || !result}>
          重置
        </button>
      </div>

      <BattleStage a={state.a} b={state.b} />

      {state.finished && (
        <div className={`verdict ${state.winner === 'a' ? 'win' : state.winner === 'b' ? 'lose' : 'draw'}`}>
          {state.winner === 'a' ? '🎉 我方获胜！' : state.winner === 'b' ? '💀 我方落败' : '⚖ 同归于尽'}
        </div>
      )}

      <BattleLog lines={state.log} />
    </div>
  );
}

function PokePicker(props: {
  title: string;
  species: string;
  level: number;
  onSpecies: (s: string) => void;
  onLevel: (l: number) => void;
}) {
  const def = SPECIES[props.species]!;
  const stats = useMemo(
    () => computeStats(props.species, props.level),
    [props.species, props.level],
  );
  return (
    <div className="picker">
      <div className="picker-title">{props.title}</div>
      <select value={props.species} onChange={(e) => props.onSpecies(e.target.value)}>
        {SPECIES_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}（{TYPE_LABEL[SPECIES[n]!.type]}）
          </option>
        ))}
      </select>
      <label className="lvl">
        等级 {props.level}
        <input
          type="range"
          min={1}
          max={15}
          value={props.level}
          onChange={(e) => props.onLevel(Number(e.target.value))}
        />
      </label>
      <div className="stats">
        <span>类型 {TYPE_LABEL[def.type]}</span>
        <span>HP {stats.fullHp}</span>
        <span>攻 {stats.atk}</span>
        <span>防 {stats.def}</span>
        <span>攻速 {stats.interval}s</span>
      </div>
    </div>
  );
}

function BattleLog({ lines }: { lines: string[] }) {
  return (
    <div className="log">
      {lines.length === 0 ? (
        <div className="log-empty">选择双方精灵后点「开打」</div>
      ) : (
        lines.map((l, i) => <div key={i} className="log-line">{l}</div>)
      )}
    </div>
  );
}
