/**
 * 客户端 i18n —— 中英双语。
 *
 * 设计：中文是源语言（代码/数据表里的原文），英文翻译集中在本文件：
 * - UI 文案：UI.zh / UI.en 词典（含插值函数）
 * - 技能名/描述：SKILL_EN（shared 的 SKILLS 表保持纯中文不动）
 * - 角色简介：BLURB_EN（presentation.ts 的中文简介不动）
 * - 引擎事件里的动态 note：shared 在 emit 处带 noteEn（见 effects/passives）
 * - 被动 flat 伤害的骰子 spec（'敲击'/'火药'…）：FLAT_SPEC_EN 映射
 *
 * 语言状态：React Context + localStorage('ui.lang') 持久化，右上角按钮切换。
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  SKILLS,
  MAX_EQUIPPED_SKILLS,
  signatureOwner,
  skillDef,
  type Combatant,
  type SkillId,
  type AbilityKey,
} from '@italian-brainrot/shared';
import { fighterBlurb } from './presentation.js';

export type Lang = 'zh' | 'en';
const LANG_KEY = 'ui.lang';

// ─────────────────────────────────────────────────────────────────────────
// UI 词典
// ─────────────────────────────────────────────────────────────────────────

const zh = {
  title: '意大利山海经',
  titleSub: 'Italian Brainrot — 3v3 D&D 队伍战',
  steps: ['① 选队', '② 养成', '③ 战斗'] as readonly string[],
  // 选队
  pickTeam: '选择你的出战队伍',
  pickHintSize: (n: number) => `（1–${n} 人，敌队等量）`,
  inTeamBadge: '✓ 已在队中',
  inTeamRemove: '✓ 已在队中（点击移除）',
  teamFull: '队伍已满',
  addToTeam: '+ 加入出战',
  selectNext: (n: number) => `下一步 · 养成 →（出战 ${n}）`,
  needOne: '至少选 1 人',
  prevAria: '上一个',
  nextAria: '下一个',
  removeAria: '移除',
  // 养成
  buildTitle: '养成你的出战角色（加点 / 学技能）',
  level: '等级',
  allocTitle: '属性加点',
  ptsLeft: (n: number) => `剩余点数：${n}`,
  respec: '洗点',
  statHit: '命中',
  statDmg: '伤害',
  statInit: '先攻',
  statEnergyCap: '⚡ 能量上限',
  statLifesteal: '🩸 吸血',
  learnedTitle: (a: number, b: number) => `已学技能（${a} / ${b}）`,
  emptySlot: '空技能位',
  sigTag: '专属',
  unequip: '✕ 卸下',
  poolTitle: '技能池（按解锁等级排序）',
  barFull: ' · 技能栏已满',
  noLearnable: '已无可学技能',
  unlocked: '已解锁',
  costFree: '0 能量',
  backToSelect: '← 返回选队',
  startFight: '⚔ 开始战斗（随机敌队）',
  // 战斗页
  reSelect: '← 重新选队',
  adjustBuild: '← 调整养成',
  again: '再来一场',
  autoBattle: '自动战斗',
  speed: '速度',
  instant: '瞬间',
  bgLabel: '背景',
  bgDefault: '默认',
  sideTabLog: '⚔ 战斗',
  sideTabAlly: '🛡 我方',
  sideTabEnemy: '💀 敌方',
  logPlaceholder: '战斗日志将显示在这里',
  noData: '暂无数据',
  verdictWin: '🎉 你的队伍获胜！',
  verdictLose: '💀 你的队伍落败',
  verdictDraw: '⚖ 双方全灭',
  battleOver: '战斗结束',
  pickTarget: (skill: string) => `选择目标（${skill}）`,
  basicAttack: '普通攻击',
  basicAttackShort: '普攻',
  pickTargetHint: '点击战场上高亮的角色作为目标',
  cancel: '取消',
  ally: '我方',
  enemy: '敌方',
  enemyTurn: (name: string) => `敌方回合 · ${name}`,
  autoTurn: (name: string) => `自动战斗 · ${name}`,
  turnOf: (name: string) => `${name} 的回合`,
  yourTurn: '你的回合',
  energyLabel: '⚡ 能量',
  enemyActing: '敌方行动中…',
  processing: '处理中…',
  attackTip: '1d6 + 力量 伤害（命中后按 CON 吸血）',
  // 队伍面板 / 技能详情
  fcHit: '命中',
  fcDmg: '伤害',
  fcSigMeta: '专属签名技能 · ',
  fcUnlock: (lv: number) => `Lv${lv} 解锁`,
  fcNoCost: '不耗能',
  statusDead: '☠ 阵亡',
  statusDowned: (n: number) => `⬇ 倒地（${n}/3）`,
  statusStunned: '💫 昏迷',
  // 战场 canvas
  stageEmpty: '配好队伍后点「开始战斗」',
  initOrder: '先攻顺序 ▶',
  // 语言切换
  langToggleTitle: 'Switch to English',
};

type Dict = typeof zh;

const en: Dict = {
  title: 'Italian Brainrot',
  titleSub: '3v3 D&D-style team battles',
  steps: ['① Team', '② Build', '③ Battle'],
  pickTeam: 'Pick your lineup',
  pickHintSize: (n: number) => ` (1–${n} fighters, enemy matches your size)`,
  inTeamBadge: '✓ In team',
  inTeamRemove: '✓ In team (click to remove)',
  teamFull: 'Team is full',
  addToTeam: '+ Add to team',
  selectNext: (n: number) => `Next · Build → (${n} picked)`,
  needOne: 'Pick at least 1',
  prevAria: 'Previous',
  nextAria: 'Next',
  removeAria: 'Remove',
  buildTitle: 'Build your fighters (allocate points / learn skills)',
  level: 'Level',
  allocTitle: 'Ability points',
  ptsLeft: (n: number) => `Points left: ${n}`,
  respec: 'Respec',
  statHit: 'Hit',
  statDmg: 'Dmg',
  statInit: 'Init',
  statEnergyCap: '⚡ Max energy',
  statLifesteal: '🩸 Lifesteal',
  learnedTitle: (a: number, b: number) => `Learned skills (${a} / ${b})`,
  emptySlot: 'Empty slot',
  sigTag: 'Signature',
  unequip: '✕ Unequip',
  poolTitle: 'Skill pool (sorted by unlock level)',
  barFull: ' · Skill bar full',
  noLearnable: 'Nothing left to learn',
  unlocked: 'Unlocked',
  costFree: 'Free',
  backToSelect: '← Back to team',
  startFight: '⚔ Start battle (random enemies)',
  reSelect: '← Re-pick team',
  adjustBuild: '← Adjust build',
  again: 'Fight again',
  autoBattle: 'Auto battle',
  speed: 'Speed',
  instant: 'Instant',
  bgLabel: 'Background',
  bgDefault: 'Default',
  sideTabLog: '⚔ Battle',
  sideTabAlly: '🛡 Allies',
  sideTabEnemy: '💀 Enemies',
  logPlaceholder: 'Battle log will appear here',
  noData: 'No data',
  verdictWin: '🎉 Your team wins!',
  verdictLose: '💀 Your team is defeated',
  verdictDraw: '⚖ Mutual destruction',
  battleOver: 'Battle over',
  pickTarget: (skill: string) => `Choose a target (${skill})`,
  basicAttack: 'Attack',
  basicAttackShort: 'Attack',
  pickTargetHint: 'Click a highlighted fighter on the battlefield',
  cancel: 'Cancel',
  ally: 'Ally',
  enemy: 'Enemy',
  enemyTurn: (name: string) => `Enemy turn · ${name}`,
  autoTurn: (name: string) => `Auto battle · ${name}`,
  turnOf: (name: string) => `${name}'s turn`,
  yourTurn: 'Your turn',
  energyLabel: '⚡ Energy',
  enemyActing: 'Enemy acting…',
  processing: 'Processing…',
  attackTip: '1d6 + STR damage (lifesteal by CON on hit)',
  fcHit: 'Hit',
  fcDmg: 'Dmg',
  fcSigMeta: 'Signature skill · ',
  fcUnlock: (lv: number) => `Unlocks at Lv${lv}`,
  fcNoCost: 'Free',
  statusDead: '☠ Dead',
  statusDowned: (n: number) => `⬇ Down (${n}/3)`,
  statusStunned: '💫 Stunned',
  stageEmpty: 'Pick your team, then hit "Start battle"',
  initOrder: 'Initiative ▶',
  langToggleTitle: '切换为中文',
};

export const UI: Record<Lang, Dict> = { zh, en };

// ─────────────────────────────────────────────────────────────────────────
// 技能名 / 描述（英文翻译；中文以 shared 的 SKILLS 为源）
// ─────────────────────────────────────────────────────────────────────────

const SKILL_EN: Record<SkillId, { name: string; desc: string }> = {
  feint: { name: 'Feint', desc: 'A light hit (1d4) that rips armor open: target AC −2 for 1 turn (sets up your allies).' },
  precise_aim: { name: 'Precise Aim', desc: 'Attack with advantage (2d20 take higher), easier crits; gains no energy on hit (the price of being free).' },
  brave_strike: { name: 'Brave Strike', desc: 'This attack rolls 2d6 instead of 1d6, +2 to hit.' },
  shield_block: { name: 'Shield Block', desc: 'AC +3 this turn, reflect 1 damage to the next attacker, and restore 2 energy (defense into resources).' },
  flurry: { name: 'Flurry', desc: 'Attack twice this turn (independent hit/damage rolls).' },
  charge_smash: { name: 'Charged Smash', desc: 'Skip this turn; next turn your attack rolls 4d6 (normal hit roll).' },
  heal: { name: 'Heal', desc: 'Restore 2d4 + CON mod HP to one ally (costs 2 energy; not usable on the fallen).' },
  war_cry: { name: 'War Cry', desc: 'All allies gain +2 to hit and +2 damage for 1 turn.' },
  firestorm: { name: 'Firestorm', desc: 'Roll to hit every enemy for 2d6 (AOE); targets hit are set ablaze, burning 1d3 per turn for 2 turns.' },
  revive: { name: 'Revive', desc: 'Raise a downed ally with 1d8 + 15% max HP (only works on the downed).' },
  sig_tung_combo: { name: 'Tung-Tung-Tung Combo', desc: '[Tung only] Strike 3 times in one turn at cumulative −2 to hit (+0 / −2 / −4).' },
  sig_bombombini_blast: { name: 'Kamikaze Blast', desc: '[Bombombini only] 4d6 auto-hit on one target; recoil equal to 3/4 of damage dealt. Fuse stacks boost it (and the recoil).' },
  sig_trippi_hiss: { name: 'Hiss', desc: '[Trippi only] Cat intimidation (free): a scratch (1d4); on hit the target is terrified and stunned next turn.' },
  sig_lirili_timestop: { name: 'Time Stop', desc: '[Lirilì only] Freeze time: skip nothing — act twice in a row.' },
  sig_cappuccino_behead: { name: 'Decapitation', desc: '[Cappuccino only] An auto-hit execution slash; damage dice are doubled if the target is below 25% HP.' },
  sig_ballerina_waltz: { name: 'Waltz Command', desc: '[Ballerina only] All allies next turn: +2 to hit, +1 AC and +4 damage (rally +2 plus dance step +2).' },
  sig_bombardiro_carpet: { name: 'Carpet Bombing', desc: '[Bombardiro only] 2d6 on every enemy; each saves (DC 11) or is dazed (stunned).' },
  sig_patapim_vines: { name: 'Entangling Vines', desc: '[Patapim only] Attack and root the target: a failed CON save means stunned next turn.' },
  sig_boneca_ram: { name: 'Tire Ram', desc: '[Boneca only] An auto-hit heavy ram; knocks the target back (−3 to hit next turn).' },
  sig_frigo_iceshield: { name: 'Ice Shield', desc: '[Frigo only] AC +3 and immunity to control (stun / root / hiss) for the next 3 turns.' },
  sig_tralalero_dash: { name: 'Swift Slashes', desc: '[Tralalero only] Attack twice; if both hit, gain AC +1 this turn.' },
  sig_chimpanzini_frenzy: { name: 'Ape Frenzy', desc: '[Chimpanzini only] Attacks = current energy (min 1), each at +2 to hit; the Nth hit adds N−1 bonus damage. Drains all energy.' },
};

export function skillName(id: SkillId, lang: Lang): string {
  return lang === 'en' ? SKILL_EN[id].name : SKILLS[id].name;
}
export function skillDesc(id: SkillId, lang: Lang): string {
  return lang === 'en' ? SKILL_EN[id].desc : SKILLS[id].desc;
}

// ─────────────────────────────────────────────────────────────────────────
// 属性标签 / 角色简介 / 被动 flat 伤害 spec
// ─────────────────────────────────────────────────────────────────────────

const ABILITY_EN: Record<AbilityKey, string> = { str: 'STR', dex: 'DEX', con: 'CON' };
const ABILITY_ZH: Record<AbilityKey, string> = { str: '力量', dex: '敏捷', con: '体质' };

export function abilityLabel(k: AbilityKey, lang: Lang): string {
  return lang === 'en' ? ABILITY_EN[k] : ABILITY_ZH[k];
}

const BLURB_EN: Record<string, string> = {
  TungSahur: '🥖 A wooden log creature with a baseball bat — the relentless waker-upper, blunt force incarnate.',
  CappuccinoAssassino: '☕ Cappuccino-headed samurai assassin, dual katanas, fast and lethal.',
  BombardiroCrocodilo: '🐊 A crocodile fused with a bomber plane — area firepower from above.',
  LiriliLarila: '🌵🐘 A cactus elephant on a cane — max HP, thorns, and time-stopping.',
  BrrBrrPatapim: '🌳 A tree-root forest spirit with a monkey face — support and buffs.',
  BombombiniGusini: '🦢💣 A goose-jet strapped with grenades — self-destructive burst.',
  TrippiTroppi: '🐱 A surreal cat-shrimp hybrid — chaos tank with nine lives.',
  BonecaAmbalabu: '🐸🛞 Frog head, tire body, human legs — a balanced bruiser.',
  FrigoCamelo: '🐪🧊 A fridge camel — supply-line defense, regenerates every turn.',
  TralaleroTralala: '🦈👟 A blue shark in Nikes — blinding speed, strikes first.',
  BallerinaCappuccina: '🩰☕ A cappuccino ballerina — graceful dodges and team buffs.',
  ChimpanziniBananini: '🍌🐒 A chimp in a banana peel — agile burst with energy frenzy.',
};

/** 按语言取角色一句话简介。 */
export function blurb(archetypeId: string, lang: Lang): string {
  if (lang === 'en') return BLURB_EN[archetypeId] ?? '';
  return fighterBlurb(archetypeId);
}

