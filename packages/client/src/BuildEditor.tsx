/**
 * 养成编辑器：选精灵 + 调等级 + 加点/洗点 + 选学技能。
 * 战斗前用它配好我方 build。所有变更走 shared/leveling 的纯函数。
 */
import {
  SPECIES_NAMES,
  ABILITY_KEYS,
  ABILITY_LABEL,
  SKILLS,
  newPokemon,
  statsOf,
  allocate,
  respec,
  availablePoints,
  learnableSkills,
  learnSkill,
  type PokemonInstance,
  type AbilityKey,
} from '@battle-pokemon/shared';

export function BuildEditor({
  poke,
  onChange,
}: {
  poke: PokemonInstance;
  onChange: (p: PokemonInstance) => void;
}) {
  const stats = statsOf(poke);
  const pts = availablePoints(poke);
  const learnable = learnableSkills(poke);

  const setSpecies = (species: string) => onChange(newPokemon(species));
  const setLevel = (level: number) => {
    // 改等级后若可用点变负（降级），洗点重置以保持合法
    const next = { ...poke, level };
    onChange(availablePoints(next) < 0 ? respec(next) : next);
  };

  return (
    <div className="build">
      <div className="build-row">
        <select value={poke.species} onChange={(e) => setSpecies(e.target.value)}>
          {SPECIES_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <label className="lvl">
          等级 {poke.level}
          <input
            type="range"
            min={1}
            max={15}
            value={poke.level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="abilities">
        {ABILITY_KEYS.map((k) => (
          <AbilityRow
            key={k}
            akey={k}
            value={poke.abilities[k]}
            canAdd={pts > 0 && poke.abilities[k] < 20}
            canSub={poke.abilities[k] > newPokemon(poke.species).abilities[k]}
            onAdd={() => onChange(allocate(poke, k, 1))}
            onSub={() => onChange(allocate(poke, k, -1))}
          />
        ))}
      </div>

      <div className="build-controls">
        <span className={`pts ${pts > 0 ? 'has' : ''}`}>剩余点数：{pts}</span>
        <button onClick={() => onChange(respec(poke))}>洗点</button>
      </div>

      <div className="derived">
        <span>HP {stats.maxHp}</span>
        <span>AC {stats.ac}</span>
        <span>命中 +{stats.toHit}</span>
        <span>伤害 +{stats.dmgBonus}</span>
        <span>先攻 {fmt(stats.initiative)}</span>
      </div>

      <div className="skills">
        <div className="skills-title">已学技能（{poke.skills.length}）</div>
        {poke.skills.length === 0 && <div className="hint">还没学技能</div>}
        <div className="skill-tags">
          {poke.skills.map((id) => (
            <span key={id} className="skill-tag learned" title={SKILLS[id].desc}>
              {SKILLS[id].name}
            </span>
          ))}
        </div>
        {learnable.length > 0 && (
          <>
            <div className="skills-title">可学（点击学习）</div>
            <div className="skill-tags">
              {learnable.map((id) => (
                <button
                  key={id}
                  className="skill-tag learn"
                  title={SKILLS[id].desc}
                  onClick={() => onChange(learnSkill(poke, id))}
                >
                  + {SKILLS[id].name}
                  <small> CD{SKILLS[id].cooldown}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AbilityRow({
  akey,
  value,
  canAdd,
  canSub,
  onAdd,
  onSub,
}: {
  akey: AbilityKey;
  value: number;
  canAdd: boolean;
  canSub: boolean;
  onAdd: () => void;
  onSub: () => void;
}) {
  const mod = Math.floor((value - 10) / 2);
  return (
    <div className="ability">
      <span className="ab-name">{ABILITY_LABEL[akey]}</span>
      <button className="ab-btn" onClick={onSub} disabled={!canSub}>
        −
      </button>
      <span className="ab-val">
        {value} <small>({mod >= 0 ? `+${mod}` : mod})</small>
      </span>
      <button className="ab-btn" onClick={onAdd} disabled={!canAdd}>
        +
      </button>
    </div>
  );
}

const fmt = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
