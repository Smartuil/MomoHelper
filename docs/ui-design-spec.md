# UI 设计规格

> 本文档是 AI 产出界面的唯一依据。设计上下文见根目录 `.impeccable.md`。
> 所有色值、字号、间距必须来自第 2 节的设计 token，**不得在组件里硬编码字面值**。

## 0. 设计上下文摘要

| 项 | 结论 |
| --- | --- |
| 视觉方向 | 编辑排版风（Editorial）——字体层级驱动、宽松留白、细线分隔 |
| 品牌调性 | 严谨 · 清晰 · 克制 |
| 主题 | 明暗双模式，跟随系统 + 手动切换，两套独立调校 |
| 无障碍 | WCAG AA（正文对比度 ≥ 4.5:1，大字 ≥ 3:1） |
| 明确不做 | 蓝紫渐变、卡片堆叠、大圆角、通用图标；信息拥挤、小字号、表格堆砌 |

**一句话检验标准**：如果界面截图放进一份专业年报里不显得突兀，方向就对了。

---

## 1. 设计原则到实现规则

| 原则 | 落地规则 |
| --- | --- |
| 字先于色 | 层级靠 `--text-*` 三级字色 + 字号 + 字重；颜色只用于语义（遗忘/模糊/熟悉/信息），不做装饰性着色 |
| 留白是结构 | 分组优先用间距（≥ 24px），其次用 1px 细线，**最后**才考虑背景色块；**禁止**卡片套卡片 |
| 数据要有观点 | 每个指标必须带标签说明它回答什么问题；禁止无标签的数字罗列 |
| 两模式同等对待 | 深色下重新调校亮度与饱和度，不是简单反转 |
| 可读性优先 | 正文最小 15px，辅助文字最小 13px，**不得小于 13px** |

---

## 2. 设计 Token

### 2.1 颜色

采用 `oklch`，中性色带轻微暖调（纸张感），避免纯黑纯白。

```css
@import "tailwindcss";

/* 手动切换深色模式 */
@custom-variant dark (&:where(.dark, .dark *));

@theme
{
  /* ===== 浅色（默认）：纸张与墨 ===== */
  --color-bg:            oklch(98.2% 0.004 85);   /* 页面底色，微暖纸白 */
  --color-bg-subtle:     oklch(96.2% 0.005 85);   /* 次级区块 */
  --color-surface:       oklch(99.6% 0.002 85);   /* 抬升面（下拉、弹层） */
  --color-border:        oklch(89%   0.008 80);   /* 细线分隔 */
  --color-border-strong: oklch(78%   0.010 80);   /* 强调分隔、输入框边界 */

  --color-text:          oklch(22%   0.012 65);   /* 正文，墨色非纯黑 */
  --color-text-muted:    oklch(48%   0.010 65);   /* 次要文字 */
  --color-text-subtle:   oklch(62%   0.008 65);   /* 辅助说明、时间戳 */

  /* ===== 语义色（只表意，不装饰）===== */
  --color-forget:        oklch(52%   0.170 28);   /* 遗忘、需要关注（朱砂）*/
  --color-forget-bg:     oklch(95%   0.025 28);
  --color-vague:         oklch(58%   0.130 65);   /* 模糊（琥珀）*/
  --color-vague-bg:      oklch(96%   0.030 75);
  --color-familiar:      oklch(48%   0.090 155);  /* 熟悉、已完成（墨绿）*/
  --color-familiar-bg:   oklch(95%   0.025 155);
  --color-info:          oklch(48%   0.100 245);  /* 信息、链接（墨蓝）*/
  --color-info-bg:       oklch(95%   0.025 245);

  /* ===== 交互 ===== */
  --color-accent:        oklch(52%   0.170 28);   /* 主操作，与 forget 同色系 */
  --color-accent-hover:  oklch(46%   0.180 28);
  --color-accent-bg:     oklch(95%   0.025 28);
  --color-focus:         oklch(58%   0.150 28);   /* 焦点环 */

  /* 深色模式下覆盖 */
  @variant dark
  {
    --color-bg:            oklch(17%  0.008 70);
    --color-bg-subtle:     oklch(20%  0.008 70);
    --color-surface:       oklch(23%  0.008 70);
    --color-border:        oklch(31%  0.010 70);
    --color-border-strong: oklch(41%  0.012 70);

    --color-text:          oklch(92%  0.008 80);
    --color-text-muted:    oklch(72%  0.010 75);
    --color-text-subtle:   oklch(58%  0.012 75);

    --color-forget:        oklch(68%  0.150 28);
    --color-forget-bg:     oklch(26%  0.040 28);
    --color-vague:         oklch(72%  0.115 70);
    --color-vague-bg:      oklch(26%  0.035 70);
    --color-familiar:      oklch(68%  0.085 155);
    --color-familiar-bg:   oklch(25%  0.030 155);
    --color-info:          oklch(70%  0.090 245);
    --color-info-bg:       oklch(25%  0.030 245);

    --color-accent:        oklch(68%  0.150 28);
    --color-accent-hover:  oklch(74%  0.140 28);
    --color-accent-bg:     oklch(26%  0.040 28);
    --color-focus:         oklch(70%  0.140 28);
  }
}
```

