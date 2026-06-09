# 美术资产管线

把角色原图（你用 AI 去背/统一画风后的全身图）放进 `raw/`，跑脚本统一成战场 sprite。

## 用法

```bash
# 把原图放到 art/raw/，文件名 = roster 的 archetype id（见下表），如 TungSahur.png
npm run art              # 处理 raw/ 下所有图
npm run art TungSahur    # 只处理指定角色
```

输出：`packages/client/public/fighters/<id>.webp`（1024×1024，透明背景，居中留边）。
战场会自动用它替换圆形占位；**缺图的角色回退占位**，可以一张一张加。

处理做的事（第二道）：trim 透明边 → 等比缩放居中进 1024 正方形 → 导出 WebP。
**不做去背**——假设输入已是透明背景 PNG/WebP（去背在你的第一道 AI 处理里完成）。

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

> `raw/` 里的原图不进 git（见 `.gitignore`）；只有处理后的 `public/fighters/*.webp` 入库。
