# File Edit Tool Optimization

阶段性总结，记录 `fileOperations.edit` 在 2026-05-01 的可靠性优化。

## 背景

一次 Markdown 标题替换失败暴露了精确匹配的诊断短板：

```markdown
# Agent Genesis — 生存系统
# Agent Genesis － 生存系统
```

两行视觉接近，实际字符分别是：

- `—`: `U+2014` EM DASH
- `－`: `U+FF0D` FULLWIDTH HYPHEN-MINUS

旧实现只返回 `success: true` 和 `replacements: 0`，调用方只能知道精确匹配命中数为 0。缺少行号、相似候选和码点差异，模型需要再次读取文件才能定位问题。

## 参考经验

Anthropic text editor tool 的关键经验：

- `view` 返回带行号内容，后续编辑具备稳定锚点。
- `str_replace` 以 exact match 为基础。
- 单次替换以唯一命中为成功条件。
- `insert_line` 处理位置插入场景，减少大段文本替换。
- 工具结果提供可恢复错误信息，让模型能立刻修正下一次调用。

参考文档：

- <https://platform.claude.com/docs/en/agents-and-tools/tool-use/text-editor-tool>

## 本次实现

保留现有 `edit` 工具入口，增强默认行为和返回结构：

- 默认 `all=false` 时要求唯一命中。
- `all=true` 继续支持批量替换。
- `dry_run=true` 返回匹配结果，跳过文件写入。
- `expected_replacements` 提供精确替换数量保护。
- `start_line` / `end_line` 限定匹配范围。
- `max_diagnostics` 控制诊断候选数量，默认 5，最高 20。

涉及文件：

- `src/shared/tools/fileOperations/definitions.ts`
- `src/shared/tools/fileOperations/index.d.ts`
- `src/main/tools/fileOperations/FileOperationsProcessor.ts`
- `src/main/tools/fileOperations/__tests__/FileOperationsProcessor.test.ts`

## 返回语义

`EditFileResponse.status` 新增这些稳定状态：

- `replaced`: 已写入文件。
- `dry_run`: 预检成功，文件保持原样。
- `no_match`: 精确匹配命中数为 0。
- `multiple_matches`: 单次替换发现多个命中。
- `match_count_mismatch`: `expected_replacements` 和实际命中数不同。

典型 no-match 诊断：

```json
{
  "success": false,
  "status": "no_match",
  "replacements": 0,
  "diagnostics": {
    "message": "No exact match found.",
    "nearest_matches": [
      {
        "line": 1,
        "column": 1,
        "score": 1,
        "content": "# Agent Genesis － 生存系统",
        "normalized_match": "dash_equivalent",
        "differences": [
          {
            "index": 16,
            "expected": "—",
            "expected_codepoint": "U+2014",
            "actual": "－",
            "actual_codepoint": "U+FF0D"
          }
        ]
      }
    ]
  }
}
```

## 诊断策略

当精确匹配失败时，处理器会从 `search` 中抽取非空行，与目标文件的候选行比较：

- NFKC 归一化匹配：标记为 `nfkc`
- dash 字符族归一化匹配：标记为 `dash_equivalent`
- 空白归一化匹配：标记为 `whitespace_flexible`
- Levenshtein 相似度达到阈值：作为 nearest match 返回

返回候选包含：

- `line` 和 `column`
- 当前行 `content`
- 归一化匹配类型
- 字符级差异与 Unicode code point

## 安全边界

默认单次替换的行为从“替换第一个命中”升级为“唯一命中才写入”。这个策略减少了大段文本误伤：

- 多个命中时返回候选位置。
- 需要批量替换时显式传 `all=true`。
- 高风险批量替换建议同时传 `expected_replacements`。
- 需要缩小范围时传 `start_line` 和 `end_line`。
- 调试和预览时传 `dry_run=true`。

## 测试覆盖

新增测试覆盖：

- 唯一 exact match 写入成功。
- `—` 和 `－` 的 Unicode 差异诊断。
- 单次替换遇到多命中时返回位置，文件保持原样。
- `all=true` 批量替换。
- `dry_run` 预检。
- `start_line` / `end_line` 范围限定。
- `expected_replacements` 数量保护。

验证命令：

```bash
pnpm exec vitest run src/main/tools/fileOperations/__tests__/FileOperationsProcessor.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
git diff --check
```

阶段验证结果：

- `FileOperationsProcessor.test.ts`: 14 passed
- `typecheck:node`: passed
- `typecheck:web`: passed
- `git diff --check`: passed

ESLint 阶段遇到本地配置依赖缺失：

```text
ESLint couldn't find the config "@electron-toolkit/eslint-config-prettier"
```

## 后续演进

可以继续把 Claude-style text editor 形态抽成聚合工具：

```ts
type TextEditorCommand =
  | { command: 'view'; path: string; view_range?: [number, number]; max_characters?: number }
  | { command: 'str_replace'; path: string; old_str: string; new_str: string }
  | { command: 'create'; path: string; file_text: string }
  | { command: 'insert'; path: string; insert_line: number; insert_text: string }
```

优先级建议：

1. 给 `read` 增加 `include_line_numbers`，让模型拿到稳定行号。
2. 新增 `insert` 命令，用行号处理插入类编辑。
3. 新增 `text_editor` 聚合工具，复用现有 `read/write/edit` processor 能力。
4. 对大文件诊断增加窗口化扫描，控制 CPU 和返回体大小。
