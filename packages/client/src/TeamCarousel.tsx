/**
 * 选队转盘 —— 三步向导第 1 步。
 *
 * 12 个角色排成环形队列，中央位放大展示（属性 → 简介 → sprite），左右切换循环。
 * 中央位「+ 加入出战」入队（已在队 → 显示「✓ 已在队中」可移除）。
 * 下方队伍槽位条：已选角色（× 删除）+ 空槽。出战固定 LINEUP_SIZE 人。
 *
 * 转盘只挑「哪 3 个角色」；具体养成（加点/学技能）在第 2 步。
 */
import { useState } from 'react';
import {
  ARCHETYPE_IDS,
  LINEUP_SIZE,
  SKILLS,
  archetypeName,
  newCombatant,
  abilitiesOf,
  type Combatant,
} from '@italian-brainrot/shared';
import { fighterSprite } from './presentation.js';
import { useI18n, blurb, skillName, skillDesc, passiveInfo } from './i18n.js';

export function TeamCarousel({
  team,
  onChange,
}: {
  team: Combatant[];
  onChange: (team: Combatant[]) => void;
}) {
  const { lang, t } = useI18n();
  const ids = ARCHETYPE_IDS;
  const n = ids.length;
  const [idx, setIdx] = useState(0);

  const usedIds = new Set(team.map((m) => m.archetypeId));
  const full = team.length >= LINEUP_SIZE;

  const wrap = (i: number) => ((i % n) + n) % n;
  const prev = () => setIdx((i) => wrap(i - 1));
  const next = () => setIdx((i) => wrap(i + 1));

  const centerId = ids[idx]!;
  const inTeam = usedIds.has(centerId);

  const addCenter = () => {
    if (inTeam || full) return;
    onChange([...team, newCombatant(centerId)]);
  };
  const removeId = (id: string) => onChange(team.filter((m) => m.archetypeId !== id));
  const toggleCenter = () => (inTeam ? removeId(centerId) : addCenter());

  const center = newCombatant(centerId);
  const ab = abilitiesOf(center); // 1 级天赋属性
  const sigId = center.skills[0]; // 签名技能（出生自带）
  const passive = passiveInfo(centerId, lang);

  return (
    <div className="carousel">
      <div className="carousel-count">
        {t.pickTeam} <b>{team.length}/{LINEUP_SIZE}</b>
        <small className="carousel-hint">{t.pickHintSize(LINEUP_SIZE)}</small>
      </div>

      {/* 属性（最上）+ 技能速览 (i) */}
      <div className="carousel-stats">
        <span className="stat str">STR {ab.str}</span>
        <span className="stat dex">DEX {ab.dex}</span>
        <span className="stat con">CON {ab.con}</span>
        <span className="info-i" aria-label={t.infoAria}>
          i
          <div className="info-tip">
            {sigId && (
              <div className="info-block">
                <div className="info-title">
                  {t.infoSig} · {skillName(sigId, lang)}
                  <span className={`cost-badge ${SKILLS[sigId].cost === 0 ? 'free' : 'spell'}`}>
                    {SKILLS[sigId].cost === 0 ? t.fcNoCost : `⚡×${SKILLS[sigId].cost}`}
                  </span>
                </div>
                <div className="info-desc">{skillDesc(sigId, lang)}</div>
              </div>
            )}
            {passive && (
              <div className="info-block">
                <div className="info-title">{t.infoPassive} · {passive.name}</div>
                <div className="info-desc">{passive.desc}</div>
              </div>
            )}
          </div>
        </span>
      </div>

      {/* 简介（属性与角色之间） */}
      <div className="carousel-blurb">{blurb(centerId, lang)}</div>

      {/* 角色转盘：环形定位，按到中心的有向偏移做平移 + 缩放过渡（CSS transition 驱动动画） */}
      <div className="carousel-stage">
        <button className="carousel-arrow" onClick={prev} aria-label={t.prevAria}>‹</button>

        <div className="carousel-track">
          {ids.map((id, i) => {
            // 有向偏移（-n/2..n/2），让切换时从最近的方向滑入
            let off = i - idx;
            if (off > n / 2) off -= n;
            if (off < -n / 2) off += n;
            const visible = Math.abs(off) <= 2;
            const isCenter = off === 0;
            const centerInTeam = isCenter && usedIds.has(id);
            return (
              <div
                key={id}
                className={`carousel-item ${isCenter ? 'center' : ''} ${centerInTeam ? 'in-team' : ''}`}
                style={{
                  transform: `translateX(${off * 220}px) scale(${isCenter ? 1 : 0.55})`,
                  opacity: visible ? (isCenter ? 1 : 0.4) : 0,
                  zIndex: 10 - Math.abs(off),
                  pointerEvents: visible && !isCenter ? 'auto' : 'none',
                }}
                onClick={() => !isCenter && visible && setIdx(i)}
              >
                <img src={fighterSprite(id)} alt={archetypeName(id)} />
                {centerInTeam && <div className="carousel-badge">{t.inTeamBadge}</div>}
              </div>
            );
          })}
        </div>

        <button className="carousel-arrow" onClick={next} aria-label={t.nextAria}>›</button>
      </div>

      <div className="carousel-name">{archetypeName(centerId)}</div>

      <button
        className={`carousel-add ${inTeam ? 'remove' : ''}`}
        onClick={toggleCenter}
        disabled={!inTeam && full}
      >
        {inTeam ? t.inTeamRemove : full ? t.teamFull : t.addToTeam}
      </button>

      {/* 队伍槽位条 */}
      <div className="team-slots">
        {Array.from({ length: LINEUP_SIZE }).map((_, i) => {
          const m = team[i];
          if (!m) {
            return (
              <div key={i} className="slot empty">
                <span className="slot-plus">+</span>
              </div>
            );
          }
          return (
            <div key={i} className="slot filled" title={archetypeName(m.archetypeId)}>
              <img src={fighterSprite(m.archetypeId)} alt={archetypeName(m.archetypeId)} />
              <button className="slot-remove" onClick={() => removeId(m.archetypeId)} aria-label={t.removeAria}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 造一支默认空队（让玩家自己从转盘选）。 */
export function emptyTeam(): Combatant[] {
  return [];
}
