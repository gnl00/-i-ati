# ADR-0045: On-demand skill instructions and workspace script commands

**Status:** Accepted<br>
**Date:** 2026-10-15<br>
**Related:** [Skills](../integrations/skills.md), [Tool results](../specs/tools/tool-result-normalization.md), [Efficiency investigation](../work/investigations/2026-10-15-ati-piagent-task-efficiency.md)

## Context

`load_skill` already reads `SKILL.md`, but discards the body and returns activation
status. A second `read_skill_file` call is needed to obtain the instructions.
Manual selection should remain a name/path hint that the model may choose to use.

`run_skill_script` directly executes non-TypeScript files and fixes cwd to the
installation root. Non-executable `.mjs` files fail, while relative task paths and
generated files can resolve inside shared or read-only installation directories.

## Decision

- Return `content` and `skill_root` from `load_skill`, including already-active
  skills. Validate/read before adding activation. Keep persistent activation
  idempotent and manual `/sk:` behavior unchanged.
- Hidden skills context contains active names and paths only. Use relevant skills;
  load instructions when absent and reuse content already in context. Additional
  files and missing-content recovery remain available through `read_skill_file`.
- Use existing stable tool-result normalization/history for instruction bodies,
  including oversized-content artifacts. Do not inject a second body into hidden
  context or introduce a separate read-state registry.
- Require `name`, relative `script`, and full shell `command` for
  `run_skill_script`. Retire the old `args` contract. The model selects the
  interpreter and includes arguments in `command`.
- Validate the script's canonical path inside its resolved skill root. Keep files
  installed in place; supply authoritative `SKILL_ROOT` and `SKILL_SCRIPT`
  environment variables. Do not infer an interpreter or copy scripts to temp.
- Delegate to existing command execution with the runtime chat UUID. Default cwd
  is the task workspace; accept absolute or workspace-relative `cwd` overrides.
  Skills that require their root as cwd specify it explicitly.
- Preserve trusted metadata approval, cancellation, timeout, streamed output and
  bounded command-result model views. A model-supplied `confirmed` argument is
  not approval. POSIX commands use `$SKILL_SCRIPT`; Windows cmd uses `%SKILL_SCRIPT%`.

## Consequences and verification

Instruction loading normally saves one tool call without increasing the required
skill body. Manual activation does not automatically force body loading or use.
Previously recorded script calls remain historical facts; new calls must provide
`command`. Skill-root-relative resource access must use the script location,
`SKILL_ROOT`, or an explicit cwd. No database migration, new runtime dependency,
new shell implementation or temporary installation copy is introduced.

Processor tests cover instruction read failure, already-active loading, canonical
paths, authoritative variables, command validation and trusted approval forwarding.
Real subprocess tests cover non-executable scripts and paths containing spaces,
workspace-relative inputs/outputs, explicit cwd, nonzero exits, timeout and cancel.
Runtime continuation tests verify instructions arrive in the tool result while
hidden context stays metadata-only. Prompt tests retain the existing size budget.
Electron acceptance and full-suite results are recorded in the linked investigation.
