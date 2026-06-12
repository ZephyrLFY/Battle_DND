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

const BG_STORAGE_KEY = 'battle.bg';

type SideTab = 'log' | 'a' | 'b';

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
        <div className="battle-layout">
          {/* 左侧信息栏：战斗日志 / 我方 / 敌方。
              内层 absolute 填充：内容不撑高页面，高度恒随右列，内部滚动。 */}
          <aside className="battle-side">
            <div className="side-inner">
              <div className="side-tabs">
                {([
                  ['log', '⚔ 战斗'],
                  ['a', '🛡 我方'],
                  ['b', '💀 敌方'],
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
                  {battle.log.length === 0 && <div className="log-empty">战斗日志将显示在这里</div>}
                  {/* 倒序：最新一条在最上面，无需自动滚动 */}
                  {battle.log.map((l, i) => (
                    <div key={i} className="log-line">
                      {l}
                    </div>
                  )).reverse()}
                </div>
              ) : (
                <div className="side-content">
                  <TeamPanel fighters={battle.state?.teams[sideTab] ?? []} />
                </div>
              )}
            </div>
          </aside>

          {/* 右侧：战场 + 操作面板 */}
          <div className="battle-main">
            <div className="stage-wrap">
              {/* 背景选择：浮在战场右上角的 HUD 胶囊 */}
              <div className="bg-picker" title="战场背景">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
                  <path d="M5 17l4.5-4.5 3 3L17 11l2 2" />
                </svg>
                <select value={bg} onChange={(e) => pickBg(e.target.value)}>
                  <option value="">默认</option>
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
          </div>
        </div>
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
function TeamPanel({ fighters }: { fighters: FighterRT[] }) {
  const [tip, setTip] = useState<SkillTip | null>(null);
  if (fighters.length === 0) return <div className="log-empty">暂无数据</div>;
  return (
    <div className="team-panel">
      {fighters.map((f) => {
        const hpRatio = Math.max(0, Math.min(1, f.hp / f.stats.maxHp));
        const status = f.dead ? '☠ 阵亡' : f.downed ? `⬇ 倒地（${f.downedTurns}/3）` : f.stunned > 0 ? '💫 昏迷' : '';
        return (
          <div key={f.id} className={`fighter-card ${f.dead ? 'dead' : f.downed ? 'downed' : ''}`}>
            <div className="fc-head">
              <img src={fighterSprite(f.archetypeId)} alt="" />
              <div className="fc-title">
                <div className="fc-name">
                  {f.name} <small>Lv{f.level}</small>
                </div>
                <div className="fc-sub">
                  ⚡ {f.energy}/{f.stats.maxEnergy} · AC {f.stats.ac + f.acBonus} · 命中 +{f.stats.toHit} · 伤害 +{f.stats.dmgBonus}
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
                        name: def.name,
                        cost: def.cost,
                        unlockLevel: def.unlockLevel,
                        sig,
                        desc: def.desc,
                      });
                    }}
                    onMouseLeave={() => setTip(null)}
                  >
                    {def.name}
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
              {tip.cost > 0 ? `⚡×${tip.cost}` : '不耗能'}
            </span>
          </div>
          <div className="fc-tip-meta">
            {tip.sig ? '专属签名技能 · ' : ''}Lv{tip.unlockLevel} 解锁
          </div>
          <div className="fc-tip-desc">{tip.desc}</div>
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
