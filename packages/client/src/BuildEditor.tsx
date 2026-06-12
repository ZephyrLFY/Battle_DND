/**
 * 养成编辑器：调等级 + 加点/洗点 + 选学技能。
 * 战斗前用它配好我方 build。所有变更走 shared/leveling 的纯函数。
 */
import {
  ABILITY_KEYS,
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
import { useI18n, skillName, skillDesc, abilityLabel, learnReasonText, type Lang } from './i18n.js';

export function BuildEditor({
  poke,
  onChange,
}: {
  poke: Combatant;
  onChange: (p: Combatant) => void;
}) {
  const { lang, t } = useI18n();
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
            {t.level} {poke.level}
            <input
              type="range"
              min={1}
              max={15}
              value={poke.level}
              onChange={(e) => setLevel(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="col-title">{t.allocTitle}</div>
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
          <span className={`pts ${pts > 0 ? 'has' : ''}`}>{t.ptsLeft(pts)}</span>
          <button onClick={() => onChange(respec(poke))}>{t.respec}</button>
        </div>

        <div className="derived">
          <span>HP {stats.maxHp}</span>
          <span>AC {stats.ac}</span>
          <span>{t.statHit} +{stats.toHit}</span>
          <span>{t.statDmg} +{stats.dmgBonus}</span>
          <span>{t.statInit} {fmt(stats.initiative)}</span>
          <span>{t.statEnergyCap} {stats.maxEnergy}</span>
          {stats.lifestealRate > 0 && <span>{t.statLifesteal} {Math.round(stats.lifestealRate * 100)}%</span>}
        </div>

        {/* 已学技能放左列底部：固定 MAX_EQUIPPED_SKILLS 个槽位，高度恒定，不随增删抖动 */}
        <div className="col-title">
          {t.learnedTitle(poke.skills.length, MAX_EQUIPPED_SKILLS)}
        </div>
        <div className="equipped-slots">
          {Array.from({ length: MAX_EQUIPPED_SKILLS }).map((_, i) => {
            const id = poke.skills[i];
            if (!id) return <div key={i} className="eq-slot empty">{t.emptySlot}</div>;
            const signature = isOwnSignature(poke, id);
            return (
              <div key={i} className={`eq-slot filled ${signature ? 'signature' : ''}`}>
                <div className="eq-row">
                  <SkillHeader id={id} lang={lang} costFree={t.costFree} />
                  {signature ? (
                    <span className="sig-tag">{t.sigTag}</span>
                  ) : (
                    <button className="forget-btn" onClick={() => onChange(forgetSkill(poke, id))}>
                      {t.unequip}
                    </button>
                  )}
                </div>
                <div className="eq-desc">{skillDesc(id, lang)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右列：技能池 */}
      <div className="build-col build-col-right">
        <div className="skills">
          <div className="skills-title">
            {t.poolTitle}
            {poke.skills.length >= MAX_EQUIPPED_SKILLS && <span className="bar-full">{t.barFull}</span>}
          </div>
          {learnable.length === 0 ? (
            <div className="hint">{t.noLearnable}</div>
          ) : (
            <div className="skill-list">
              {learnable.map((id) => {
                const ok = canLearn(poke, id);
                const reason = lang === 'zh' ? learnBlockReason(poke, id) : learnReasonText(poke, id, lang);
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
                    <SkillHeader id={id} lang={lang} costFree={t.costFree} prefix={!gated ? '＋ ' : gateMet ? '🔓 ' : '🔒 '} />
                    <div className="skill-desc">{skillDesc(id, lang)}</div>
                    {/* 有门槛的技能：那行始终在，升级前显示原因+🔒，达成后原地替换为「已解锁」+🔓 */}
                    {gated && (
                      <div className={`skill-status ${gateMet ? 'ok' : 'locked'}`}>
                        {gateMet ? t.unlocked : reason}
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

/** 技能名 + 消耗徽章 + 解锁等级。 */
function SkillHeader({ id, lang, costFree, prefix = '' }: { id: SkillId; lang: Lang; costFree: string; prefix?: string }) {
  const def = SKILLS[id];
  return (
    <div className="skill-head">
      <span className="skill-name">
        {prefix}
        {skillName(id, lang)}
        {def.unlockLevel > 1 && <small className="unlock"> Lv{def.unlockLevel}</small>}
      </span>
      <span className={`cost-badge ${def.cost === 0 ? 'free' : 'spell'}`}>
        {def.cost === 0 ? costFree : `⚡×${def.cost}`}
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
  const { lang } = useI18n();
  const mod = Math.floor((value - 10) / 2);
  return (
    <div className="ability">
      <span className="ab-name">{abilityLabel(akey, lang)}</span>
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