/** 被动/技能 flat 伤害的骰子 spec 中文标签 → 英文（出现在战斗日志的伤害行）。 */
export const FLAT_SPEC_EN: Record<string, string> = {
  敲击: 'Knock',
  火药: 'Gunpowder',
  炸毛反扑: 'Frenzied counter',
  尖刺: 'Spikes',
  碾压: 'Crush',
  狂暴: 'Frenzy',
  反噬: 'Recoil',
  灼烧: 'Burning',
  passive: 'passive',
};

/** 战斗动作不可用原因（shared/allActions 返回中文）→ 英文映射。 */
const ACTION_REASON_EN: Record<string, string> = {
  等待回合: 'Waiting for turn',
  倒地: 'Down',
  昏迷中: 'Stunned',
  能量不足: 'Not enough energy',
  无目标: 'No target',
  无可攻击目标: 'No attackable target',
};
export function actionReason(reason: string, lang: Lang): string {
  return lang === 'en' ? (ACTION_REASON_EN[reason] ?? reason) : reason;
}

// ─────────────────────────────────────────────────────────────────────────
// 学习门槛原因（shared 返回中文；英文在客户端按同样的判定重建）
// ─────────────────────────────────────────────────────────────────────────

export function learnReasonText(c: Combatant, id: SkillId, lang: Lang): string {
  if (lang === 'zh') {
    // 与 shared/leveling.learnBlockReason 同源（这里只用于展示，可学时调用方不会用到）
    if (c.skills.includes(id)) return '已学过';
    if (c.level < skillDef(id).unlockLevel) return `需 Lv${skillDef(id).unlockLevel}`;
    const owner = signatureOwner(id);
    if (owner && owner !== c.archetypeId) return '专属技能';
    return `技能栏已满(${MAX_EQUIPPED_SKILLS})`;
  }
  if (c.skills.includes(id)) return 'Already learned';
  if (c.level < skillDef(id).unlockLevel) return `Needs Lv${skillDef(id).unlockLevel}`;
  const owner = signatureOwner(id);
  if (owner && owner !== c.archetypeId) return 'Signature-locked';
  return `Skill bar full (${MAX_EQUIPPED_SKILLS})`;
}

// ─────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────

const LangContext = createContext<{ lang: Lang; toggle: () => void }>({ lang: 'zh', toggle: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh'));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const toggle = () =>
    setLang((l) => {
      const next: Lang = l === 'zh' ? 'en' : 'zh';
      localStorage.setItem(LANG_KEY, next);
      return next;
    });
  return <LangContext.Provider value={{ lang, toggle }}>{children}</LangContext.Provider>;
}

/** 取当前语言 + 词典 + 切换函数。 */
export function useI18n(): { lang: Lang; t: Dict; toggle: () => void } {
  const { lang, toggle } = useContext(LangContext);
  return { lang, t: UI[lang], toggle };
}
