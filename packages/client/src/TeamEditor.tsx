/**
 * 队伍编辑器：管理 3 个出战角色（archetypeId 不重复），逐个配 build。
 * 队内不能选重复角色——已被其他位选走的角色在下拉里禁用。
 */
import { useState } from 'react';
import {
  ARCHETYPE_IDS,
  LINEUP_SIZE,
  newCombatant,
  type Combatant,
} from '@battle-pokemon/shared';
import { BuildEditor } from './BuildEditor.js';

export function TeamEditor({
  team,
  onChange,
}: {
  team: Combatant[];
  onChange: (team: Combatant[]) => void;
}) {
  const [active, setActive] = useState(0);
  const usedIds = new Set(team.map((m) => m.archetypeId));

  const setMember = (idx: number, c: Combatant) => {
    const next = [...team];
    next[idx] = c;
    onChange(next);
  };

  const swapArchetype = (idx: number, id: string) => {
    if (usedIds.has(id) && team[idx]!.archetypeId !== id) return; // 防重复
    // 换角色时保留等级
    setMember(idx, { ...newCombatant(id), level: team[idx]!.level });
  };

  return (
    <div className="team-editor">
      <div className="lineup-tabs">
        {team.map((m, i) => (
          <button
            key={i}
            className={`lineup-tab ${i === active ? 'on' : ''}`}
            onClick={() => setActive(i)}
          >
            出战{i + 1}：{m.archetypeId}
            <small> Lv{m.level}</small>
          </button>
        ))}
      </div>

      <div className="member-pick">
        <label>
          角色：
          <select
            value={team[active]!.archetypeId}
            onChange={(e) => swapArchetype(active, e.target.value)}
          >
            {ARCHETYPE_IDS.map((id) => (
              <option
                key={id}
                value={id}
                disabled={usedIds.has(id) && team[active]!.archetypeId !== id}
              >
                {id}
                {usedIds.has(id) && team[active]!.archetypeId !== id ? '（已选）' : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="lineup-hint">队内不可重复 · 出战 {LINEUP_SIZE} 人</span>
      </div>

      <BuildEditor poke={team[active]!} onChange={(c) => setMember(active, c)} />
    </div>
  );
}

/** 造一支默认的 3 人不重复队伍。 */
export function defaultTeam(): Combatant[] {
  return [newCombatant('Charmander'), newCombatant('Onix'), newCombatant('Pikachu')];
}
