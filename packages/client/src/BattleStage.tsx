import { useEffect, useRef } from 'react';
import {
  currentFighter,
  type BattleState,
  type FighterRT,
  type FighterRef,
} from '@battle-pokemon/shared';
import { fighterColor } from './presentation.js';

const W = 600;
const H = 340;

interface Slot {
  f: FighterRT;
  x: number;
  y: number;
}

/**
 * Canvas 3v3 对战舞台。每队 3 个角色竖排（左=我方 a，右=敌方 b）。
 * 当前行动者高亮；倒地半透明；阵亡画叉。
 * 选目标阶段：合法目标加金框，点击触发 onPickTarget。
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

    const layoutTeam = (team: 'a' | 'b', x: number) => {
      const fs = state.teams[team];
      const gap = 96;
      const top = H / 2 - ((fs.length - 1) * gap) / 2;
      fs.forEach((f, i) => {
        const y = top + i * gap;
        slotsRef.current.push({ f, x, y });
        const active = cur?.id === f.id && cur?.team === f.team;
        const isCand = candKeys.has(`${f.team}:${f.id}`);
        drawFighter(ctx, f, x, y, team === 'a' ? 'left' : 'right', active, isCand);
      });
    };
    layoutTeam('a', 130);
    layoutTeam('b', W - 130);
  }, [state, candidates]);

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
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: FighterRT,
  cx: number,
  cy: number,
  facing: 'left' | 'right',
  active: boolean,
  candidate: boolean,
) {
  const r = 34;
  const color = fighterColor(f);

  // 候选目标金框
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
  ctx.fillStyle = f.dead ? '#333' : color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 朝向三角
  if (!f.dead && !f.downed) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    const tx = facing === 'left' ? cx + r - 6 : cx - r + 6;
    ctx.moveTo(tx, cy - 6);
    ctx.lineTo(tx, cy + 6);
    ctx.lineTo(facing === 'left' ? tx + 10 : tx - 10, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 状态图标
  const badge = f.dead ? '☠' : f.downed ? '⬇' : f.stunned > 0 ? '💫' : '';
  if (badge) {
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, cx, cy - r - 6);
  }

  // 名字 + 等级
  ctx.fillStyle = f.dead ? '#777' : '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${f.name} Lv${f.level}`, cx, cy + r + 16);

  if (!f.dead) drawHpBar(ctx, cx - 38, cy - r - 22, f.hp, f.stats.maxHp);
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
