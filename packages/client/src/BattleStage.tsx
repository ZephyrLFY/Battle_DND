import { useEffect, useRef } from 'react';
import { currentFighter, type BattleState, type FighterRT } from '@battle-pokemon/shared';
import { fighterColor } from './presentation.js';

const W = 600;
const H = 280;

/**
 * Canvas 对战舞台。占位美术：每只精灵画成"最高属性主题色"的圆 + 名字 + Lv + HP/AC。
 * 当前行动方高亮描边。纯展示，数据来自 BattleState。
 */
export function BattleStage({ state }: { state: BattleState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    drawBackground(ctx);
    if (!state) {
      ctx.fillStyle = '#5a6680';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('选好精灵后点「开始战斗」', W / 2, H / 2);
      return;
    }
    // 1v1：每队取第一个角色（3v3 布局是第二步）
    const cur = state.winner === undefined ? currentFighter(state) : undefined;
    const fa = state.teams.a[0];
    const fb = state.teams.b[0];
    if (fa) drawFighter(ctx, fa, { x: 150, y: 150 }, 'left', cur?.id === fa.id && cur?.team === 'a');
    if (fb) drawFighter(ctx, fb, { x: 450, y: 150 }, 'right', cur?.id === fb.id && cur?.team === 'b');
  }, [state]);

  return <canvas ref={canvasRef} width={W} height={H} className="stage" />;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b3a55');
  g.addColorStop(1, '#1a2233');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a4a3a';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 26, W / 2.2, 36, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: FighterRT,
  pos: { x: number; y: number },
  facing: 'left' | 'right',
  active: boolean,
) {
  const color = fighterColor(f);
  const r = 44;

  if (active) {
    ctx.strokeStyle = '#f0c33c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = f.hp > 0 ? color : '#3a3a3a';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 朝向三角
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  const tx = facing === 'left' ? pos.x + r - 8 : pos.x - r + 8;
  ctx.moveTo(tx, pos.y - 8);
  ctx.lineTo(tx, pos.y + 8);
  ctx.lineTo(facing === 'left' ? tx + 12 : tx - 12, pos.y);
  ctx.closePath();
  ctx.fill();

  // 昏迷标记
  if (f.stunned > 0) {
    ctx.fillStyle = '#c98bff';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💫', pos.x, pos.y - r - 12);
  }

  // 名字 / 等级
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(f.name, pos.x, pos.y + r + 22);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`Lv.${f.level}  AC ${f.stats.ac + f.acBonus}`, pos.x, pos.y + r + 40);

  drawHpBar(ctx, pos.x - 50, pos.y - r - 26, f.hp, f.stats.maxHp);
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, maxHp: number) {
  const w = 100;
  const h = 10;
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
  ctx.fillText(`${Math.max(0, Math.ceil(hp))} / ${maxHp}`, x + w / 2, y - 4);
}
