# 框架设计审视 + Backlog（2026-06-07）

> 背景：需求迭代了多轮（自动战斗 → D&D 回合制 → BG3 法术位 → 技能栏上限）。
> 这是一次主动暂停，目的：① 审视当前框架，找出不合理/非业界最佳实践处；② 整理 backlog。
> **本文不改代码**，只盘点。盘点结论决定后续重构的优先级。

---

## 一、当前框架全景

```
packages/
├─ shared/  (纯逻辑，前后端共享，1650 行)
│  ├─ rng.ts        确定性随机（mulberry32 + 可序列化游标）
│  ├─ dice.ts       掷骰（roll/d20/优势劣势/暴击翻倍 + 明细）
│  ├─ pokemon.ts    属性模型（STR/DEX/CON）+ 12 精灵天赋表 + deriveStats
│  ├─ skills.ts     7 技能静态定义（cost 0~3 / unlockLevel）
│  ├─ battle.ts     回合制状态机（createBattle/legalActions/allActions/applyAction）★470 行
│  ├─ leveling.ts   加点/洗点/学技能/卸技能/经验升级
│  └─ ai.ts         纯随机 AI（留 TODO 迭代）
└─ client/  (React+Vite+Canvas, 658 行)
   ├─ useBattle.ts   回合制 hook（驱动状态机 + AI 自动应对）
   ├─ battleLog.ts   事件流 → 跑团风日志
   ├─ BattleStage    Canvas 渲染（占位几何图形）
   ├─ BuildEditor    养成界面（选精灵/加点/学技能）
   └─ App            编排（build 阶段 / battle 阶段）
```

**核心架构优点（保留）**：
- 逻辑全在 `shared`，确定性纯函数 + 可序列化状态机 → 天然支持单测、PvE、未来 PvP 权威态。
- 数据驱动判定，事件流驱动 UI。这部分是对的，继续保持。

---

## 二、设计不合理 / 非最佳实践处（按严重度排序）

### 🔴 严重：`battle.ts` 470 行，God Module
战斗状态机、攻击管线、7 个技能效果结算、回合管理、克隆工具全挤在一个文件。
- **问题**：技能效果（`resolveSkill` 的大 switch）和引擎核心耦合。每加一个技能要改核心文件。
- **最佳实践**：技能应是**数据 + 注册式 effect handler**。引擎只认"技能有个 apply 函数"，
  具体效果在各自模块注册。新增技能不碰引擎。（类似策略模式 / 插件化）
- **现状的反模式**：`skills.ts` 只存静态数据，效果却在 `battle.ts` 里按 id `switch`——
  定义和行为分离在两个文件，加技能要两头改。

### 🔴 严重：领域命名硬绑定 "Pokemon"
`PokemonInstance`、`newPokemon`、`pokemon.ts`、`SPECIES_TALENT` 里写死 12 个宝可梦名。
- **问题**：你已明确说"以后可能整体换成别的角色，只改名字、逻辑保留"。当前命名让换皮成本高。
- **最佳实践**：领域概念应中性化。`PokemonInstance` → `Character`/`Unit`/`Combatant`；
  `species` → `archetypeId`；12 个角色的**数据**（名字+天赋）应抽到一个**可替换的数据表/配置**
  （如 `roster.ts` 或 JSON），逻辑层只认 id，不认具体名字。换皮 = 换数据表。

### 🟡 中：`PokemonInstance.abilities` 存"最终值"，丢失了"天赋 vs 加点"的区分
当前 `abilities` = 天赋+已分配点合并值，洗点要靠 `当前-天赋` 反推已花点数。
- **问题**：信息有损。无法直接知道"玩家往 STR 加了几点"，只能算差值；天赋表一改，存档语义就漂移。
- **最佳实践**：存**基础（天赋）+ 分配（allocations）两段**，最终值 = 派生计算。
  存档更稳健，洗点就是清空 allocations，不依赖反推。

### 🟡 中：`ai.ts` 纯随机，且 client 里 `randomEnemy` 是另一套随机逻辑
敌人 build 生成（`randomEnemy` 在 App.tsx）和敌人行动决策（`ai.ts`）分散两处，且都很随意。
- **问题**：`randomEnemy` 在 UI 层用 LCG 手搓随机、塞了 try/catch 吞 learnSkill 异常——脆。
- **最佳实践**：敌人生成应在 shared 里有个 `generateEnemy(level, seed)` 纯函数，
  和 AI 决策一起归到 shared，UI 只调用。便于测试和 PvP 时复用。

