/**
 * 美术资产管线 —— 把 art/raw/ 下的角色原图统一成战场可直接用的 sprite。
 *
 * 第二道处理（第一道是你用 AI 去背/统一画风）：
 *   [可选纯色去背] → 计算透明包围盒 → 等比缩放进 SIZE×SIZE 正方形、居中、留透明 padding → 导出 WebP。
 *
 * 角色（支持多姿势）：
 *   输入：art/raw/<ArchetypeId>.{png,webp,jpg,jpeg}            → idle（基础姿势）
 *         art/raw/<ArchetypeId>.<pose>.{png,...}                → 姿势变体，pose ∈ attack | hit | downed
 *   输出：packages/client/public/fighters/<ArchetypeId>[.<pose>].webp
 *
 *   ⚠ 锚点对齐：同角色多姿势若**画布尺寸一致**（推荐：用 img2img 从 idle 生成变体，保持分辨率），
 *   会用「所有姿势的联合包围盒」统一裁切 → 各姿势缩放/位置一致，战斗中切图不会跳位。
 *   画布尺寸不一致时回退为各自裁切（会警告，切图可能跳位）。
 *
 * 战场背景：
 *   输入：art/raw/bg/<名字>.{png,webp,jpg,jpeg}
 *   输出：packages/client/public/backgrounds/<名字>.webp（1760×880 cover 裁切 + 压暗去饱和 + 轻模糊，
 *         保证角色可读性）+ manifest.json（前端下拉框据此列出可选背景）
 *
 * 用法：
 *   npm run art                       处理 raw/ 全部角色图 + raw/bg/ 全部背景
 *   npm run art TungSahur             只处理指定角色（含其所有姿势）
 *   npm run art -- --flatten-bg       纯色背景去背（取四角颜色当背景，抹成透明；仅角色图）
 *   npm run art -- --flatten-bg=40    指定容差（默认 32，越大去得越狠）
 *
 * 缺图不报错——战场缺姿势回退 idle，缺 idle 回退圆形占位，无背景回退默认渐变。
 */
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'art', 'raw');
const RAW_BG_DIR = path.join(ROOT, 'art', 'raw', 'bg');
const OUT_DIR = path.join(ROOT, 'packages', 'client', 'public', 'fighters');
const OUT_BG_DIR = path.join(ROOT, 'packages', 'client', 'public', 'backgrounds');

const SIZE = 1024; // 角色输出正方形边长
const PADDING = 0.92; // 主体占画布比例（四周留 8% 透明边，避免贴边）
const BG_W = 1760; // 背景输出尺寸（战场 880×440 的 2x）
const BG_H = 880;
const EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const POSES = new Set(['attack', 'hit', 'downed']); // idle 无后缀
const DEFAULT_TOLERANCE = 32; // 纯色去背容差（颜色距离阈值）
const ALPHA_THRESHOLD = 8; // 包围盒计算的「非透明」alpha 阈值

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

/**
 * 判断图是否已有透明背景（四角 alpha 都≈0）。
 * 用于 --flatten-bg 的逐文件保护：已透明的图（如先前处理好的 idle）跳过去背，
 * 避免「透明像素的 RGB 是黑/灰」被当成背景色误伤主体。
 */
async function alreadyTransparent(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => (y * width + x) * channels + 3;
  const corners = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ];
  return corners.every(([x, y]) => data[at(x, y)] < 10);
}

/** 扫描 alpha 通道求非透明包围盒。返回 {left,top,width,height,imgW,imgH}；全透明返回 null。 */
async function alphaBBox(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1, imgW: width, imgH: height };
}

/** 裁切 bbox → 等比缩放进 box → SIZE 画布居中 → 写 WebP。 */
async function renderSprite(input, bbox, outFile) {
  const box = Math.round(SIZE * PADDING);
  const cropped = await sharp(input)
    .ensureAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height })
    .resize(box, box, { fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cropped, gravity: 'center' }])
    .webp({ quality: 90 })
    .toFile(outFile);
}

/** 解析文件名 → { id, pose }。`Tung.attack.png` → {Tung, attack}；`Tung.png` → {Tung, idle}。 */
function parseName(file) {
  const base = path.basename(file, path.extname(file));
  const dot = base.lastIndexOf('.');
  if (dot > 0) {
    const maybePose = base.slice(dot + 1).toLowerCase();
    if (POSES.has(maybePose)) return { id: base.slice(0, dot), pose: maybePose };
  }
  return { id: base, pose: 'idle' };
}

