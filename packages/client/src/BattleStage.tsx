import { useEffect, useRef, useState } from 'react';
import {
  currentFighter,
  find,
  type BattleState,
  type FighterRT,
  type FighterRef,
} from '@italian-brainrot/shared';
import { fighterColor, fighterSprite, shouldFlip, type Pose, type PoseMap, type LungeMap } from './presentation.js';
import { useI18n } from './i18n.js';

const W = 1240;
const H = 700;
const INIT_BAR_H = 64; // 顶部先攻条高度
const SPRITE = 172; // 战场角色 sprite 绘制边长（正方形）
const LUNGE_EASE = 0.25; // 突进缓动系数（每帧向目标位置趋近的比例）
/** HiDPI：canvas 内部按物理像素渲染（否则 Retina 屏上整体发糊）。封顶 2 防止 4K 浪费。 */
const DPR = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

// ── 图片缓存（sprite 按 id+pose、背景按 URL）：懒加载，加载完触发一次重绘 ──
type ImgState = HTMLImageElement | 'loading' | 'missing';
const imgCache = new Map<string, ImgState>();

/** 取已就绪的图；未加载则发起加载，load/error 后调 onReady 触发重绘。缺图返回 null。 */
function getImage(url: string, onReady: () => void): HTMLImageElement | null {
  const cached = imgCache.get(url);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === 'loading' || cached === 'missing') return null;
  imgCache.set(url, 'loading');
  const img = new Image();
  img.onload = () => {
    imgCache.set(url, img);
    onReady();
  };
  img.onerror = () => {
    imgCache.set(url, 'missing'); // 缺图 → 永久回退
    onReady();
  };
  img.src = url;
  return null;
}

/** 是否确定缺图（已尝试加载且失败）。加载中返回 false。 */
function isMissing(url: string): boolean {
  return imgCache.get(url) === 'missing';
}

/** 取角色某姿势的 sprite；姿势图缺失/加载中回退 idle 图。 */
function getSprite(id: string, pose: Pose, onReady: () => void): HTMLImageElement | null {
  if (pose !== 'idle') {
    const url = fighterSprite(id, pose);
    const img = getImage(url, onReady);
    if (img) return img;
    if (!isMissing(url)) return getImage(fighterSprite(id), onReady); // 加载中先显示 idle
    // 确定缺图 → 永久走 idle
  }
  return getImage(fighterSprite(id), onReady);
}

interface Slot {
  f: FighterRT;
  x: number;
  y: number;
}

/**
 * Canvas 3v3 对战舞台。
 * - 顶部：先攻顺序条（头像缩略图，当前行动者高亮）。
 * - 中部：两队各 3 个角色，竖排 + 左右错位（zigzag），血条/名字不重叠。
 * - 倒地半透明、阵亡画叉；选目标阶段合法目标加金框可点。
 */
