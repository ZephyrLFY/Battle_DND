import { useEffect, useRef } from 'react';
import { TYPE_COLOR, TYPE_LABEL } from '@battle-pokemon/shared';
import type { SideView } from './useBattleReplay.js';

const W = 600;
const H = 320;

/** 一个活动的飘字（带生命周期，自行淡出上浮）。 */
interface FloatText {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
  age: number; // 0..1
}

const KIND_COLOR: Record<string, string> = {
  dmg: '#ff5555',
  crit: '#ff2d2d',
  dodge: '#bbbbbb',
  heal: '#4dd86b',
  stun: '#c98bff',
};

/**
 * Canvas 对战舞台。占位美术：每只精灵画成类型主题色的圆 + 名字 + 等级。
 * HP 条画在头顶，飘字从精灵身上上浮淡出。纯展示，数据来自 replay state。
 */
export function BattleStage({ a, b }: { a: SideView | null; b: SideView | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floatsRef = useRef<FloatText[]>([]);
  const seenFloatRef = useRef<Set<number>>(new Set());

  // 收集新的飘字事件（按 id 去重）
  const aPos = { x: 150, y: 180 };
  const bPos = { x: 450, y: 180 };
  collectFloat(a, aPos, floatsRef, seenFloatRef);
  collectFloat(b, bPos, floatsRef, seenFloatRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      ctx.clearRect(0, 0, W, H);
      drawBackground(ctx);

      if (a) drawFighter(ctx, a, aPos, 'left');
      if (b) drawFighter(ctx, b, bPos, 'right');

      // 飘字推进
      const floats = floatsRef.current;
      for (const f of floats) {
        f.age += dt / 1.0; // 1 秒生命
        f.y -= dt * 40;
      }
      floatsRef.current = floats.filter((f) => f.age < 1);
      for (const f of floatsRef.current) drawFloat(ctx, f);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // a/b 引用变化时重绘逻辑已在 raf 内读取最新闭包外引用，这里只需启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  return <canvas ref={canvasRef} width={W} height={H} className="stage" />;
}

function collectFloat(
  side: SideView | null,
  pos: { x: number; y: number },
  floatsRef: React.MutableRefObject<FloatText[]>,
  seenRef: React.MutableRefObject<Set<number>>,
) {
  const f = side?.floating;
  if (!f || seenRef.current.has(f.id)) return;
  seenRef.current.add(f.id);
  floatsRef.current.push({
    id: f.id,
    text: f.text,
    color: KIND_COLOR[f.kind] ?? '#fff',
    x: pos.x,
    y: pos.y - 60,
    age: 0,
  });
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b3a55');
  g.addColorStop(1, '#1a2233');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 地面
  ctx.fillStyle = '#3a4a3a';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 30, W / 2.2, 40, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  side: SideView,
  pos: { x: number; y: number },
  facing: 'left' | 'right',
) {
  const color = TYPE_COLOR[side.info.type];
  const r = 46;

  // 身体（占位圆）
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 朝向小三角（示意面朝对方）
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  const tx = facing === 'left' ? pos.x + r - 8 : pos.x - r + 8;
  ctx.moveTo(tx, pos.y - 8);
  ctx.lineTo(tx, pos.y + 8);
  ctx.lineTo(facing === 'left' ? tx + 12 : tx - 12, pos.y);
  ctx.closePath();
  ctx.fill();

  // 名字 + 等级 + 类型
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(side.info.species, pos.x, pos.y + r + 22);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`Lv.${side.info.level} · ${TYPE_LABEL[side.info.type]}`, pos.x, pos.y + r + 40);

  // HP 条
  drawHpBar(ctx, pos.x - 50, pos.y - r - 26, side.hp, side.info.fullHp);
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hp: number,
  fullHp: number,
) {
  const w = 100;
  const h = 10;
  const ratio = Math.max(0, Math.min(1, hp / fullHp));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ratio > 0.5 ? '#4dd86b' : ratio > 0.2 ? '#f0c33c' : '#ff5555';
  ctx.fillRect(x, y, w * ratio, h);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(hp)} / ${fullHp}`, x + w / 2, y - 4);
}

function drawFloat(ctx: CanvasRenderingContext2D, f: FloatText) {
  ctx.globalAlpha = 1 - f.age;
  ctx.fillStyle = f.color;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(f.text, f.x, f.y);
  ctx.globalAlpha = 1;
}