**实现时必须验证**：正文 `--color-text` on `--color-bg` 对比度 ≥ 4.5:1；`--color-forget` 作为文字压在 `--color-forget-bg` 上时 ≥ 4.5:1。用浏览器 DevTools 或对比度工具核对，不达标就调整明度。

**使用规则**：

- 状态色**只用于**该状态的标识（标签、数字、左侧细线），不做大面积填充。
- 大面积填充只用 `-bg` 变体，且透明度感要轻。
- **禁止**任何渐变色（`linear-gradient` / `radial-gradient`）。

### 2.2 字体

```css
@theme
{
  --font-display: 'Source Serif 4', 'Noto Serif SC', Georgia, serif;
  --font-body:    'IBM Plex Sans', system-ui, -apple-system, 'PingFang SC',
                  'Microsoft YaHei', sans-serif;
  --font-mono:    'IBM Plex Mono', ui-monospace, 'SF Mono', Consolas, monospace;
}
```

| 用途 | 字体 | 理由 |
| --- | --- | --- |
| 页面标题、区块标题、**英文单词**、数字指标 | `--font-display`（衬线） | 单词是本产品的核心内容，衬线强化「出版物/词典」质感 |
| 正文、UI 标签、按钮、表单 | `--font-body` | 保证高频阅读的可读性 |
| `voc_id`、代码、技术信息 | `--font-mono` | — |

**中文不引入 Web 字体**（体积与复杂度考虑），回退到系统字体栈。英文单词与数字使用 Web 衬线字体，这是主要的差异化点。

**数字必须使用等宽数字**：`font-variant-numeric: tabular-nums;`（表格与指标对齐）。

### 2.3 字号与行高

模块化比例 1.25，用 `clamp()` 做流体缩放。

```css
@theme
{
  --text-xs:   clamp(0.75rem,  0.73rem + 0.1vw,  0.8125rem); /* 12→13px，仅标签 */
  --text-sm:   clamp(0.8125rem,0.79rem + 0.15vw, 0.875rem);  /* 13→14px，辅助文字 */
  --text-base: clamp(0.9375rem,0.91rem + 0.2vw,  1rem);      /* 15→16px，正文 */
  --text-md:   clamp(1.0625rem,1.03rem + 0.25vw, 1.125rem);  /* 17→18px，强调正文 */
  --text-lg:   clamp(1.25rem, 1.19rem + 0.45vw, 1.4375rem);  /* 20→23px，区块标题 */
  --text-xl:   clamp(1.5625rem,1.45rem + 0.8vw,  1.875rem);  /* 25→30px，页面标题 */
  --text-2xl:  clamp(1.9375rem,1.75rem + 1.2vw,  2.4375rem); /* 31→39px，关键数字 */
  --text-3xl:  clamp(2.4375rem,2.1rem + 1.8vw,   3.25rem);   /* 39→52px，看板主指标 */

  --leading-tight:  1.2;   /* 标题 */
  --leading-snug:   1.35;  /* 单词、短句 */
  --leading-normal: 1.65;  /* 正文，阅读节奏 */
}
```

**硬性下限**：任何文字不得小于 `--text-xs`（12px），正文默认 `--text-base`（15px 起）。

### 2.4 间距

8px 基准，但刻意使用非等差的档位创造节奏，避免「万物 16px」。

```css
@theme
{
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  24px;
  --space-6:  32px;
  --space-7:  48px;
  --space-8:  64px;
  --space-9:  96px;
}
```

**使用规则**：

- 同一组内元素间距 ≤ `--space-4`
- 不同组之间 ≥ `--space-5`
- 页面主区块之间 ≥ `--space-7`
- 页面上下留白 ≥ `--space-8`

### 2.5 圆角、边框、阴影

