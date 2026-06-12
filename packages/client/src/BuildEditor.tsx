/**
 * 养成编辑器：调等级 + 加点/洗点 + 选学技能。
 * 战斗前用它配好我方 build。所有变更走 shared/leveling 的纯函数。
 */
import {
  ABILITY_KEYS,
  ABILITY_LABEL,
  SKILLS,
  MAX_EQUIPPED_SKILLS,
  MAX_ABILITY,
  archetypeName,
  statsOf,
  abilitiesOf,
  allocate,
  respec,
  availablePoints,
  learnableSkills,
  learnSkill,
  forgetSkill,
  canLearn,
  learnBlockReason,
  signatureOwner,
  isOwnSignature,
  type Combatant,
  type AbilityKey,
  type SkillId,
} from '@italian-brainrot/shared';
import { fighterPassive } from './presentation.js';

export function BuildEditor({
  poke,
  onChange,
}: {
  poke: Combatant;
  onChange: (p: Combatant) => void;
}) {
  const stats = statsOf(poke);
  const abil = abilitiesOf(poke);
  const pts = availablePoints(poke);
  const learnable = learnableSkills(poke);

  const setLevel = (level: number) => {
    // 改等级后若可用点变负（降级），洗点重置以保持合法
    const next = { ...poke, level };
    onChange(availablePoints(next) < 0 ? respec(next) : next);
  };

  return (
    <div className="build build-cols">
      {/* 左列：加点 */}
      <div className="build-col build-col-left">
        <div className="build-row">
          <span className="build-name">{archetypeName(poke.archetypeId)}</span>
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

        <div className="col-title">属性加点</div>
        <div className="abilities">
          {ABILITY_KEYS.map((k) => (
            <AbilityRow
              key={k}
              akey={k}
              value={abil[k]}
              canAdd={pts > 0 && abil[k] < MAX_ABILITY}
              canSub={poke.allocations[k] > 0}
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
          <span>⚡ 能量上限 {stats.maxEnergy}</span>
          {stats.lifestealRate > 0 && <span>🩸 吸血 {Math.round(stats.lifestealRate * 100)}%</span>}
        </div>

        {/* 已学技能放左列底部：固定 MAX_EQUIPPED_SKILLS 个槽位，高度恒定，不随增删抖动 */}
        <div className="col-title">
          已学技能（{poke.skills.length} / {MAX_EQUIPPED_SKILLS}）
        </div>
        <div className="equipped-slots">
          {Array.from({ length: MAX_EQUIPPED_SKILLS }).map((_, i) => {
            const id = poke.skills[i];
            if (!id) return <div key={i} className="eq-slot empty">空技能位</div>;
            const signature = isOwnSignature(poke, id);
            return (
              <div key={i} className={`eq-slot filled ${signature ? 'signature' : ''}`}>
                <div className="eq-row">
                  <SkillHeader id={id} />
                  {signature ? (
                    <span className="sig-tag">专属</span>
                  ) : (
                    <button className="forget-btn" onClick={() => onChange(forgetSkill(poke, id))}>
                      ✕ 卸下
                    </button>
                  )}
                </div>
                <div className="eq-desc">{SKILLS[id].desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右列：被动 + 技能池 */}
      <div className="build-col build-col-right">
        {/* 天生被动：不占技能栏、不可选——配技能前先让玩家看到它 */}
        {(() => {
          const p = fighterPassive(poke.archetypeId);
          if (!p) return null;
          return (
            <>
              <div className="skills-title">天生被动（不占技能栏）</div>
              <div className="passive-card">
                <div className="skill-head">
                  <span className="skill-name">✨ {p.name}</span>
                  <span className="cost-badge passive">被动</span>
                </div>
                <div className="skill-desc">{p.desc}</div>
              </div>
            </>
          );
        })()}
        <div className="skills">
          <div className="skills-title">
            技能池（按解锁等级排序）
            {poke.skills.length >= MAX_EQUIPPED_SKILLS && <span className="bar-full"> · 技能栏已满</span>}
          </div>
          {learnable.length === 0 ? (
            <div className="hint">已无可学技能</div>
          ) : (
            <div className="skill-list">
              {learnable.map((id) => {
                const ok = canLearn(poke, id);
                const reason = learnBlockReason(poke, id);
                // 是否有「解锁门槛」（等级 or 签名专属）。只有有门槛的技能才显示解锁状态行，
                // Lv1 普通技能不显示（避免冗余「可学习」，也让它们矮一点）。
                const levelGate = SKILLS[id].unlockLevel > 1;
                const sigGate = !!signatureOwner(id);
                const gated = levelGate || sigGate;
                const gateMet = poke.level >= SKILLS[id].unlockLevel; // 签名门槛在 learnable 已过滤
                return (
                  <button
                    key={id}
                    className={`skill-card learn ${ok ? '' : 'locked'}`}
                    onClick={() => ok && onChange(learnSkill(poke, id))}
                    disabled={!ok}
                  >
                    <SkillHeader id={id} prefix={!gated ? '＋ ' : gateMet ? '🔓 ' : '🔒 '} />
                    <div className="skill-desc">{SKILLS[id].desc}</div>
                    {/* 有门槛的技能：那行始终在，升级前显示原因+🔒，达成后原地替换为「已解锁」+🔓 */}
                    {gated && (
                      <div className={`skill-status ${gateMet ? 'ok' : 'locked'}`}>
                        {gateMet ? '已解锁' : reason}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const COST_LABEL: Record<number, string> = {
  0: '0 能量',
  1: '⚡×1',
  2: '⚡×2',
  3: '⚡×3',
};

/** 技能名 + 消耗徽章 + 解锁等级。 */
function SkillHeader({ id, prefix = '' }: { id: SkillId; prefix?: string }) {
  const def = SKILLS[id];
  return (
    <div className="skill-head">
      <span className="skill-name">
        {prefix}
        {def.name}
        {def.unlockLevel > 1 && <small className="unlock"> Lv{def.unlockLevel}</small>}
      </span>
      <span className={`cost-badge ${def.cost === 0 ? 'free' : 'spell'}`}>
        {COST_LABEL[def.cost]}
      </span>
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