export function BattleStage({
  state,
  candidates,
  onPickTarget,
  poses,
  lunges,
  background,
}: {
  state: BattleState | null;
  candidates?: FighterRef[];
  onPickTarget?: (ref: FighterRef) => void;
  /** 瞬时姿势表（回放事件驱动；不传则全员 idle）。 */
  poses?: PoseMap;
  /** 突进表（攻击者→目标）：单体攻击时攻击者滑到目标面前。 */
  lunges?: LungeMap;
  /** 背景图 URL（不传/缺图回退默认渐变）。 */
  background?: string | null;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotsRef = useRef<Slot[]>([]);
  // 各角色当前绘制位置（跨渲染保留 → 突进/归位都是平滑缓动）
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const rafRef = useRef(0);
  const [bump, setBump] = useState(0); // sprite 异步加载完后触发重绘
  const onSpriteReady = () => setBump((n) => n + 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // 物理像素渲染，逻辑坐标不变
    ctx.imageSmoothingQuality = 'high';
    if (!state) {
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, background ?? null, onSpriteReady);
      slotsRef.current = [];
      posRef.current.clear();
      ctx.fillStyle = '#5a6680';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.stageEmpty, W / 2, H / 2);
      return;
    }
    const cur = state.winner === undefined ? currentFighter(state) : undefined;
    const candKeys = new Set((candidates ?? []).map((r) => `${r.team}:${r.id}`));
    const keyOf = (f: FighterRT) => `${f.team}:${f.id}`;

    // 1) 布局：每队 3 人竖排错位 → 「家位置」；突进者的「期望位置」= 目标面前
    const home = new Map<string, { x: number; y: number }>();
    const fighters: { f: FighterRT; team: 'a' | 'b' }[] = [];
    const areaTop = INIT_BAR_H + 56;
    const areaBottom = H - 46;
    const gap = (areaBottom - areaTop) / 3;
    (['a', 'b'] as const).forEach((team) => {
      state.teams[team].forEach((f, i) => {
        const y = areaTop + gap * i + gap / 2;
        const baseX = team === 'a' ? 210 : W - 210;
        const inward = team === 'a' ? 1 : -1;
        const x = baseX + (i % 2 === 1 ? inward * 185 : 0);
        home.set(keyOf(f), { x, y });
        fighters.push({ f, team });
      });
    });
    const desired = new Map<string, { x: number; y: number }>();
    const lungeKeys = new Set<string>();
    for (const { f } of fighters) {
      const k = keyOf(f);
      const tpos = lunges?.[k] ? home.get(lunges[k]!) : undefined;
      if (tpos && !f.downed && !f.dead) {
        // 站到目标面前：从自己一侧贴近（a 队从目标左侧、b 队从右侧）
        const side = f.team === 'a' ? -1 : 1;
        desired.set(k, { x: tpos.x + side * SPRITE * 0.9, y: tpos.y });
        lungeKeys.add(k);
      } else {
        desired.set(k, home.get(k)!);
      }
    }
    // 清理离场角色的位置缓存；新角色直接落在家位置
    const pos = posRef.current;
    for (const k of [...pos.keys()]) if (!desired.has(k)) pos.delete(k);
    for (const k of desired.keys()) if (!pos.has(k)) pos.set(k, { ...home.get(k)! });

    // 2) 渲染一帧（按当前插值位置画；突进者最后画 → 盖在目标上层）
    const render = () => {
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, background ?? null, onSpriteReady);
      drawInitiativeBar(ctx, state, cur, t.initOrder, onSpriteReady);
      slotsRef.current = [];
      const sorted = [...fighters].sort(
        (m, n) => Number(lungeKeys.has(keyOf(m.f))) - Number(lungeKeys.has(keyOf(n.f))),
      );
      for (const { f, team } of sorted) {
        const k = keyOf(f);
        const p = pos.get(k)!;
        slotsRef.current.push({ f, x: p.x, y: p.y });
        const active = cur?.id === f.id && cur?.team === f.team;
        drawFighter(ctx, f, p.x, p.y, team === 'a' ? 'left' : 'right', active, candKeys.has(k), poses?.[k], onSpriteReady);
      }
    };

    // 3) 缓动：当前位置指数趋近期望位置，全部就位后停帧（无突进时只画一帧）
    const stepAnim = () => {
      let moving = false;
      for (const [k, p] of pos) {
        const d = desired.get(k)!;
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          p.x = d.x;
          p.y = d.y;
        } else {
          p.x += dx * LUNGE_EASE;
          p.y += dy * LUNGE_EASE;
          moving = true;
        }
      }
      render();
      if (moving) rafRef.current = requestAnimationFrame(stepAnim);
    };
    stepAnim();
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, candidates, poses, lunges, background, bump, t]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickTarget || !candidates?.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    const candKeys = new Set(candidates.map((r) => `${r.team}:${r.id}`));
    for (const s of slotsRef.current) {
      if (!candKeys.has(`${s.f.team}:${s.f.id}`)) continue;
      if (Math.hypot(mx - s.x, my - s.y) <= 78) {
        onPickTarget({ team: s.f.team, id: s.f.id });
        return;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={W * DPR}
      height={H * DPR}
      className="stage"
      onClick={onClick}
      style={{ cursor: candidates?.length ? 'pointer' : 'default' }}
    />
  );
}

function drawBackground(ctx: CanvasRenderingContext2D, bgUrl: string | null, onReady: () => void) {
  const img = bgUrl ? getImage(bgUrl, onReady) : null;
  if (img) {
    // cover 绘制（管线已出 2:1 图，这里再保险做一次 cover 裁切）
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    // 暗化蒙层：保证角色/血条/文字可读
    ctx.fillStyle = 'rgba(10,14,24,0.30)';
    ctx.fillRect(0, 0, W, H);
  } else {
    // 默认渐变（无背景图 / 加载中 / 缺图）
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b3a55');
    g.addColorStop(1, '#1a2233');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // 先攻条背景
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, INIT_BAR_H);
}