```css
@theme
{
  --radius-sm: 2px;
  --radius-md: 3px;
  --radius-lg: 4px;
  --radius-full: 9999px;   /* 仅用于头像、状态点 */

  --shadow-sm: 0 1px 2px oklch(0% 0 0 / 0.04);
  --shadow-md: 0 4px 12px oklch(0% 0 0 / 0.06);
}
```

**关键约束**（这是与 SaaS 风格拉开距离的地方）：

- **圆角一律 ≤ 4px**。禁止 8px 以上的大圆角。
- **阴影几乎不用**，仅浮层（下拉、弹窗、Toast）可用 `--shadow-md`。
- 分隔优先用 `1px solid var(--color-border)`，其次用间距。
- **禁止卡片堆叠**：不允许卡片里再套卡片。

### 2.6 动效

```css
@theme
{
  --duration-fast:   120ms;   /* 悬停、按下 */
  --duration-normal: 200ms;   /* 元素出现、展开 */
  --duration-slow:   300ms;   /* 页面级转场 */

  --ease-out: cubic-bezier(0.25, 1, 0.5, 1);   /* ease-out-quart */
}
```

**规则**：

- 只动 `opacity` 与 `transform`，**禁止**动画化 `width` / `height` / `top` / `left`。
- **禁止**回弹、弹性、过冲类缓动。
- 必须尊重 `prefers-reduced-motion: reduce`，命中时所有时长降为 0。

---

## 3. 布局系统

### 3.1 Web 应用骨架

```text
┌──────────────┬────────────────────────────────────────────┐
│              │  页面标题                        [主操作]   │
│  侧边导航     ├────────────────────────────────────────────┤
│  240px       │                                            │
│              │  主内容区（最大 1200px）                     │
│  · 今日       │                                            │
│  · 遗忘词     │                                            │
│  · 易混词     │                                            │
│  · 问词       │                                            │
│  · 内容生成   │                                            │
│  · 云词本     │                                            │
│  · 生词提取   │                                            │
│  · 学习计划   │                                            │
│  · 词云       │                                            │
│  · 复盘       │                                            │
│  · 报告       │                                            │
│  · 设置       │                                            │
└──────────────┴────────────────────────────────────────────┘
```

| 区域 | 规格 |
| --- | --- |
| 侧边导航 | 固定 240px；`background: var(--color-bg-subtle)`；右侧 1px 分隔线；不用阴影 |
| 导航项 | 高 36px，左对齐，当前项用 2px 左侧竖线 + 加粗字重标识，**不用背景块高亮** |
| 页面标题区 | 底部 1px 分隔线；标题用 `--font-display` + `--text-xl` |
| 主内容区 | 左右 padding ≥ `--space-7`；内容最大宽 1200px |
| 顶部状态 | Token 状态、账号入口放右上角，弱化为 `--text-subtle` |

### 3.2 栅格

- 12 列，gutter `--space-5`（24px）
- 断点：`< 768px` 单列 / `768–1279px` 8 列 / `≥ 1280px` 12 列

---

## 4. 组件规格

优先使用 shadcn/ui，但**必须按以下规格覆写**，否则会带入默认的 SaaS 观感。

| 组件 | 覆写要求 |
| --- | --- |
| Button | 圆角 `--radius-md`（3px），高度 32/36/40px 三档；主按钮实心 `--color-accent`，次按钮 1px 边框，幽灵按钮无边框；**禁止**阴影与渐变 |
| Input / Select | 高度 36px，1px 边框 `--color-border-strong`，聚焦时边框转 `--color-focus` + 2px 外环；圆角 `--radius-md` |
| Table | 无外框；表头 `--text-sm` + `--text-muted`；行间 1px 底线；行高 ≥ 44px；数字右对齐 + `tabular-nums` |
| Tag / Badge | 圆角 `--radius-sm`（2px），用对应语义色的 `-bg` 背景 + 主色文字；**不用**全圆角胶囊样式（除非是状态点） |
| Card | **尽量避免**。需要分组时优先用「小标题 + 细线 + 间距」；确实需要时圆角 ≤ 4px、无阴影、1px 边框 |
| Dialog | 圆角 `--radius-lg`（4px），`--shadow-md`，遮罩 `oklch(0% 0 0 / 0.4)` |
| Tabs | 下划线式（2px 当前项下边线），**不用**胶囊式分段控件 |
| Toast | 由下或右上滑入，`--duration-normal`，`--shadow-md` |
| 图表 | 无网格背景或极淡网格；轴线用 `--color-border`；数据色用语义色；**禁止**彩虹色板 |

