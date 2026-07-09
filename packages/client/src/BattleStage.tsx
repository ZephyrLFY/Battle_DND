import { useEffect, useRef, useState } from 'react';
import {
  currentFighter,
  find,
  type BattleState,
  type FighterRT,
  type FighterRef,
} from '@italian-brainrot/shared';
import { fighterColor, fighterSprite, shouldFlip, type Pose, type PoseMap, type LungeMap, type FloatFx } from './presentation.js';
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

// ── 体量系数（fighters/meta.json，由美术管线生成）：横构图角色按系数放大绘制框 ──
let spriteMeta: Record<string, { scale?: number }> = {};
let metaState: 'idle' | 'loading' | 'done' = 'idle';
function ensureMeta(onReady: () => void): void {
  if (metaState !== 'idle') return;
  metaState = 'loading';
  fetch(`${import.meta.env.BASE_URL}fighters/meta.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: unknown) => {
      if (m && typeof m === 'object') spriteMeta = m as Record<string, { scale?: number }>;
      metaState = 'done';
      onReady();
    })
    .catch(() => {
      metaState = 'done'; // 无 meta（管线未跑）→ 全员 1.0
    });
}

/** 该角色的战场绘制边长（SPRITE × 体量系数）。 */
function spriteSize(archetypeId: string): number {
  return SPRITE * (spriteMeta[archetypeId]?.scale ?? 1);
}

/** 队伍规模 → 绘制放大系数：人少时舞台空，角色相应放大（3 人保持原样）。 */
function teamBoost(n: number): number {
  return n <= 1 ? 1.4 : n === 2 ? 1.18 : 1;
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
  /** 点击命中半径（随队伍规模放大系数缩放）。 */
  r: number;
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
  floats,
  background,
}: {
  state: BattleState | null;
  candidates?: FighterRef[];
  onPickTarget?: (ref: FighterRef) => void;
  /** 瞬时姿势表（回放事件驱动；不传则全员 idle）。 */
  poses?: PoseMap;
  /** 突进表（攻击者→目标）：单体攻击时攻击者滑到目标面前。 */
  lunges?: LungeMap;
  /** 浮动战斗文字（跳字），上浮渐隐；命中瞬间驱动受击闪白。 */
  floats?: FloatFx[];
  /** 背景图 URL（不传/缺图回退默认渐变）。 */
  background?: string | null;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotsRef = useRef<Slot[]>([]);
  // 各角色当前绘制位置（跨渲染保留 → 突进/归位都是平滑缓动）
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  // HP 残影（伤害白条）：每角色一个"幽灵血量"，扣血后缓缓追上真实血量
  const ghostRef = useRef(new Map<string, number>());
  const rafRef = useRef(0);
  const [bump, setBump] = useState(0); // sprite 异步加载完后触发重绘
  const onSpriteReady = () => setBump((n) => n + 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // 物理像素渲染，逻辑坐标不变
    ctx.imageSmoothingQuality = 'high';
    ensureMeta(onSpriteReady); // 体量系数（meta.json）就绪后重绘
    if (!state) {
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx, background ?? null, onSpriteReady);
      slotsRef.current = [];
      posRef.current.clear();
      ghostRef.current.clear();
      ctx.fillStyle = '#5a6680';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.stageEmpty, W / 2, H / 2);
      return;
    }
    const cur = state.winner === undefined ? currentFighter(state) : undefined;
    const candKeys = new Set((candidates ?? []).map((r) => `${r.team}:${r.id}`));
    const keyOf = (f: FighterRT) => `${f.team}:${f.id}`;

    // 1) 布局：每队竖排错位 → 「家位置」；突进者的「期望位置」= 目标面前。
    //    按队伍规模自适应：人少时垂直居中、向中线靠拢、绘制放大（见 teamBoost）。
    const home = new Map<string, { x: number; y: number }>();
    const fighters: { f: FighterRT; team: 'a' | 'b' }[] = [];
    const areaTop = INIT_BAR_H + 56;
    const areaBottom = H - 46;
    const boostOf = { a: teamBoost(state.teams.a.length), b: teamBoost(state.teams.b.length) };
    (['a', 'b'] as const).forEach((team) => {
      const members = state.teams[team];
      const n = Math.max(1, members.length);
      const gap = (areaBottom - areaTop) / n; // n=3 时与原布局完全一致
      const inset = n <= 1 ? 330 : n === 2 ? 260 : 210; // 人少 → 离中线更近
      members.forEach((f, i) => {
        const y = areaTop + gap * i + gap / 2;
        const baseX = team === 'a' ? inset : W - inset;
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
        desired.set(k, { x: tpos.x + side * spriteSize(f.archetypeId) * boostOf[f.team] * 0.85, y: tpos.y });
        lungeKeys.add(k);
      } else {
        desired.set(k, home.get(k)!);
      }
    }
    // 清理离场角色的位置/残影缓存；新角色直接落在家位置
    const pos = posRef.current;
    const ghost = ghostRef.current;
    for (const k of [...pos.keys()]) if (!desired.has(k)) pos.delete(k);
    for (const k of [...ghost.keys()]) if (!desired.has(k)) ghost.delete(k);
    for (const k of desired.keys()) if (!pos.has(k)) pos.set(k, { ...home.get(k)! });

    // 2) 渲染一帧（按当前插值位置画；突进者最后画 → 盖在目标上层）
    const liveFloats = floats ?? [];
    const render = (now: number) => {
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
        slotsRef.current.push({ f, x: p.x, y: p.y, r: 78 * boostOf[team] });
        const active = cur?.id === f.id && cur?.team === f.team;
        // 受击闪白：该角色 160ms 内有伤害跳字 → 命中瞬间
        const flash = liveFloats.some(
          (fl) => fl.key === k && (fl.kind === 'damage' || fl.kind === 'crit') && now - fl.at < 160,
        );
        drawFighter(ctx, f, p.x, p.y, team === 'a' ? 'left' : 'right', active, candKeys.has(k), poses?.[k], flash, ghost.get(k) ?? f.hp, now, boostOf[team], onSpriteReady);
      }
      // 跳字最后画（盖在所有角色之上）
      drawFloats(ctx, liveFloats, pos, now);
    };

    // 3) 动画循环：突进缓动 + HP 残影衰减 + 跳字/闪白/光环脉冲。
    //    战斗进行中（有当前行动者）保持循环（光环呼吸）；结束后跑完余下动效即停帧。
    const stepAnim = () => {
      const now = performance.now();
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
      // HP 残影：白条向真实血量缓降（治疗则瞬时对齐——残影只表现损失）
      for (const { f } of fighters) {
        const k = keyOf(f);
        const g = ghost.get(k) ?? f.hp;
        if (g > f.hp + 0.5) {
          ghost.set(k, Math.max(f.hp, g - Math.max(0.4, f.stats.maxHp * 0.02)));
          moving = true;
        } else if (g !== f.hp) {
          ghost.set(k, f.hp);
        }
      }
      const floatsAlive = liveFloats.some((fl) => now - fl.at < 950);
      render(now);
      if (moving || floatsAlive || cur) rafRef.current = requestAnimationFrame(stepAnim);
    };
    stepAnim();
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, candidates, poses, lunges, floats, background, bump, t]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickTarget || !candidates?.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    const candKeys = new Set(candidates.map((r) => `${r.team}:${r.id}`));
    for (const s of slotsRef.current) {
      if (!candKeys.has(`${s.f.team}:${s.f.id}`)) continue;
      if (Math.hypot(mx - s.x, my - s.y) <= s.r) {
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
  // 标签与头像统一垂直居中于先攻条区域（INIT_BAR_H）
  ctx.fillStyle = '#8b98ad';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 10, INIT_BAR_H / 2);
  ctx.textBaseline = 'alphabetic'; // 还原默认，避免影响后续文字绘制

  const startX = 100;
  const r = 20;
  const step = Math.min(66, (W - startX - 16) / Math.max(1, order.length));
  order.forEach((ref, i) => {
    const f = find(state, ref);
    if (!f) return;
    const x = startX + step * i + r;
    const y = INIT_BAR_H / 2;
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
  flash: boolean,
  ghostHp: number,
  now: number,
  boost: number, // 队伍规模放大系数（人少 → 放大）
  onSpriteReady: () => void,
) {
  const size = spriteSize(f.archetypeId) * boost; // 体量归一 × 规模放大后的绘制边长
  const half = size / 2;
  const r = 58 * boost; // 圆形占位回退的半径（与体量系数无关）
  const color = fighterColor(f);
  // 期望朝向：在左侧的朝右、在右侧的朝左（都看向中线敌人）。
  const want: 'left' | 'right' = facing === 'left' ? 'right' : 'left';
  // 姿势优先级：倒地/死亡 → downed 图；否则瞬时姿势（attack/hit）；否则 idle。
  const pose: Pose = f.downed || f.dead ? 'downed' : (transientPose ?? 'idle');
  const sprite = getSprite(f.archetypeId, pose, onSpriteReady);
  // 是否真的拿到了 downed 专用图（拿到则不再用「旋转躺倒」的代偿表现）
  const hasDownedArt = pose === 'downed' && sprite != null && !isMissing(fighterSprite(f.archetypeId, 'downed'));

  const footY = cy + half - 8; // 脚底基准（阴影/光环共用）

  // 行动者光环 / 可选目标光环：脚下椭圆，带呼吸脉冲（比头顶圆圈更"站在场上"）
  if (active || candidate) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 280);
    ctx.save();
    ctx.strokeStyle = candidate ? '#ffd24a' : '#f0c33c';
    ctx.lineWidth = candidate ? 3 : 3.5;
    ctx.globalAlpha = 0.45 + 0.4 * pulse;
    ctx.shadowColor = candidate ? '#ffd24a' : '#f0c33c';
    ctx.shadowBlur = 10 + 8 * pulse;
    if (candidate) {
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -now / 28; // 缓慢旋转的虚线 → "请选我"
    }
    ctx.beginPath();
    ctx.ellipse(cx, footY, size * 0.4, size * 0.13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.globalAlpha = f.dead ? 0.35 : f.downed ? 0.6 : 1;

  // 脚下椭圆阴影：把角色从背景里"立"出来（接地感 + 对比分离）
  if (!f.dead) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, footY, size * 0.32, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (sprite) {
    // 真图：按期望朝向决定是否水平翻转。
    // 倒地：有 downed 专用图直接画；没有则回退「idle + 旋转躺倒」的代偿表现。
    // 死亡：在倒地基础上灰度化。受击瞬间闪白（flash）。
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
    ctx.drawImage(sprite, -half, -half, size, size);
    if (flash) {
      // 受击闪白：同图提亮再叠一层
      ctx.filter = 'brightness(2.4) saturate(0.3)';
      ctx.globalAlpha = 0.65;
      ctx.drawImage(sprite, -half, -half, size, size);
    }
    ctx.filter = 'none';
    ctx.restore();
    ctx.globalAlpha = f.dead ? 0.35 : f.downed ? 0.6 : 1;
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
  const topY = cy - Math.max(half, r) - 6; // 头顶基准（按实际绘制体量）
  if (badge) {
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, cx, topY);
  }

  // 名字 + 等级（画在角色下方）
  ctx.fillStyle = f.dead ? '#777' : '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${f.name} Lv${f.level}`, cx, cy + Math.max(half, r) + 18);

  // HP 条画在上方（带伤害残影白条）
  if (!f.dead) drawHpBar(ctx, cx - 52, topY - 14, f.hp, ghostHp, f.stats.maxHp);
}

