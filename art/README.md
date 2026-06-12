# 美术资产管线

把角色原图（你用 AI 去背/统一画风后的全身图）放进 `raw/`，跑脚本统一成战场 sprite。
战场背景图放进 `raw/bg/`。

## 用法

```bash
# 角色图放 art/raw/，文件名 = roster 的 archetype id（见下表），如 TungSahur.png
# 姿势变体加后缀：TungSahur.attack.png / TungSahur.hit.png / TungSahur.downed.png
# 背景图放 art/raw/bg/，文件名随意（会显示在游戏的背景下拉框里）
npm run art              # 处理 raw/ 全部角色图 + raw/bg/ 全部背景
npm run art TungSahur    # 只处理指定角色（含其所有姿势；不动背景）
```

## 角色姿势（静态图 + 程序化动效 = 伪动画）

| 文件名 | 用途 | 战场触发时机 |
|---|---|---|
| `<Id>.png` | idle 基础姿势（必备） | 默认 |
| `<Id>.attack.png` | 攻击姿势 | 该角色出手时 |
| `<Id>.hit.png` | 受击姿势 | 被命中/受伤时 |
| `<Id>.downed.png` | 倒地姿势 | 倒地/死亡时（死亡额外灰度化） |

**缺哪张回退哪张**：缺姿势 → 用 idle；缺 idle → 圆形占位。可以一张一张补。

**⚠ 锚点对齐（重要）**：用 img2img 从 idle 生成姿势变体，**保持和 idle 相同的分辨率**。
管线检测到同角色多姿势画布尺寸一致时，会用「联合包围盒」统一裁切——各姿势的缩放和
位置完全一致，战斗切图不跳位。尺寸不一致会回退各自裁切并警告（切图会跳）。

生成姿势时其他要求：和 idle **同朝向**（翻转交给表现层）、透明背景（或纯色背景 +
`--flatten-bg`）、全身入画。

## 战场背景

`raw/bg/*.png` → `public/backgrounds/<名字>.webp`（1760×880 cover 裁切）+ `manifest.json`。
管线会自动**压暗 28% + 去饱和 + 轻模糊**——生成原图时不必刻意做暗，但建议：构图中部
留干净区域（角色站位区）、避免高对比的细碎纹理。

游戏战场上方的「背景」下拉框读 manifest 自动列出全部背景，无需改代码。

## 角色图输出

`packages/client/public/fighters/<Id>[.<pose>].webp`（1024×1024，透明背景，居中留边）。

处理流程：[可选纯色去背 `--flatten-bg[=容差]`] → alpha 包围盒（多姿势取联合，锚点对齐）→
**亮度归一**（主体均亮向 ~110 温和收敛，clamp ±20/25%，同角色姿势共用系数）→
等比缩放居中进 1024 正方形 → WebP。**不做复杂去背**——假设输入已是透明背景。

另外把每角色的**体量系数**写进 `fighters/meta.json`：按主体面积占比算缩放（clamp 0.85~1.35），
战场按系数放大/缩小绘制框——解决横构图角色（如轰炸机）等比 contain 后视觉体量偏小的问题。
处理单个角色时建议整组姿势一起重跑（亮度系数取自 idle，姿势间保持光照一致）。

## 文件名 = archetype id

| 文件名 | 角色 |
|---|---|
| `TungSahur.png` | Tung Tung Tung Sahur |
| `CappuccinoAssassino.png` | Cappuccino Assassino |
| `BombardiroCrocodilo.png` | Bombardiro Crocodilo |
| `LiriliLarila.png` | Lirilì Larilà |
| `BrrBrrPatapim.png` | Brr Brr Patapim |
| `BombombiniGusini.png` | Bombombini Gusini |
| `TrippiTroppi.png` | Trippi Troppi |
| `BonecaAmbalabu.png` | Boneca Ambalabu |
| `FrigoCamelo.png` | Frigo Camelo |
| `TralaleroTralala.png` | Tralalero Tralala |
| `BallerinaCappuccina.png` | Ballerina Cappuccina |
| `ChimpanziniBananini.png` | Chimpanzini Bananini |

> `raw/` 里的原图不进 git（见 `.gitignore`）；只有处理后的 `public/fighters/*.webp`、
> `public/backgrounds/*` 入库。
