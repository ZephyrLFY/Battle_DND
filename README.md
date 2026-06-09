# Battle Pokemon

一个 **3v3 D&D 风回合制战术战斗** 游戏，TypeScript 全栈、浏览器里玩。

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
npm run sim 10 200       # 平衡模拟：Lv10、每组合 200 场，打印各 build 胜率表
npm run build            # 生产构建
```

需要 Node 18+（开发用的是 Node 24）。

---

## 玩法

1. **配队**：选 3 个**不重复**的角色出战。每个角色：
   - 把属性点分配到 **STR 力量 / DEX 敏捷 / CON 体质**（每升一级 +2 点，可洗点）
   - 从 11 个技能里学最多 4 个（按等级解锁）
2. **战斗**：3v3 回合制，全员按**先攻**（1d20 + DEX）排序轮流出手
   - 每回合选：普通攻击 或 一个技能（需选目标的两步选）
   - 所有判定走**可视骰子**（命中 1d20 对 AC、暴击、伤害骰），战斗日志像跑团一样摊开
   - 可开「自动战斗」让我方也交给 AI，快速观战
3. **胜负**：把对面 3 人**全部打至倒地**即获胜

### 核心机制

| 机制 | 说明 |
|------|------|
| **属性** | STR→命中/伤害；DEX→护甲(AC)/先攻；CON→生命/吸血 |
| **能量** | 从 0 起，普攻**命中** +1，放技能消耗（cost 0~3）。逼你"想放大招得先普攻" |
| **倒地** | HP≤0 倒地（不能行动、**不可被补刀**），队友可用复活术救回；倒地超 3 回合未救 → 彻底死亡 |
| **技能** | 戏法（免费）/ 法术（耗能量）；攻击/防御/AOE/治疗/复活/增益等 |

数值常量：满级 15、属性上限 30、出战 3 人、技能栏 4 格。

---

## 架构

TypeScript monorepo（npm workspaces），逻辑与界面分离：

```
packages/
├─ shared/   纯逻辑（前后端可共享）—— 确定性、可单测、无 UI 依赖
│  ├─ combatant.ts   角色实例 + 属性派生（AC/命中/HP/能量…）
│  ├─ roster.ts      12 个角色数据表（换皮只改这张表）
│  ├─ skills.ts      11 个技能定义
│  ├─ effects.ts     技能效果（注册式 handler，加技能不碰引擎核心）
│  ├─ battle.ts      回合制战斗状态机（createBattle/legalActions/applyAction）
│  ├─ leveling.ts    加点/洗点/学技能/经验
│  ├─ team.ts        队伍（查重）+ 随机敌队生成
│  ├─ ai.ts          敌方 AI（随机 / 贪心）
│  ├─ dice.ts        确定性掷骰
│  ├─ rng.ts         确定性随机（可序列化游标）
│  └─ sim.ts         平衡模拟工具（批量对局 + 胜率矩阵）
└─ client/   React + Vite + Canvas（占位美术）
   ├─ App.tsx          编排：配队阶段 → 战斗阶段
   ├─ TeamEditor.tsx   队伍编辑（选 3 出战、查重）
   ├─ BuildEditor.tsx  单角色养成（加点/洗点/学技能）
   ├─ BattleStage.tsx  Canvas 战场（先攻条 + 3v3 错位布局）
   └─ useBattle.ts     回合制驱动 + 两步选目标 + 自动战斗
```

### 几个设计要点
- **确定性战斗引擎**：`(状态, 动作) → (新状态, 事件流)` 纯函数，RNG 游标可序列化。
  天然支持单机 PvE、单测、以及未来的联机 PvP（服务端权威态）。
- **事件流驱动 UI**：引擎输出带骰子明细的事件，前端只负责渲染，逻辑零重复。
- **可换皮**：角色概念中性化（`Combatant`/`archetypeId`），具体角色在 `roster.ts` 一张表里。
- **数据驱动平衡**：`npm run sim` 跑批量对局出胜率表，调数值有客观依据。

---

## 测试与平衡

- **单测**：`npm test`，覆盖战斗引擎、属性派生、技能、养成、AI、模拟工具。
- **平衡模拟**：`npm run sim [等级] [场数]` 让标准 build（力量/敏捷/坦克/均衡）循环赛，输出胜率矩阵。改完数值立刻能看效果。

---

## 文档

- [`legacy/README.md`](legacy/README.md) — 8 年前 C++/Qt 原版的说明 + 玩法/数值考古
- [`TEAM_BATTLE_DESIGN.md`](TEAM_BATTLE_DESIGN.md) — 3v3 队伍战斗系统设计
- [`DESIGN_REVIEW.md`](DESIGN_REVIEW.md) — 框架审视 + backlog

---

## 现状与路线

战斗系统已较完整（3v3、能量、技能池、养成、AI、可视骰子、平衡工具）。

未做（backlog）：外层游戏循环（角色获取/解锁）、联机 PvP（`packages/server` 待建）、
登录存档、真贴图美术、换皮成其他主题。