/** HP 条：圆角 + 渐变填充 + 伤害残影（白条停在旧血量、缓缓追上当前值）。 */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hp: number,
  ghostHp: number,
  maxHp: number,
) {
  const w = 104;
  const h = 10;
  const rr = 5;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const ghostRatio = Math.max(ratio, Math.min(1, ghostHp / maxHp));
  ctx.save();
  // 底槽（半透明深底 + 细描边）
  ctx.fillStyle = 'rgba(6,9,16,0.72)';
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, rr + 1.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 伤害残影（白条）：从当前值延伸到旧值
  if (ghostRatio > ratio + 0.005) {
    ctx.fillStyle = 'rgba(255,235,220,0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, w * ghostRatio, h, rr);
    ctx.fill();
  }
  // 当前血量（纵向渐变，按血量分色）
  if (ratio > 0) {
    const base = ratio > 0.5 ? ['#5fe87d', '#2f9a4a'] : ratio > 0.2 ? ['#ffd45e', '#c9941f'] : ['#ff7363', '#c2362a'];
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, base[0]!);
    g.addColorStop(1, base[1]!);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * ratio), h, rr);
    ctx.fill();
    // 顶部高光
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(h, w * ratio), h / 2.6, rr);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, Math.ceil(hp))}/${maxHp}`, x + w / 2, y - 4);
}

/** 跳字：伤害红 / 暴击金大字 / 治疗绿 / MISS 灰，上浮 + 渐隐（900ms 生命周期）。 */
function drawFloats(
  ctx: CanvasRenderingContext2D,
  floats: FloatFx[],
  pos: Map<string, { x: number; y: number }>,
  now: number,
) {
  const LIFE = 900;
  for (const fl of floats) {
    const age = now - fl.at;
    if (age < 0 || age > LIFE) continue;
    const p = pos.get(fl.key);
    if (!p) continue;
    const t = age / LIFE;
    const rise = 34 + 52 * t; // 上浮轨迹（减速感来自渐隐）
    const alpha = age < 120 ? age / 120 : 1 - (age - 120) / (LIFE - 120);
    const stagger = ((fl.id % 5) - 2) * 9; // 多段连击横向错位，避免叠死
    const crit = fl.kind === 'crit';
    const color = crit ? '#ffd24a' : fl.kind === 'damage' ? '#ff8273' : fl.kind === 'heal' ? '#7be08a' : '#aab4c8';
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = crit ? '800 30px system-ui, sans-serif' : `800 ${fl.kind === 'miss' ? 17 : 22}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = crit ? 5 : 4;
    ctx.strokeStyle = 'rgba(10,14,24,0.85)';
    ctx.fillStyle = color;
    const tx = p.x + stagger;
    const ty = p.y - rise - (crit ? 8 : 0);
    const text = crit ? `${fl.text}!` : fl.text;
    ctx.strokeText(text, tx, ty);
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }
}
