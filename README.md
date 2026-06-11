# 意大利山海经 · Italian Brainrot

一个 **3v3 D&D 风回合制战术战斗** 游戏，TypeScript 全栈、浏览器里玩。
当前主题是 **Italian Brainrot**（"意大利脑腐" meme 怪物，戏称"意大利山海经"），见 [`CHARACTERS.md`](CHARACTERS.md)。

> 这个项目的来历有点特别：它是一个 **8 年前用 C++/Qt 写的大学课程 project** 的现代化重写。
> 原版是局域网联机的实时自动战斗宝可梦游戏（现归档在 [`legacy/`](legacy/)）。
> 现在它被彻底重做成 TypeScript 全栈、确定性引擎、D&D 风的回合制战术战斗。

---

## 快速开始

```bash
npm install
npm run dev:client   # 启动游戏 → http://localhost:5173
```

其他命令：

```bash
npm test                 # 跑所有单测（shared 引擎）
npm run sim 10 200       # 平衡模拟：属性向 build 循环赛胜率表
npm run sim:balance 10 200  # 角色平衡：12 角色 1v1 + 3v3 胜率（只带签名+被动）
npm run art              # 美术资产管线：把 art/raw/ 的角色图统一成战场 sprite（见 art/README.md）
npm run build            # 生产构建
```

需要 Node 18+（开发用的是 Node 24）。

---

## 玩法

1. **配队**：选 3 个**不重复**的角色出战。每个角色：
   - 把属性点分配到 **STR 力量 / DEX 敏捷 / CON 体质**（每升一级 +2 点，可洗点）
   - **签名技能出生自带**、固定占技能栏第一格（不可卸）；另从通用技能池自选最多 3 个
   - 每个角色还有一个**天生被动**（不占栏），契合其 meme 背景，见 [`CHARACTERS.md`](CHARACTERS.md)
2. **战斗**：3v3 回合制，全员按**先攻**（1d20 + DEX）排序轮流出手
   - 每回合选：普通攻击 或 一个技能（需选目标的两步选）
   - 所有判定走**可视骰子**（命中 1d20 对 AC、暴击、伤害骰），战斗日志像跑团一样摊开
   - 战斗按事件**逐步回放**（可调速 1x/2x/瞬间）；可开「自动战斗」让我方也交给 AI 观战
3. **胜负**：把对面 3 人**全部打至倒地**即获胜

### 核心机制

| 机制 | 说明 |
|------|------|
| **属性** | STR→命中/伤害；DEX→护甲(AC)/先攻；CON→生命/吸血 |
| **能量** | 从 0 起，普攻**命中** +1、**闪避**敌方攻击 +1，放技能消耗（cost 0~3）。逼你"想放大招得先普攻"，高 AC 还能防御转资源 |
| **倒地** | HP≤0 倒地（不能行动、**不可被补刀**），队友可用复活术救回；倒地超 3 回合未救 → 彻底死亡 |
| **技能** | 按 cost 0~3 耗能；攻击/防御/AOE/治疗/复活/增益 + 各角色出生自带的专属签名技能 |
| **被动** | 每个角色一个天生被动（不占栏）：常驻减伤/反伤/续航、受击叠层、暴击追击、联动、额外回合等 |

数值常量：满级 15、属性上限 30、出战 3 人、技能栏 4 格。

---

## 架构

TypeScript monorepo（npm workspaces），逻辑与界面分离：

