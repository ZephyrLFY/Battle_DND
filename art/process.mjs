/**
 * 美术资产管线 —— 把 art/raw/ 下的角色原图统一成战场可直接用的 sprite。
 *
 * 第二道处理（第一道是你用 AI 去背/统一画风）：
 *   [可选纯色去背] → trim 掉透明边 → 等比缩放进 SIZE×SIZE 正方形、居中、留透明 padding → 导出 WebP。
 *
 * 输入：art/raw/<ArchetypeId>.{png,webp,jpg,jpeg}   （文件名 = roster 的 archetype id）
 * 输出：packages/client/public/fighters/<ArchetypeId>.webp
 *
 * 用法：
 *   npm run art                       处理 art/raw 下所有图（已透明的直接裁切统一）
 *   npm run art TungSahur             只处理指定角色
 *   npm run art -- --flatten-bg       纯色背景去背（取四角颜色当背景，抹成透明）
 *   npm run art -- --flatten-bg=40    指定容差（默认 32，越大去得越狠）
 *   npm run art -- --flatten-bg TungSahur LiriliLarila   去背 + 限定角色
 *
 * 缺图的角色不报错——战场会自动回退到圆形占位。
 */
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'art', 'raw');
const OUT_DIR = path.join(ROOT, 'packages', 'client', 'public', 'fighters');

const SIZE = 1024; // 输出正方形边长
const PADDING = 0.92; // 主体占画布比例（四周留 8% 透明边，避免贴边）
const EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const DEFAULT_TOLERANCE = 32; // 纯色去背容差（颜色距离阈值）

/**
 * 纯色背景去除：取四角像素估背景色，把接近它的像素抹成透明。
 * 带边缘羽化（阈值附近线性渐隐），避免硬锯齿。返回去背后的 PNG buffer。
 * 仅适合「均匀纯色底」（灰/黑/白等）；复杂背景请用 AI 去背。
 */
async function flattenBackground(src, tolerance) {
  const img = sharp(src).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels=4（ensureAlpha 后）
  const at = (x, y) => (y * width + x) * channels;

  // 四角各取一个像素，按 R/G/B 取中位数当背景色（抗某个角恰好压到主体）。
  const corners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ].map(([x, y]) => {
    const i = at(x, y);
    return [data[i], data[i + 1], data[i + 2]];
  });
  const median = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
  const bg = [median(corners.map((c) => c[0])), median(corners.map((c) => c[1])), median(corners.map((c) => c[2]))];

  const inner = tolerance; // 完全透明阈值
  const outer = tolerance * 2; // 之外完全不透明；之间线性羽化
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= inner) {
      data[i + 3] = 0; // 背景 → 透明
    } else if (dist < outer) {
      // 边缘羽化：把原 alpha 按距离比例衰减
      const f = (dist - inner) / (outer - inner);
      data[i + 3] = Math.round(data[i + 3] * f);
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function processOne(file, opts) {
  const id = path.basename(file, path.extname(file));
  const src = path.join(RAW_DIR, file);
  const out = path.join(OUT_DIR, `${id}.webp`);

  const box = Math.round(SIZE * PADDING);
  // [可选去背] → trim 透明边 → 等比 contain 进 box → 放到 SIZE 透明画布居中 → WebP
  const input = opts.flattenBg ? await flattenBackground(src, opts.tolerance) : src;
  const trimmed = await sharp(input)
    .trim() // 去掉四周纯透明/纯色边
    .resize(box, box, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();

  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed, gravity: 'center' }])
    .webp({ quality: 90 })
    .toFile(out);

  console.log(`  ✓ ${file} → fighters/${id}.webp`);
}

async function main() {
  if (!existsSync(RAW_DIR)) {
    console.error(`找不到原图目录：${RAW_DIR}\n请把角色原图放进 art/raw/（文件名用 roster 的 archetype id，如 TungSahur.png）。`);
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  // 解析参数：--flatten-bg[=容差] 开启纯色去背；其余非 flag 参数视为限定的 archetype id。
  const args = process.argv.slice(2);
  let flattenBg = false;
  let tolerance = DEFAULT_TOLERANCE;
  const only = [];
  for (const a of args) {
    if (a === '--flatten-bg') flattenBg = true;
    else if (a.startsWith('--flatten-bg=')) {
      flattenBg = true;
      const n = Number(a.split('=')[1]);
      if (Number.isFinite(n) && n > 0) tolerance = n;
    } else if (!a.startsWith('--')) only.push(a);
  }
  const opts = { flattenBg, tolerance };

  const all = (await readdir(RAW_DIR)).filter((f) => EXTS.has(path.extname(f).toLowerCase()));
  const files = only.length
    ? all.filter((f) => only.includes(path.basename(f, path.extname(f))))
    : all;

  if (files.length === 0) {
    console.log(only.length ? `art/raw 下没有匹配 ${only.join(',')} 的图` : 'art/raw 下没有图片');
    return;
  }
  console.log(`处理 ${files.length} 张 → ${SIZE}×${SIZE} WebP${flattenBg ? `（纯色去背，容差 ${tolerance}）` : ''}：`);
  for (const f of files) {
    try {
      await processOne(f, opts);
    } catch (e) {
      console.error(`  ✗ ${f}: ${e.message}`);
    }
  }
  console.log('完成。');
}

main();
