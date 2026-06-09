import { useEffect, useRef, useState } from 'react';
import {
  currentFighter,
  find,
  type BattleState,
  type FighterRT,
  type FighterRef,
} from '@battle-pokemon/shared';
import { fighterColor, fighterSprite, shouldFlip } from './presentation.js';

const W = 880;
const H = 440;
const INIT_BAR_H = 56; // 顶部先攻条高度
const SPRITE = 84; // 战场角色 sprite 绘制边长（正方形）

// ── sprite 图片缓存：按 archetypeId 懒加载，加载完触发一次重绘 ──
type SpriteState = HTMLImageElement | 'loading' | 'missing';
const spriteCache = new Map<string, SpriteState>();

/** 取已就绪的 sprite 图；未加载则发起加载，load/error 后调 onReady 触发重绘。 */
function getSprite(id: string, onReady: () => void): HTMLImageElement | null {
  const cached = spriteCache.get(id);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === 'loading' || cached === 'missing') return null;
  spriteCache.set(id, 'loading');
  const img = new Image();
  img.onload = () => {
    spriteCache.set(id, img);
    onReady();
  };
  img.onerror = () => {
    spriteCache.set(id, 'missing'); // 缺图 → 永久回退圆形占位
    onReady();
  };
  img.src = fighterSprite(id);
  return null;
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
}: {
  state: BattleState | null;
  candidates?: FighterRef[];
  onPickTarget?: (ref: FighterRef) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slotsRef = useRef<Slot[]>([]);
  const [bump, setBump] = useState(0); // sprite 异步加载完后触发重绘
  const onSpriteReady = () => setBump((n) => n + 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx);
    slotsRef.current = [];
    if (!state) {
      ctx.fillStyle = '#5a6680';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('配好队伍后点「开始战斗」', W / 2, H / 2);
      return;
    }
    const cur = state.winner === undefined ? currentFighter(state) : undefined;
    const candKeys = new Set((candidates ?? []).map((r) => `${r.team}:${r.id}`));

    drawInitiativeBar(ctx, state, cur);

    // 中部布局：每队 3 人竖排，错位（外侧/内侧交替）
    const areaTop = INIT_BAR_H + 40;
    const areaBottom = H - 30;
    const gap = (areaBottom - areaTop) / 3;
    const layoutTeam = (team: 'a' | 'b') => {
      const fs = state.teams[team];
      fs.forEach((f, i) => {
        const y = areaTop + gap * i + gap / 2;
        // 错位：左队基准靠左、右队镜像；奇数行往内缩一大截（zigzag 幅度加大）
        const baseX = team === 'a' ? 130 : W - 130;
        const inward = team === 'a' ? 1 : -1;
        const x = baseX + (i % 2 === 1 ? inward * 120 : 0);
        slotsRef.current.push({ f, x, y });
        const active = cur?.id === f.id && cur?.team === f.team;
        const isCand = candKeys.has(`${f.team}:${f.id}`);
        drawFighter(ctx, f, x, y, team === 'a' ? 'left' : 'right', active, isCand, onSpriteReady);
      });
    };
    layoutTeam('a');
    layoutTeam('b');
  }, [state, candidates, bump]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickTarget || !candidates?.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    const candKeys = new Set(candidates.map((r) => `${r.team}:${r.id}`));
    for (const s of slotsRef.current) {
      if (!candKeys.has(`${s.f.team}:${s.f.id}`)) continue;
      if (Math.hypot(mx - s.x, my - s.y) <= 40) {
        onPickTarget({ team: s.f.team, id: s.f.id });
        return;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="stage"
      onClick={onClick}
      style={{ cursor: candidates?.length ? 'pointer' : 'default' }}
    />
  );
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b3a55');
  g.addColorStop(1, '#1a2233');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 先攻条背景
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, INIT_BAR_H);
}

/** 顶部先攻顺序条：按 state.order 画小头像，当前行动者高亮。 */
function drawInitiativeBar(
  ctx: CanvasRenderingContext2D,
  state: BattleState,
  cur: FighterRT | undefined,
) {
  const order = state.order;
  ctx.fillStyle = '#8b98ad';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('先攻顺序 ▶', 10, 16);

  const startX = 92;
  const r = 15;
  const step = Math.min(54, (W - startX - 16) / Math.max(1, order.length));
  order.forEach((ref, i) => {
    const f = find(state, ref);
    if (!f) return;
    const x = startX + step * i + r;
    const y = INIT_BAR_H / 2 + 4;
    const isCur = cur && cur.id === f.id && cur.team === f.team;

    if (isCur) {
      ctx.strokeStyle = '#f0c33c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = f.downed ? 0.45 : 1;
    ctx.fillStyle = fighterColor(f);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // 队伍色边（我方绿描边、敌方红描边）
    ctx.strokeStyle = f.team === 'a' ? '#6fe08a' : '#ff8b8b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 名字首字母
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.name.slice(0, 2), x, y + 4);
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
  onSpriteReady: () => void,
) {
  const r = 30;
  const color = fighterColor(f);
  // 期望朝向：在左侧的朝右、在右侧的朝左（都看向中线敌人）。
  const want: 'left' | 'right' = facing === 'left' ? 'right' : 'left';
  const sprite = getSprite(f.archetypeId, onSpriteReady);

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

  ctx.globalAlpha = f.dead ? 0.25 : f.downed ? 0.5 : 1;

  if (sprite) {
    // 真图：按期望朝向决定是否水平翻转；倒地额外旋转一点表现"躺下"。
    const flip = shouldFlip(f.archetypeId, want);
    ctx.save();
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    if (f.downed && !f.dead) ctx.rotate((flip ? -1 : 1) * 0.5); // 倒地微旋
    ctx.drawImage(sprite, -SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE);
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
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, cx, cy - r - 4);
  }

  // 名字 + 等级（画在角色下方）
  ctx.fillStyle = f.dead ? '#777' : '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${f.name} Lv${f.level}`, cx, cy + r + 16);

  // HP 条画在上方
  if (!f.dead) drawHpBar(ctx, cx - 38, cy - r - 16, f.hp, f.stats.maxHp);
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number) {
  const w = 76;
  const h = 7;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ratio > 0.5 ? '#4dd86b' : ratio > 0.2 ? '#f0c33c' : '#ff5555';
  ctx.fillRect(x, y, w * ratio, h);
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, Math.ceil(hp))}/${maxHp}`, x + w / 2, y - 3);
}