---

## 5. 页面设计

### 5.1 今日看板（`/`）

```text
今日学习                                    [刷新数据]
2026年9月20日 星期日

100 / 100        完成率 100%         10.3 分钟
████████████████████████████████████

新词 0   复习 100   未完成 0   遗忘 7

─────────────────────────────────────────────
需要关注
  affect      遗忘 · 学习 12 次 · 拼写相似    [诊断]
  effect      遗忘 · 学习 8 次                [诊断]
```

要点：

- 主指标 `100 / 100` 用 `--text-3xl` + `--font-display`，是整个页面最大的元素。
- 进度条用 `--color-familiar`，高 6px，圆角 `--radius-sm`。
- 四个分项统计用 `--font-display` 的数字 + `--text-sm` 标签，**水平排列**，不用卡片包裹。
- 「需要关注」列表项：左侧 2px 状态色竖线 + 内容 + 右侧操作。
- `total = 0` 时完成率显示 `—`（AC-2.3）。
- 数据不可信时（`dataReliable = false`），标题下方显示一行 `--text-subtle` 的说明：「数据可能不是最新，最后更新 20:31」。

### 5.2 遗忘词分析（`/forget`）

```text
遗忘词分析
最近 7 天 · 共 42 词 · 近似统计

[今日] [7 天] [30 天] [顽固词]

─────────────────────────────────────────────
affect      effect      adapt       adopt
遗忘        遗忘        遗忘         遗忘
学习 12 次   学习 8 次   学习 15 次   学习 6 次
拼写相似 ────────────────────────
```

要点：

- 时间范围用下划线式 Tabs。
- 「近似统计」必须显式展示，并附 Tooltip 解释口径（AC-3.2）。
- 按遗忘原因分组时，组标题用 `--font-display` + `--text-lg`，组内用网格。
- **禁止**把每个词做成独立卡片；用细线分隔的网格。

### 5.3 易混词诊断（`/confusion`）

```text
易混词诊断

adapt / adopt / adept                      [加入云词本]
形近 · 编辑距离 1 · 基于你的 8614 个已知词

─────────────────────────────────────────────
adapt    适应、改编          v.
  She adapted quickly to the new environment.
adopt    采用、收养          v.
  The company adopted a new policy.
adept    熟练的              adj.
  He is adept at solving puzzles.

别再混
adapt 强调「改变自己以适应」，adopt 强调「拿来为己用」。
```

要点：

- 单词对比用表格布局：单词（`--font-display`，`--text-md`）+ 释义 + 例句。
- 单词之间的差异字母用 `--color-forget` + 加粗标注（如 a**d**apt / a**d**opt）。
- 「别再混」提示用左侧 2px 竖线 + `--color-accent-bg` 背景。
- 顶部必须展示计算范围（AC-4.3）。

### 5.4 AI 问词（`/ask`）

```text
问词

┌─────────────────────────────────────────────────┐
│  affect 和 effect 怎么区分？                     │
│                                          [发送]  │
└─────────────────────────────────────────────────┘

─────────────────────────────────────────────
affect 是动词，effect 通常是名词。

  affect  →  影响（动词）   The weather affects my mood.
  effect  →  结果（名词）   The effect was immediate.

你在 9 月 12 日和 9 月 18 日都遗忘过 affect，
学习次数 12 次。建议重点区分词性。
```

要点：

- 单列窄版布局（最大宽 720px），居中。
- AI 回答流式输出，光标用 2px 竖线闪烁。
- 引用用户学习数据时，用 `--text-subtle` 弱化显示，与 AI 的推断区分开（原则：推测需标注）。
- 底部展示「本次回答基于你的学习数据」之类说明。

### 5.5 学习词云（`/wordcloud`）

```text
学习词云

[难度] [进度] [结构]        时间：[今日] [7天] [30天] [全部]

字号 = 遗忘强度   颜色 = 词状态
　　　　　　　■ 遗忘　■ 模糊　■ 熟悉　■ 顽固

┌─────────────────────────────────────────────┐
│     affect          effect                   │
│  adapt      ADOPT        adept               │
│        principle                             │
│    stationary   stationery                   │
└─────────────────────────────────────────────┘

基于最近 30 天的学习记录，共 762 词，显示权重最高的 200 个
```

要点：

- 视角切换用下划线式 Tabs，切换**保留**时间范围（AC-16.3）。
- 图例必须随视角变化（AC-16.2）。
- 底部固定展示数据范围说明（AC-16.1）。
- 单词使用 `--font-display`，字号按权重映射，颜色用状态色。
- 结构视角下按分组聚集，分组标签用 `--text-sm` + `--text-muted`。