/** 顶部先攻顺序条：按 state.order 画角色小图头像（圆形裁切，按队伍朝向翻转），当前行动者高亮。 */
function drawInitiativeBar(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  cur: FighterRT | undefined,
  label: string,
  onSpriteReady: () => void,
) {
  const order = state.order;
  ctx.fillStyle = '#8b98ad';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 10, 18);

  const startX = 100;
  const r = 20;
  const step = Math.min(66, (W - startX - 16) / Math.max(1, order.length));
  order.forEach((ref, i) => {
    const f = find(state, ref);
    if (!f) return;
    const x = startX + step * i + r;
    const y = INIT_BAR_H / 2 + 4;
    const isCur = cur && cur.id === f.id && cur.team === f.team;
    // 朝向与战场一致：a 队（我方）朝右、b 队（敌方）朝左 → 以朝向区分敌我
    const want: 'left' | 'right' = f.team === 'a' ? 'right' : 'left';
    const sprite = getSprite(f.archetypeId, 'idle', onSpriteReady);

    if (isCur) {
      ctx.strokeStyle = '#f0c33c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = f.downed ? 0.45 : 1;
    // 圆形底盘
    ctx.fillStyle = '#0e1320';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    if (sprite) {
      // 圆形裁切内画 sprite（按队伍朝向翻转）
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(x, y);
      if (shouldFlip(f.archetypeId, want)) ctx.scale(-1, 1);
      const s = r * 2;
      ctx.drawImage(sprite, -r, -r, s, s);
      ctx.restore();
    } else {
      // 回退：主题色 + 首字母
      ctx.fillStyle = fighterColor(f);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.name.slice(0, 2), x, y + 4);
    }

    // 队伍色边（我方绿、敌方红）
    ctx.strokeStyle = f.team === 'a' ? '#6fe08a' : '#ff8b8b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: FighterRT,
  cx: number,
  cy: number,
  facing: 'left' | 'right', // 该角色所在队伍的「侧」：a 队=left（在左）、b 队=right（在右）
  active: boolean,
  candidate: boolean,
  transientPose: 'attack' | 'hit' | undefined,
  onSpriteReady: () => void,
) {
  const r = 58;
  const color = fighterColor(f);
  // 期望朝向：在左侧的朝右、在右侧的朝左（都看向中线敌人）。
  const want: 'left' | 'right' = facing === 'left' ? 'right' : 'left';
  // 姿势优先级：倒地/死亡 → downed 图；否则瞬时姿势（attack/hit）；否则 idle。
  const pose: Pose = f.downed || f.dead ? 'downed' : (transientPose ?? 'idle');
  const sprite = getSprite(f.archetypeId, pose, onSpriteReady);
  // 是否真的拿到了 downed 专用图（拿到则不再用「旋转躺倒」的代偿表现）
  const hasDownedArt = pose === 'downed' && sprite != null && !isMissing(fighterSprite(f.archetypeId, 'downed'));

  if (candidate) {
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (active) {
    ctx.strokeStyle = '#f0c33c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = f.dead ? 0.35 : f.downed ? 0.6 : 1;

  // 脚下椭圆阴影：把角色从背景里"立"出来（接地感 + 对比分离）
  if (!f.dead) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + SPRITE / 2 - 8, SPRITE * 0.32, SPRITE * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (sprite) {
    // 真图：按期望朝向决定是否水平翻转。
    // 倒地：有 downed 专用图直接画；没有则回退「idle + 旋转躺倒」的代偿表现。
    // 死亡：在倒地基础上灰度化。
    const flip = shouldFlip(f.archetypeId, want);
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    if (f.dead) ctx.filter = 'grayscale(1)';
    // 柔和投影：增强角色与背景的分离度
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    if ((f.downed || f.dead) && !hasDownedArt) ctx.rotate((flip ? -1 : 1) * 0.5); // 倒地微旋（无专用图时）
    ctx.drawImage(sprite, -SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
    ctx.filter = 'none';
    ctx.restore();
  } else {
    // 回退：圆形占位 + 朝向小三角（缺图 / 加载中）。
    ctx.fillStyle = f.dead ? '#333' : color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!f.dead && !f.downed) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      const tx = want === 'right' ? cx + r - 6 : cx - r + 6;
      ctx.moveTo(tx, cy - 5);
      ctx.lineTo(tx, cy + 5);
      ctx.lineTo(want === 'right' ? tx + 9 : tx - 9, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const badge = f.dead ? '☠' : f.downed ? '⬇' : f.stunned > 0 ? '💫' : '';
  if (badge) {
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, cx, cy - r - 6);
  }

  // 名字 + 等级（画在角色下方）
  ctx.fillStyle = f.dead ? '#777' : '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${f.name} Lv${f.level}`, cx, cy + r + 20);

  // HP 条画在上方
  if (!f.dead) drawHpBar(ctx, cx - 52, cy - r - 20, f.hp, f.stats.maxHp);
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number) {
  const w = 104;
  const h = 9;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ratio > 0.5 ? '#4dd86b' : ratio > 0.2 ? '#f0c33c' : '#ff5555';
  ctx.fillRect(x, y, w * ratio, h);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, Math.ceil(hp))}/${maxHp}`, x + w / 2, y - 4);
}
