import { useEffect, useRef } from 'react';
import { themeColor, type BattleState, type Fighter } from '@battle-pokemon/shared';

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
    const active = state.winner === undefined ? state.turn : null;
    drawFighter(ctx, state.a, { x: 150, y: 150 }, 'left', active === 'a');
    drawFighter(ctx, state.b, { x: 450, y: 150 }, 'right', active === 'b');
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
  f: Fighter,
  pos: { x: number; y: number },
  facing: 'left' | 'right',
  active: boolean,
) {
  const ab = abilitiesFromFighter(f);
  const color = themeColor(ab);
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
  ctx.fillText(f.species, pos.x, pos.y + r + 22);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`Lv.${f.level}  AC ${f.stats.ac + f.acBonus}`, pos.x, pos.y + r + 40);

  drawHpBar(ctx, pos.x - 50, pos.y - r - 26, f.hp, f.stats.maxHp);
}

/** 从 fighter 反推属性近似（仅为取主题色；用派生 mod 还原大致属性高低）。 */
function abilitiesFromFighter(f: Fighter): { str: number; dex: number; con: number } {
  // stats 里有 strMod/dexMod/conMod，反推一个代表值用于选色即可
  return {
    str: 10 + f.stats.strMod * 2,
    dex: 10 + f.stats.dexMod * 2,
    con: 10 + f.stats.conMod * 2,
  };
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