```
packages/
├─ shared/   纯逻辑（前后端可共享）—— 确定性、可单测、无 UI 依赖
│  ├─ combatant.ts   角色实例 + 属性派生（AC/命中/HP/能量…）
│  ├─ roster.ts      12 个角色数据表（换皮只改这张表）
│  ├─ skills.ts      技能定义（通用池 + 各角色签名技能）
│  ├─ effects.ts     技能效果（注册式 handler，加技能不碰引擎核心）
│  ├─ passives.ts    角色被动（注册式，按 archetype；引擎在固定钩子点调用）
│  ├─ battle.ts      回合制战斗状态机（createBattle/legalActions/applyAction）
│  ├─ leveling.ts    加点/洗点/学技能/经验
│  ├─ team.ts        队伍（查重）+ 随机敌队生成
│  ├─ ai.ts          敌方 AI（随机 / 贪心=1-ply 真实引擎推演）
│  ├─ evaluate.ts    局面评估 V(state)（推演 AI 的价值函数，权重集中可调）
│  ├─ dice.ts        确定性掷骰
│  ├─ rng.ts         确定性随机（可序列化游标）
│  └─ sim.ts         平衡模拟工具（批量对局 + 胜率矩阵）
└─ client/   React + Vite + Canvas（占位美术）
   ├─ App.tsx          编排：配队阶段 → 战斗阶段
   ├─ TeamEditor.tsx   队伍编辑（选 3 出战、查重）
   ├─ BuildEditor.tsx  单角色养成（加点/洗点/学技能）
   ├─ BattleStage.tsx  Canvas 战场（先攻条 + 3v3 错位布局 + 角色 sprite/朝向）
   ├─ playback.ts      事件回放折叠（把引擎事件流逐帧推进显示态）
   ├─ presentation.ts  表现层映射（主题色 / sprite 路径 / 朝向）
   └─ useBattle.ts     回合制驱动 + 两步选目标 + 自动战斗 + 事件回放
```

### 几个设计要点
- **确定性战斗引擎**：`(状态, 动作) → (新状态, 事件流)` 纯函数，RNG 游标可序列化。
  天然支持单机 PvE、单测、以及未来的联机 PvP（服务端权威态）。
- **事件流驱动 UI**：引擎输出带骰子明细的事件，前端只负责渲染，逻辑零重复。
- **可换皮**：角色概念中性化（`Combatant`/`archetypeId`），具体角色在 `roster.ts` 一张表里。
- **数据驱动平衡**：`npm run sim` 跑批量对局出胜率表，调数值有客观依据。

---

## 测试与平衡

- **单测**：`npm test`，覆盖战斗引擎、属性派生、技能、被动、养成、AI、模拟工具。
- **平衡模拟**：`npm run sim` 跑属性向 build 循环赛；`npm run sim:balance` 跑 12 角色
  1v1（隔离单体）+ 3v3 选秀价值（随机组队蒙特卡洛，消除基准队偏置）胜率，并输出**技能使用率**
  （AI 健康度仪表盘：某角色签名使用率 ≈0 说明其胜率数据不反映 kit 强度）。
  调参依据见 [`BALANCE_REPORT.md`](BALANCE_REPORT.md)。
  注意：贪心 AI 已改为 1-ply 真实引擎推演（`ai.ts` + `evaluate.ts`），sim 比公式版慢约 5 倍，
  **旧报告的胜率结论需用新 AI 重跑后重审**。

---

## 文档

- [`CHARACTERS.md`](CHARACTERS.md) — 角色图鉴：12 个 Italian Brainrot 角色的背景 + 专属技能（被动/签名）
- [`BALANCE_REPORT.md`](BALANCE_REPORT.md) — 平衡性报告：sim 胜率数据 + 已实施的调参补丁
- [`ART_PLAN.md`](ART_PLAN.md) — 美术方案：事件回放 + 状态动画 + 资产管线路线
- [`art/README.md`](art/README.md) — 美术资产管线用法（原图 → 战场 sprite）
- [`legacy/README.md`](legacy/README.md) — 8 年前 C++/Qt 原版的说明 + 玩法/数值考古

---

## 现状与路线

战斗系统已较完整：3v3、能量、通用技能池、**每角色专属被动 + 签名技能**、养成、AI、
可视骰子 + **事件逐帧回放**、平衡工具；Italian Brainrot 换皮 + 角色 sprite（带朝向）。

未做（backlog）：
- **数值平衡**：已做一轮 sim 驱动调参（见 [`BALANCE_REPORT.md`](BALANCE_REPORT.md)），头尾仍在迭代；
  CA↔BC 联动需加专门 sim 才能评判。
- **状态动画**：受击抖动/攻击突进/跳字等（[`ART_PLAN.md`](ART_PLAN.md) Step B）。
- 外层游戏循环（角色获取/解锁）、联机 PvP（`packages/server` 待建）、登录存档。