### 5.6 其余页面

其余页面遵循同一模式：

```text
页面标题                         [主操作]
副标题 / 筛选条件（弱化）

──────────────────────────────────────
内容区
```

| 页面 | 结构要点 |
| --- | --- |
| `/connect` | 单列窄版；Token 输入 + 状态卡片 + 权限开关列表 |
| `/content` | 左侧任务列表，右侧详情；批量任务展示进度条 + 剩余配额 |
| `/notepads` | 左侧词本列表，右侧内容；词表用表格 |
| `/extract` | 上方文本输入（等宽字体），下方候选词表（可勾选编辑） |
| `/plan` | 指标行 + 压力图 + 建议列表（建议必须带数据依据） |
| `/review` | 单列窄版，类似文章排版；数据指标嵌在文中 |
| `/reports` | 趋势图为主；顶部展示数据完整度 |
| `/settings` | 分组表单；权限开关默认关闭，需明确提示影响 |

---

## 6. 交互规范

### 6.1 四种状态（每个数据页面必须实现）

| 状态 | 表现 |
| --- | --- |
| **加载中** | 骨架屏，形状与最终内容一致；**禁止**居中转圈 |
| **空数据** | 说明这个页面能做什么 + 一个明确的下一步操作；**禁止**只放一句「暂无数据」 |
| **降级** | 展示缓存数据 + 顶部一行 `--text-subtle` 说明「数据可能不是最新，最后更新 HH:mm」 |
| **错误** | 说明发生了什么 + 可执行的补救（重试按钮 / 检查 Token 链接） |

### 6.2 反馈

- 主操作成功后用 Toast（`--duration-normal`），不弹 Modal。
- 破坏性操作（删除、覆盖词本）需二次确认，确认文案写明后果。
- 长任务（批量生成）立即返回任务 ID 并跳转任务详情，不阻塞界面。
- 分页/加载更多：用「加载更多」按钮，不做无限滚动（便于定位）。

### 6.3 无障碍（WCAG AA）

| 要求 | 实现 |
| --- | --- |
| 对比度 | 正文 ≥ 4.5:1；`--text-subtle` 仅用于非关键信息 |
| 焦点可见 | 所有可交互元素必须有 2px `--color-focus` 外环，**禁止** `outline: none` 不补替代 |
| 键盘可达 | 全部功能可仅用键盘完成；Tab 顺序符合视觉顺序 |
| 语义标签 | 使用正确的 `button` / `a` / `label`；图标按钮必须有 `aria-label` |
| 表单 | 每个输入必须有 `<label>`；错误信息与输入用 `aria-describedby` 关联 |
| 动效 | 尊重 `prefers-reduced-motion` |
| 颜色不唯一 | 状态不能只靠颜色区分，必须同时有文字标签（如「遗忘」二字） |
| 缩放下限 | 页面在 200% 缩放下不出现横向滚动 |

---

## 7. 响应式

| 断点 | 布局变化 |
| --- | --- |
| `< 768px` | 侧边导航收为底部标签栏或抽屉；内容单列；表格转卡片式列表 |
| `768–1279px` | 侧边导航保留 200px；内容 8 列 |
| `≥ 1280px` | 标准布局，内容最大 1200px |

**禁止**在移动端隐藏关键功能（skill 明确要求）。移动端可简化呈现方式，但功能必须可达。

---

## 8. 实施清单

产出界面时的检查项：

- [ ] 所有颜色、字号、间距来自 token，无硬编码字面值
- [ ] 无渐变、无大于 4px 的圆角、无卡片套卡片
- [ ] 每个数据页面实现了「加载 / 空 / 降级 / 错误」四态
- [ ] 深色模式独立验证，不是简单反转
- [ ] 对比度达标（用 DevTools 核对关键组合）
- [ ] 焦点环可见，键盘可完成全部操作
- [ ] 数字使用 `tabular-nums`
- [ ] 动效尊重 `prefers-reduced-motion`
- [ ] 状态不只靠颜色区分
- [ ] 移动端无功能缺失

---

## 9. 与开发文档的关系

- 技术实现、API 端点、数据模型见 `docs/development-guide.md`。
- 功能需求与验收标准见 `docs/Maimemo-AI-Study-Copilot-PRD.md`。
- 本文档只负责**视觉与交互**规格；发生冲突时，功能行为以 PRD 为准，视觉呈现以本文档为准。
