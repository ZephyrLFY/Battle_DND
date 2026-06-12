# 生图 Prompt 包 · Italian Brainrot 角色姿势 + 战场背景

配合 [`art/README.md`](README.md) 的管线使用。生成 → 丢进 `art/raw/`（背景进 `art/raw/bg/`）→ `npm run art`。

---

## 工作流（先读这个）

1. **以现有 idle 图为参考生成姿势变体**。⚠ 关键原则：**姿势变体的 prompt 里不要重新描述角色**——
   描述越丰富，模型越倾向"按描述重新创作"而不是"改参考图的姿势"。角色描述只用于：
   ① 第一次生成 idle；② 模型实在认不出参考图是什么东西时的兜底。
   姿势变体一律用下面的「编辑式指令模板」（见下节）。
2. **分辨率必须和 idle 完全一致**——管线靠"同画布尺寸"做锚点对齐，尺寸不一致切图会跳位。
3. **朝向和 idle 保持一致**（翻转由游戏表现层处理）。各角色现有 idle 的朝向：

   | 朝左 | 正面 | 朝右 |
   |---|---|---|
   | TungSahur, BombardiroCrocodilo, BombombiniGusini, FrigoCamelo, TralaleroTralala | CappuccinoAssassino | LiriliLarila, BrrBrrPatapim, TrippiTroppi, BonecaAmbalabu, BallerinaCappuccina, ChimpanziniBananini |

4. **背景**：首选能直接出透明 PNG 的工具；不行就用**纯灰底**（prompt 里已带），
   回来跑 `npm run art -- --flatten-bg` 去背。
5. 文件命名：`<ArchetypeId>.attack.png` / `.hit.png` / `.downed.png`（idle 无后缀）。

---

## 通用风格锚点（拼在每条 prompt 末尾）

```
glossy hyperreal 3D render, viral AI-generated Italian Brainrot meme style, absurd surreal creature, studio lighting, vibrant saturated colors, full body in frame, single character, centered composition, plain flat gray background, no text, no watermark, no logo
```

**通用负面提示词：**

```
multiple characters, cropped limbs, text, caption, watermark, signature, frame, border, blurry, low quality, photorealistic human, extra background objects, scenery
```

## 姿势变体 · 编辑式指令模板（防止 AI 自由发挥的关键）

**通用锁定框架**（每个姿势 prompt 都套这个壳，`<POSE>` 处填下面的姿势短语）：

```
This is the exact same character as the reference image. Change ONLY the pose: <POSE>.
Keep the character design, colors, materials, outfit, accessories, proportions, facial
features, art style and lighting EXACTLY identical to the reference image. Same camera
angle, same distance, full body in frame, same flat gray background. Do NOT redesign
the character, do NOT add or remove any details, do NOT change the style.
```

姿势短语：

- **attack**：`mid-attack dynamic action pose, lunging forward aggressively, motion energy, <角色专属动作>`
- **hit**：`flinching backward from a heavy blow, recoiling, comically pained expression, eyes squeezed shut, body leaning back, impact reaction`
- **downed**：`knocked out cold, collapsed lying on the ground, dizzy swirl eyes, tongue sticking out, comically defeated, limbs sprawled`

**姿势变体的负面提示词**（在通用负面之外追加）：

```
redesigned character, different character, changed outfit, changed colors, new accessories, missing accessories, style change, different proportions, different face
```

**分工具要点：**

| 工具类型 | 用法 |
|---|---|
| 编辑式模型（Nano Banana / GPT-image / 即梦图片编辑）| **首选**。传 idle 图 + 上面的编辑指令即可，天然保形 |
| Midjourney | idle 当 `--cref` 且 `--cw 100`（最大保形），prompt 只写姿势短语 + 锁定框架，`--s` 调低 |
| SD 系 img2img | 重绘幅度 0.45~0.6 + ControlNet（OpenPose 摆目标姿势）；纯 img2img 改大姿势容易崩 |

**两个心理预期：**
- 一次生成多张挑最像的，比反复调 prompt 效率高得多。
- 游戏里 sprite 只有 84px 大小——细节小偏差（纹理、小配饰）在战场上**根本看不出来**，
  只要剪影、配色、大件特征（棒球棍/刀/轮胎）一致就算合格，不必追求像素级一致。

> downed 是横躺构图，画面占比会比站姿小——正常现象，管线的联合包围盒会统一缩放。

---

## 12 角色 · 基础描述 + 专属攻击动作

**基础描述只在两种场合用**：① 从零生成 idle；② 编辑式生成时模型认不出参考图、画崩了，
才把描述加回指令里兜底。正常的姿势变体流程**只用** attack 动作短语（填进锁定框架的 `<POSE>`）。

### TungSahur 🥖
```
a sentient wooden log creature, cylindrical brown timber body with simple dopey cartoon face, holding a wooden baseball bat, Indonesian sahur drum caller vibes
```
attack 动作：`swinging the baseball bat in a violent overhead smash, bat blur`