### 🟡 中：`themeColor` / 占位美术逻辑混在 `pokemon.ts`（领域层）
`ABILITY_COLOR`、`themeColor`、`TYPE_COLOR` 是**表现层**关注点，却在领域模型文件里。
- **最佳实践**：表现层映射（颜色/图标/贴图）属于 client 或一个 `presentation` 配置，
  不该污染 shared 的纯领域逻辑。

### 🟢 轻：缺协议层 / 校验层（为 PvP 预留但还没建）
设计文档说要 zod 校验的 WebSocket 协议，但 `packages/server` 还没建，`protocol.ts` 不存在。
- 暂不是问题（还没做联机），但 backlog 要记着：联机前先定协议层。

### 🟢 轻：`hasPendingGrowth` 等 UI 提示逻辑在 shared
养成"是否还有待领成长"是 UI 提示，放 shared 不算错（纯函数），但边界略模糊。可接受。

### 🟢 轻：测试覆盖不均
shared 60 个单测很扎实；但 client（hook/UI 编排）零测试。
- MVP 阶段可接受，但 `useBattle` 的回合驱动逻辑值得加几个测试。

---

## 三、重构建议优先级（不是现在做，是排序）

| 优先级 | 重构项 | 理由 | 成本 |
|--------|--------|------|------|
| P0 | **领域去 Pokemon 化**（命名中性化 + 角色数据表抽离） | 你已明确要换皮；越早越省 | 中 |
| P0 | **技能效果插件化**（拆 battle.ts，effect 注册式） | 每加技能改核心，痛点会持续 | 中 |
| P1 | abilities 存"基础+分配两段" | 存档稳健性，洗点更干净 | 小 |
| P1 | 敌人生成挪进 shared + AI 归位 | 去掉 UI 层手搓随机 | 小 |
| P2 | 表现层映射（颜色等）移出 shared | 关注点分离 | 小 |
| P2 | 协议层（联机前的前置） | 做 PvP 时再说 | 中 |

> 建议：**P0 两项一起做**——既然要去 Pokemon 化（大改命名），顺手把技能插件化和
> 数据表抽离一起重构，一次性把"换皮 + 加内容"的地基打好，避免反复动核心。

---

## 四、Backlog（你提的新想法 + 衍生）

### 玩法
- [ ] **战斗"自动"开关**：开启后我方也走随机/AI 操作，加速进程（观战模式）。
      → 技术上很简单：复用 `ai.ts` 给 a 方选动作，加个 toggle + 自动步进。
- [ ] **队伍（Team）概念取代"精灵 list"**：
  - 我方是一支 **team**（更符合 DND），不是一堆独立精灵。
  - **队内不能有重复角色**（同 species 只能一个）。
  - 战斗可能从 1v1 扩展为**队伍对战**（出场/替换机制？待定）。
- [ ] **战斗结果纯净化**：输不掉角色、赢不获得角色，**纯粹战斗**。
  - 角色的获取/移除走**别的路子**（待设计：商店？剧情？抽卡？徽章解锁？）。

### 换皮 / 主题
- [ ] **角色从"宝可梦"抽象为可替换主题**：逻辑全留，只换名字+美术。
      → 对应 P0 的"领域去 Pokemon 化"重构。

### 技术 / 体验
- [ ] 美术：占位几何图形 → 真贴图（独立任务）。
- [ ] PvE AI：纯随机 → 贪心/分难度（`ai.ts` 已留 TODO）。
- [ ] 联机 PvP：搭 `packages/server`（Node+ws+SQLite）+ 协议层。
- [ ] 登录/存档/数据库（原版有，新版还没做）。
- [ ] 大地图/游戏外循环（原版有，新版聚焦战斗，暂缓）。
- [ ] client 的 useBattle 加测试。
- [ ] 平衡模拟：批量对局出 build 胜率表，验证属性点系统平衡性。

---

## 五、当前未提交的工作
分支 `feat/dnd-combat` 有未提交改动：v4（技能栏上限4 + 分阶 cost + 解锁等级 + UI 横跳修复）。
shared 60 单测全过、两端 typecheck + 构建通过，**但尚未提交，也未手动验证手感**。
决定下一步前，应先决定：这批 v4 改动是先提交存档，还是连同重构一起重做。