/** 处理一个角色的全部姿势（同尺寸 → 联合包围盒对齐锚点；否则各自裁切）。 */
async function processCharacter(id, files, opts) {
  // 预处理输入（可选去背）+ 求各自包围盒
  const items = [];
  for (const f of files) {
    const src = path.join(RAW_DIR, f.file);
    // --flatten-bg 时逐文件判断：已透明的跳过去背（保护处理好的图），不透明的才去背
    let input = src;
    if (opts.flattenBg) {
      if (await alreadyTransparent(src)) {
        console.log(`  · ${f.file} 已透明，跳过去背`);
      } else {
        input = await flattenBackground(src, opts.tolerance);
      }
    }
    const bbox = await alphaBBox(input);
    if (!bbox) {
      console.error(`  ✗ ${f.file}: 全透明，跳过`);
      continue;
    }
    items.push({ ...f, input, bbox });
  }
  if (items.length === 0) return;

  // 锚点对齐：全部姿势画布尺寸一致 → 用联合包围盒（各姿势同裁切框 → 同缩放同位置）
  const sameDims = items.every((it) => it.bbox.imgW === items[0].bbox.imgW && it.bbox.imgH === items[0].bbox.imgH);
  let unionBox = null;
  if (items.length > 1 && sameDims) {
    const l = Math.min(...items.map((it) => it.bbox.left));
    const t = Math.min(...items.map((it) => it.bbox.top));
    const r = Math.max(...items.map((it) => it.bbox.left + it.bbox.width));
    const b = Math.max(...items.map((it) => it.bbox.top + it.bbox.height));
    unionBox = { left: l, top: t, width: r - l, height: b - t };
  } else if (items.length > 1) {
    console.warn(`  ⚠ ${id}: 各姿势画布尺寸不一致，回退各自裁切（战斗切图可能跳位；建议用同分辨率生成变体）`);
  }

  for (const it of items) {
    const outName = it.pose === 'idle' ? `${id}.webp` : `${id}.${it.pose}.webp`;
    await renderSprite(it.input, unionBox ?? it.bbox, path.join(OUT_DIR, outName));
    console.log(`  ✓ ${it.file} → fighters/${outName}${unionBox ? '（锚点对齐）' : ''}`);
  }
}

/** 处理战场背景：cover 裁切 + 压暗/去饱和/轻模糊（保证角色可读性），并写 manifest.json。 */
async function processBackgrounds() {
  if (!existsSync(RAW_BG_DIR)) return;
  const files = (await readdir(RAW_BG_DIR)).filter((f) => EXTS.has(path.extname(f).toLowerCase()));
  if (files.length === 0) return;
  await mkdir(OUT_BG_DIR, { recursive: true });
  console.log(`处理 ${files.length} 张背景 → ${BG_W}×${BG_H} WebP（压暗 + 轻模糊）：`);
  const names = [];
  for (const f of files) {
    const name = path.basename(f, path.extname(f));
    try {
      await sharp(path.join(RAW_BG_DIR, f))
        .resize(BG_W, BG_H, { fit: 'cover', position: 'centre' })
        .modulate({ brightness: 0.72, saturation: 0.85 }) // 压暗去饱和：让前景角色跳出来
        .blur(1.2) // 轻模糊 ≈ 景深
        .webp({ quality: 82 })
        .toFile(path.join(OUT_BG_DIR, `${name}.webp`));
      names.push(name);
      console.log(`  ✓ bg/${f} → backgrounds/${name}.webp`);
    } catch (e) {
      console.error(`  ✗ bg/${f}: ${e.message}`);
    }
  }
  // manifest：前端背景下拉框的数据源
  names.sort();
  await writeFile(path.join(OUT_BG_DIR, 'manifest.json'), JSON.stringify(names, null, 2));
  console.log(`  ✓ backgrounds/manifest.json（${names.length} 张）`);
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

  // 收集角色图（排除 bg/ 子目录），按 id 分组（一个角色的多姿势一起处理 → 锚点对齐）
  const all = (await readdir(RAW_DIR, { withFileTypes: true }))
    .filter((d) => d.isFile() && EXTS.has(path.extname(d.name).toLowerCase()))
    .map((d) => ({ file: d.name, ...parseName(d.name) }));
  const wanted = only.length ? all.filter((f) => only.includes(f.id)) : all;

  const byId = new Map();
  for (const f of wanted) {
    if (!byId.has(f.id)) byId.set(f.id, []);
    byId.get(f.id).push(f);
  }

  if (byId.size === 0) {
    console.log(only.length ? `art/raw 下没有匹配 ${only.join(',')} 的图` : 'art/raw 下没有角色图片');
  } else {
    console.log(`处理 ${wanted.length} 张角色图（${byId.size} 个角色）→ ${SIZE}×${SIZE} WebP${flattenBg ? `（纯色去背，容差 ${tolerance}）` : ''}：`);
    for (const [id, files] of byId) {
      try {
        await processCharacter(id, files, opts);
      } catch (e) {
        console.error(`  ✗ ${id}: ${e.message}`);
      }
    }
  }

  // 背景（只在不限定角色时处理；npm run art TungSahur 不动背景）
  if (only.length === 0) await processBackgrounds();
  console.log('完成。');
}

main();