### CappuccinoAssassino ☕
```
a slim assassin with a cappuccino cup head topped with foam art, sleek black ninja-samurai outfit, dual katanas, deadly elegant
```
attack 动作：`mid-air cross slash with both katanas, blade streaks`

### BombardiroCrocodilo 🐊
```
a crocodile fused with a WWII bomber airplane, scaly green crocodile head and jaws on a military aircraft fuselage with wings and propellers, bomb bay
```
attack 动作：`diving attack with bomb bay open, bombs dropping, jaws wide open`

### LiriliLarila 🌵🐘
```
an elderly elephant with a cactus body covered in spines, wearing sandals, leaning on a wooden cane, desert wanderer vibes
```
attack 动作：`raising the cane high, glowing clock aura, time-stop magic surge`

### BrrBrrPatapim 🌳
```
a forest spirit with a tangled tree-root body, monkey face with a long proboscis nose, mossy leaves growing on limbs, mischievous grin
```
attack 动作：`commanding whipping vines that lash forward from outstretched arms`

### BombombiniGusini 🦢💣
```
a white goose fused with a fighter jet, jet engine wings, strapped with grenades and bombs, manic expression
```
attack 动作：`kamikaze charge forward with afterburner flames, clutching a lit bomb`

### TrippiTroppi 🐸
```
a surreal hybrid creature with a fluffy cat head on a glistening shrimp-fish body, bizarre mashup anatomy, smug feline expression
```
attack 动作：`hissing with arched back, fur standing up, claws swiping forward`

### BonecaAmbalabu 🐸🛞
```
a creature with a frog head mounted on a black rubber car tire body, bare human legs sticking out below, cursed cryptid energy
```
attack 动作：`rolling charge attack, tire spinning with smoke, frog face determined`

### FrigoCamelo 🐪🧊
```
a camel whose torso is a white refrigerator with double doors and a freezer drawer, frost vapor, desert survivor vibes
```
attack 动作：`fridge doors flung open blasting a cone of ice shards and frost`

### TralaleroTralala 🦈👟
```
a blue shark standing upright on three legs, each foot wearing a Nike sneaker, sporty confident grin
```
attack 动作：`blinding speed dash, motion blur afterimages, biting lunge`

### BallerinaCappuccina 🩰☕
```
a graceful ballerina with a cappuccino cup head with foam art, pink tutu and pointe shoes, elegant dancer posture
```
attack 动作：`commanding waltz twirl, skirt flaring, radiating golden musical sparkles`

### ChimpanziniBananini 🍌🐒
```
a small chimpanzee wearing a banana peel suit, half-peeled revealing the chimp inside, yellow-green palette, hyperactive grin
```
attack 动作：`frenzied flurry of rapid punches, fists blurred in multiples, wild screaming face`

---

## 战场背景（放 `art/raw/bg/`，文件名即下拉框选项名）

**16:9、能多大就多大**（理想宽 ≥2480，如 2560×1440；生图工具上限 2048 也可接受，会轻微放大）。
管线 cover 裁切成 2480×1400 并自动压暗/去饱和（不加模糊），所以**不必刻意做暗**，
但构图中部要留干净的站位区。

**通用尾缀**（拼在每条后面）：

```
wide painterly game battle background, soft depth of field, gentle haze, clean empty middle ground for characters to stand, no characters, no creatures, no text, muted background contrast
```

**通用负面提示词**：`characters, people, animals, text, UI, frame, high contrast clutter in center`

| 文件名建议 | Prompt |
|---|---|
| `colosseum` | ancient Roman colosseum arena interior, sandy ground, sunlit stone arches, distant cheering stands |
| `piazza` | Italian town piazza at golden hour, terracotta buildings, fountain in far background, cobblestone ground |
| `kitchen` | surreal giant Italian kitchen, oversized pasta pots and tomatoes, steam, warm light, brainrot absurdism |
| `beach` | Mediterranean beach at noon, turquoise sea, distant shark fins in water, beach umbrellas far away |
| `desert` | desert oasis with ruined Roman columns, cacti, heat shimmer, sand dunes |
| `void` | glitchy surreal dreamcore sky arena, floating clouds and checkerboard fragments, TikTok-core liminal space |

---

## 验收清单（每批图回来过一遍）

- [ ] 姿势图与 idle 同分辨率？（不同 → 管线会警告"回退各自裁切"）
- [ ] 同朝向？透明底或纯灰底？
- [ ] `npm run art <Id>` 输出带"（锚点对齐）"字样？
- [ ] 进游戏开一场战斗：攻击/受击/倒地切图不跳位、不闪？
- [ ] 背景：角色和血条文字在上面读得清？（读不清 → 告诉 Claude 调管线压暗参数）
