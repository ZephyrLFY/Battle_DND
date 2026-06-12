import { useEffect, useState } from 'react';
import {
  SKILLS,
  generateEnemyTeam,
  currentFighter,
  archetypeName,
  signatureOwner,
  type Action,
  type Combatant,
  type FighterRT,
} from '@italian-brainrot/shared';
import { TeamCarousel, emptyTeam } from './TeamCarousel.js';
import { BuildEditor } from './BuildEditor.js';
import { BattleStage } from './BattleStage.js';
import { useBattle } from './useBattle.js';
import { backgroundUrl, fighterSprite } from './presentation.js';
import { useI18n, skillName, skillDesc, actionReason, type Lang } from './i18n.js';
import { eventToLines } from './battleLog.js';

const BG_STORAGE_KEY = 'battle.bg';
const THEME_KEY = 'ui.theme';
type Theme = 'dark' | 'light';

type SideTab = 'log' | 'a' | 'b';

type Step = 'select' | 'build' | 'battle';
const STEP_KEYS: Step[] = ['select', 'build', 'battle'];

export function App() {
  const { lang, t, toggle } = useI18n();
  const [team, setTeam] = useState<Combatant[]>(() => emptyTeam());
  const battle = useBattle();
  const [step, setStep] = useState<Step>('select');
  const [editIdx, setEditIdx] = useState(0); // 养成步：正在调第几个出战角色
  const [sideTab, setSideTab] = useState<SideTab>('log'); // 战斗页左侧栏：日志/我方/敌方

  // 战场背景：manifest.json 列出可选项（由美术管线生成）；'' = 默认渐变。选择记住在本地。
  const [bgList, setBgList] = useState<string[]>([]);
  const [bg, setBg] = useState<string>(() => localStorage.getItem(BG_STORAGE_KEY) ?? '');
  useEffect(() => {
    fetch('/backgrounds/manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((names: unknown) => {
        if (Array.isArray(names)) setBgList(names.filter((n): n is string => typeof n === 'string'));
      })
      .catch(() => setBgList([])); // 无 manifest（还没生成背景）→ 只有默认项
  }, []);
  const pickBg = (name: string) => {
    setBg(name);
    localStorage.setItem(BG_STORAGE_KEY, name);
  };

  // 日/夜主题：documentElement[data-theme] 驱动 CSS 变量；默认夜间
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const toggleTheme = () => setTheme((th) => (th === 'dark' ? 'light' : 'dark'));

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
    <div className={`app ${step === 'battle' ? 'app-wide' : ''}`}>
      {/* 右上角：日/夜主题切换（太阳/月亮）+ 语言切换（文A） */}
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        title={theme === 'dark' ? t.themeToLight : t.themeToDark}
        aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
      >
        {theme === 'dark' ? (
          // 夜间模式中显示太阳（点击 → 日间）
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
            <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
          </svg>
        ) : (
          // 日间模式中显示月亮（点击 → 夜间）
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M20.8 14.1A8.5 8.5 0 0 1 9.9 3.2a8.5 8.5 0 1 0 10.9 10.9z" />
          </svg>
        )}
      </button>
      <button className="lang-toggle" onClick={toggle} title={t.langToggleTitle} aria-label={t.langToggleTitle}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <text x="2" y="11" fontSize="11" fontWeight="700">文</text>
          <text x="12" y="21" fontSize="11" fontWeight="700">A</text>
          <path d="M13.5 4.5 L16 2 L16 3.6 L21 3.6 L21 5.4 L16 5.4 L16 7 Z" />
          <path d="M10.5 19.5 L8 22 L8 20.4 L3 20.4 L3 18.6 L8 18.6 L8 17 Z" />
        </svg>
        <span>{lang === 'zh' ? 'EN' : '中'}</span>
      </button>

      <h1>
        {t.title} <span className="sub">{t.titleSub}</span>
      </h1>

      {/* 步骤指示条 */}
      <div className="stepbar">
        {STEP_KEYS.map((key, i) => (
          <span key={key} className={`stepbar-item ${step === key ? 'on' : ''}`}>
            {t.steps[i]}
            {i < STEP_KEYS.length - 1 && <span className="stepbar-sep">—</span>}
          </span>
        ))}
      </div>

      {step === 'select' ? (
        <>
          <TeamCarousel team={team} onChange={setTeam} />
          <div className="controls controls-select">
            <button
              className="fight"
              disabled={!canFight}
              onClick={() => {
                setEditIdx(0);
                setStep('build');
              }}
            >
              {canFight ? t.selectNext(team.length) : t.needOne}
            </button>
          </div>
        </>
      ) : step === 'build' ? (
        <>
          <div className="section-title">{t.buildTitle}</div>
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
            <button onClick={() => setStep('select')}>{t.backToSelect}</button>
            <button className="fight" onClick={onStart}>
              {t.startFight}
            </button>
          </div>
        </>
      ) : (
        <div className="battle-layout">
          {/* 左侧信息栏：战斗日志 / 我方 / 敌方。
              内层 absolute 填充：内容不撑高页面，高度恒随右列，内部滚动。 */}
          <aside className="battle-side">
            <div className="side-inner">
              <div className="side-tabs">
                {([
                  ['log', t.sideTabLog],
                  ['a', t.sideTabAlly],
                  ['b', t.sideTabEnemy],
                ] as [SideTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`side-tab ${sideTab === key ? 'on' : ''}`}
                    onClick={() => setSideTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {sideTab === 'log' ? (
                <div className="side-content side-log">
                  {battle.logEvents.length === 0 && <div className="log-empty">{t.logPlaceholder}</div>}
                  {/* 倒序：最新一行在最上面，无需自动滚动；切语言时历史日志整体跟切 */}
                  {battle.logEvents
                    .flatMap((ev, i) =>
                      eventToLines(ev, lang).map((l, j) => (
                        <div key={`${i}-${j}`} className="log-line">
                          {l}
                        </div>
                      )),
                    )
                    .reverse()}
                </div>
              ) : (
                <div className="side-content">
                  <TeamPanel fighters={battle.state?.teams[sideTab] ?? []} lang={lang} />
                </div>
              )}
            </div>
          </aside>

          {/* 右侧：战场 + 操作面板 */}
          <div className="battle-main">
            <div className="stage-wrap">
              {/* 背景选择：浮在战场右上角的 HUD 胶囊 */}
              <div className="bg-picker" title={t.bgLabel}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
                  <path d="M5 17l4.5-4.5 3 3L17 11l2 2" />
                </svg>
                <select value={bg} onChange={(e) => pickBg(e.target.value)}>
                  <option value="">{t.bgDefault}</option>
                  {bgList.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="bg-picker-arrow">▾</span>
              </div>
              <BattleStage
                state={battle.state}
                candidates={battle.pending?.candidates}
                onPickTarget={battle.chooseTarget}
                poses={battle.poses}
                lunges={battle.lunges}
                floats={battle.floats}
                background={bg ? backgroundUrl(bg) : null}
              />
              {battle.finished && (
                <div className={`verdict-overlay ${battle.winner === 'a' ? 'win' : battle.winner === 'b' ? 'lose' : 'draw'}`}>
                  <div className="verdict-text">
                    {battle.winner === 'a' ? t.verdictWin : battle.winner === 'b' ? t.verdictLose : t.verdictDraw}
                  </div>
                </div>
              )}
            </div>
            <ActionPanel battle={battle} />
            <div className="controls">
              <button onClick={() => setStep('select')}>{t.reSelect}</button>
              <button onClick={() => setStep('build')}>{t.adjustBuild}</button>
              <button className="fight" onClick={onStart}>
                {t.again}
              </button>
              <label className="auto-toggle">
                <input
                  type="checkbox"
                  checked={battle.auto}
                  onChange={(e) => battle.setAuto(e.target.checked)}
                />
                {t.autoBattle}
              </label>
              <label className="auto-toggle">
                {t.speed}
                <select
                  value={battle.speed}
                  onChange={(e) => battle.setSpeed(e.target.value as typeof battle.speed)}
                >
                  <option value="1x">1x</option>
                  <option value="2x">2x</option>
                  <option value="instant">{t.instant}</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionPanel({ battle }: { battle: ReturnType<typeof useBattle> }) {
  const { lang, t } = useI18n();
  if (!battle.state) return null;

  // 战斗结束：保持面板占位（不塌缩布局），胜负信息由战场蒙层展示。
  if (battle.finished) {
    return (
      <div className="action-panel">
        <div className="ap-title">{t.battleOver}</div>
      </div>
    );
  }

  // 选目标阶段
  if (battle.pending) {
    return (
      <div className="action-panel">
        <div className="ap-title">
          {t.pickTarget(battle.pending.skill ? skillName(battle.pending.skill as keyof typeof SKILLS, lang) : t.basicAttackShort)}
        </div>
        <div className="ap-hint">{t.pickTargetHint}</div>
        <div className="ap-buttons">
          {battle.pending.candidates.map((r, i) => (
            <button key={i} className="ap-btn" onClick={() => battle.chooseTarget(r)}>
              {r.team === 'a' ? t.ally : t.enemy} {r.id}
            </button>
          ))}
          <button className="ap-btn cancel" onClick={battle.cancelPending}>
            {t.cancel}
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
    ? t.enemyTurn(curName)
    : battle.auto
      ? t.autoTurn(curName)
      : cur?.team === 'a'
        ? t.turnOf(curName)
        : t.yourTurn;

  return (
    <div className="action-panel">
      <div className="ap-title">
        {title}
        <span className="ap-slots">{t.energyLabel} {battle.myEnergy}</span>
      </div>
      <div className="ap-buttons">
        {battle.actions.map((opt, i) => (
          <button
            key={i}
            className={`ap-btn ${opt.usable ? '' : 'disabled'}`}
            onClick={() => opt.usable && battle.choose(opt.action)}
            disabled={!opt.usable}
            title={tip(opt.action, lang, t.attackTip)}
          >
            {label(opt.action, lang, t.basicAttack)}
            {cost(opt.action) > 0 && <small className="ap-cost">⚡×{cost(opt.action)}</small>}
            {!waiting && !opt.usable && opt.reason && <small className="ap-reason">{actionReason(opt.reason, lang)}</small>}
          </button>
        ))}
      </div>
      {waiting && !battle.auto && (
        <div className="ap-overlay">
          <span>{cur?.team === 'b' ? t.enemyActing : t.processing}</span>
        </div>
      )}
    </div>
  );
}

/** 技能悬停详情的内容与定位（fixed 定位浮在侧栏右侧，不被滚动容器裁切）。 */
interface SkillTip {
  x: number;
  y: number;
  name: string;
  cost: number;
  unlockLevel: number;
  sig: boolean;
  desc: string;
}

/** 左侧栏的队伍面板：每个角色一张卡（HP/能量/派生属性/技能/状态）。读显示态，随回放实时更新。 */
function TeamPanel({ fighters, lang }: { fighters: FighterRT[]; lang: Lang }) {
  const { t } = useI18n();
  const [tip, setTip] = useState<SkillTip | null>(null);
  if (fighters.length === 0) return <div className="log-empty">{t.noData}</div>;
  return (
    <div className="team-panel">
      {fighters.map((f) => {
        const hpRatio = Math.max(0, Math.min(1, f.hp / f.stats.maxHp));
        const status = f.dead ? t.statusDead : f.downed ? t.statusDowned(f.downedTurns) : f.stunned > 0 ? t.statusStunned : '';
        return (
          <div key={f.id} className={`fighter-card ${f.dead ? 'dead' : f.downed ? 'downed' : ''}`}>
            <div className="fc-head">
              <img src={fighterSprite(f.archetypeId)} alt="" />
              <div className="fc-title">
                <div className="fc-name">
                  {f.name} <small>Lv{f.level}</small>
                </div>
                <div className="fc-sub">
                  ⚡ {f.energy}/{f.stats.maxEnergy} · AC {f.stats.ac + f.acBonus} · {t.fcHit} +{f.stats.toHit} · {t.fcDmg} +{f.stats.dmgBonus}
                </div>
              </div>
            </div>
            <div className="fc-hpbar">
              <div className="fc-hpfill" style={{ width: `${hpRatio * 100}%` }} />
              <span className="fc-hptext">
                {Math.max(0, Math.ceil(f.hp))}/{f.stats.maxHp}
              </span>
            </div>
            <div className="fc-skills">
              {f.skills.map((s) => {
                const def = SKILLS[s];
                const sig = signatureOwner(s) === f.archetypeId;
                return (
                  <span
                    key={s}
                    className={`fc-skill ${sig ? 'sig' : ''}`}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({
                        x: r.right + 10,
                        y: r.top - 6,
                        name: skillName(s, lang),
                        cost: def.cost,
                        unlockLevel: def.unlockLevel,
                        sig,
                        desc: skillDesc(s, lang),
                      });
                    }}
                    onMouseLeave={() => setTip(null)}
                  >
                    {skillName(s, lang)}
                    {def.cost > 0 && <small> ⚡{def.cost}</small>}
                  </span>
                );
              })}
            </div>
            {status && <div className="fc-status">{status}</div>}
          </div>
        );
      })}
      {tip && (
        <div className="fc-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="fc-tip-head">
            <b>{tip.name}</b>
            <span className={`cost-badge ${tip.cost > 0 ? 'spell' : 'free'}`}>
              {tip.cost > 0 ? `⚡×${tip.cost}` : t.fcNoCost}
            </span>
          </div>
          <div className="fc-tip-meta">
            {tip.sig ? t.fcSigMeta : ''}{t.fcUnlock(tip.unlockLevel)}
          </div>
          <div className="fc-tip-desc">{tip.desc}</div>
        </div>
      )}
    </div>
  );
}

function label(a: Action, lang: Lang, attackLabel: string): string {
  return a.kind === 'attack' ? attackLabel : skillName(a.skill, lang);
}
function cost(a: Action): number {
  return a.kind === 'attack' ? 0 : SKILLS[a.skill].cost;
}
function tip(a: Action, lang: Lang, attackTip: string): string {
  return a.kind === 'attack' ? attackTip : skillDesc(a.skill, lang);
}
