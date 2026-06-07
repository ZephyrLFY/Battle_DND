# 3v3 队伍战术战斗系统 —— 设计文档（待实现）

> 这是项目的下一次大重构：从 1v1 → **NvN 队伍战术战斗**，并借机做 P0 重构
> （去 Pokemon 化 + 技能效果插件化）。**本文是设计稿，代码下次写。**
>
> 决策已定（2026-06-07）。底层（dice/属性派生/伤害公式）全部复用，
> 变的是战斗"编排骨架"（谁打谁、轮到谁、几个人、目标选择）。

---

## 一、已拍板决策汇总

| 维度 | 决定 |
|------|------|
| 战斗规模 | **3v3 同场**（引擎做成 NvN，1v1 = N=1 的特例，两种模式都保留）|
| 出手顺序 | **全员按先攻排序成一条序列轮转**（6 人各掷 1d20+DEX，死亡移出/复活插回）|
| 出场阵容 | **固定 3 上场，无后备**（队伍≥3 角色时选 3 出战）|
| 目标系统 | **6 类目标**：self / one_enemy / all_enemies / one_ally / all_allies / everyone |
| 倒地/死亡 | **简化版**：HP≤0 倒地（不能行动，可被救活）；倒地时再被攻击 → 彻底死亡移出 |
| 胜负 | **一方 3 人全部彻底死亡 → 输** |
| 选目标 UI | **两步**：先选动作 → 高亮可选目标 → 点目标确认 |
| 自动开关 | 我方也可走 AI（观战加速），见 backlog |

并同步落实 backlog 的玩法改动：
- **Team 概念取代"精灵 list"**：队内不能有重复角色。
- **纯净战斗**：输赢不增减角色（角色获取/移除走别的路子，待设计）。
- **去 Pokemon 化**：命名中性化，角色数据抽到可替换数据表（P0 重构）。

---

## 二、数据结构设计

### 角色实例（去 Pokemon 化）
```
PokemonInstance  →  Combatant（中性命名）
  species        →  archetypeId   （指向角色数据表的 id，不再写死宝可梦名）
  level, exp, abilities, skills 不变
```
12 个角色的数据（名字 + 天赋属性）抽到 `roster.ts`（或 JSON），逻辑层只认 `archetypeId`。
**换皮 = 换这张表**，引擎一行不改。

### 队伍
```
Team = {
  members: Combatant[]      // 全部拥有的角色（无重复 archetypeId）
  lineup: number[]          // 出战的 3 个在 members 里的索引
}
```
约束：`members` 内 archetypeId 唯一；`lineup` 长度 = 出战人数（3，或 1v1 时 1）。

### 战斗状态（NvN）
```
BattleState = {
  teams: { a: FighterRT[]; b: FighterRT[] }   // 每方 N 个临场角色
  order: FighterRef[]                          // 先攻序列（含双方所有存活+倒地角色）
  turnIndex: number                            // 当前轮到 order 里第几个
  round: number
  rngCursor: number
  winner?: 'a' | 'b' | null
}

FighterRT（临场可变态）= 现有 Fighter + {
  id: string             // 队内唯一标识（用于选目标/序列引用）
  team: 'a' | 'b'
  downed: boolean        // 是否倒地（HP≤0 但未彻底死亡）
  dead: boolean          // 彻底死亡（移出战斗）
}
FighterRef = { team: 'a'|'b'; id: string }
```

### 动作（带目标）
```
Action =
  | { kind: 'attack'; target: FighterRef }
  | { kind: 'skill'; skill: SkillId; targets: FighterRef[] }   // AOE 时多目标
```
引擎据技能的 `targetType` 校验/收集 targets。

---

## 三、回合流程（NvN 状态机）

```
createBattle(teamA, teamB, seed):
  - 实例化双方 lineup 为 FighterRT[]
  - 全员各掷先攻 1d20+DEX_mod，降序排成 order
  - turnIndex = 0

每个"行动点"（order 里轮到的那个角色）：
  - 若该角色 dead → 跳过（理应已移出 order）
  - 若 downed → 跳过回合（倒地不能行动）
  - 若 stunned → 消耗昏迷，跳过
  - 否则：legalActions/allActions 给出可选动作（含目标要求）
          玩家/AI 选 { 动作 + 目标 } → applyAction 结算

applyAction 后：
  - 处理倒地/死亡：任何角色 HP≤0 → downed=true（已 downed 再受击 → dead，移出 order）
  - 检查胜负：某方全员 dead → winner
  - turnIndex 前进到 order 下一个存活/倒地角色；绕回则 round++
```

**先攻序列维护**：dead 的角色从 order 移除；复活的角色 downed=false 后留在原 order 位置
（不重排，避免复杂度）。

---

## 四、目标系统（6 类）

| targetType | 含义 | 选目标 UI |
|-----------|------|----------|
| `self` | 仅自己 | 无需选，自动 |
| `one_enemy` | 单个敌方 | 高亮敌方存活角色，选 1 |
| `all_enemies` | 全体敌方（AOE）| 无需选，自动全体 |
| `one_ally` | 单个友方（含倒地，治疗/复活用）| 高亮友方，选 1 |
| `all_allies` | 全体友方 | 无需选 |
| `everyone` | 全场 | 无需选 |

每个技能在 `skills.ts` 声明 `targetType`。普攻固定 `one_enemy`。

---

## 五、技能池（适配目标 + 补团队技能）

### 现有 7 个适配 targetType
| 技能 | targetType | 备注 |
|------|-----------|------|
| 护盾格挡 | self | |
| 石化表皮 | self | |
| 精准瞄准 | one_enemy | |
| 英勇打击 | one_enemy | |
| 眩晕突袭 | one_enemy | |
| 疾风连击 | one_enemy | 两段打同一目标（或可分裂，先打同一个）|
| 蓄力重击 | one_enemy | |

### 新增团队技能（3v3 需要）
| 技能 | targetType | cost | unlockLv | 效果 |
|------|-----------|------|---------|------|
| **治疗术** | one_ally | 1 | 3 | 回复友方 `2d4 + CON_mod` HP（不能作用于 dead）|
| **复活术** | one_ally | 3 | 11 | 拉起一个倒地友方，回复其 `1d8` HP（仅对 downed 生效）|
| **烈焰风暴** | all_enemies | 2 | 8 | 对全体敌方各掷命中 + `1d6` 伤害（AOE）|
| **战吼** | all_allies | 2 | 6 | 全体友方下次攻击命中 +2（持续 1 轮）|

> 技能池从 7 → 11。技能栏上限仍 4，逼玩家在"输出/控制/团队辅助"间取舍。
> 解锁等级和 cost 沿用 v4 的分阶思路。

---

## 六、AI（选动作 + 选目标）
- 当前纯随机 AI 要升级：不只选动作，还要**选目标**。
- MVP：随机选合法动作 + 随机选合法目标。
- 留 TODO(ai)：迭代成"优先打残血/优先救倒地队友/AOE 多目标时机"。
- 敌方队伍生成 `generateEnemyTeam(level, seed)` 挪进 shared（去掉 UI 层手搓随机）。

---

## 七、实现两步走（已定策略）

### 第一步：NvN 骨架，先跑 1v1 验证
- 重写 battle.ts 为 NvN：teams 数组 + 先攻序列 order + 动作带 target。
- **先用 N=1 跑通**，复用/改造现有 11 个 battle 单测验证骨架正确。
- 倒地/复活/AOE 先留接口和最简实现，1v1 下天然退化（无队友可救、AOE=打那一个）。
- 同步做 P0 重构：去 Pokemon 化命名 + 角色数据表 + 技能效果插件化
  （技能从 battle.ts 的大 switch 抽成注册式 effect handler）。

### 第二步：填到 3v3 + AOE + 复活 + 选目标 UI
- N 开到 3，补全 AOE 多目标伤害、倒地/复活完整逻辑。
- client：选目标两步交互、3v3 战场 Canvas 布局、队伍编辑器（选 3 出战、查重）。
- 补 4 个团队技能。
- 平衡：批量 3v3 模拟。

---

## 八、影响范围（相对当前 v4）
- `shared/pokemon.ts` → 拆分/改名：`combatant.ts`（实例+派生）+ `roster.ts`（角色数据表）。
- `shared/skills.ts`：加 `targetType`；补 4 个团队技能。
- `shared/effects/`（新）：技能效果插件化，每个技能一个 effect handler，注册到引擎。
- `shared/battle.ts`：**重写为 NvN 状态机**（teams/order/target）。
- `shared/team.ts`（新）：Team 结构 + 查重 + 选出战。
- `shared/ai.ts`：选目标；`generateEnemyTeam`。
- `client/`：选目标 UI、3v3 战场、队伍编辑器、自动战斗开关。
- 表现层颜色等从 shared 移到 client（P2 顺手做）。
- 测试：NvN 状态机、6 类目标、倒地/复活、AOE、团队技能。

---

## 九、仍待定（不阻塞开始，但要记着）
- 角色获取/移除的"别的路子"（商店/解锁/任务/抽卡？）—— 纯净战斗后游戏的成长动力来源。
- 去 Pokemon 化的**目标主题**（泛奇幻/科幻/抽象？）—— 影响 roster 数据表的命名风格。
- 战斗规模是否未来还要可变（2v2、4v4）—— NvN 骨架已天然支持，数据填充问题。
