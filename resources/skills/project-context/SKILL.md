---
name: project-context
description: Load this for repository architecture, implementation, refactoring, debugging, or code-review tasks where project-local guidance can affect ownership, file placement, conventions, or technical decisions.
---

# Project Context

Use project guidance to ground repository work before proposing changes or editing files.

## Instruction Priority

1. Apply active platform, system, developer, and explicit user instructions.
2. Locate the project root and read applicable `AGENTS.md` and `CLAUDE.md` files.
3. Within repository guidance, apply the instruction file closest to the target path for its scoped rules.
4. Treat `.ati-kb/` and `.claude/` as project knowledge sources. List available entries, then select only the resources relevant to the current operation.

## Project Knowledge Routing

| Operation | Knowledge | Path |
| --- | --- | --- |
| Add a component or UI | Component library and code style | `.ati-kb/knowledge/components.md`, `.ati-kb/rules/code-style.md` |
| Add an AI tool | Tool system | `.ati-kb/knowledge/tools.md` |
| Change a service | Service architecture | `.ati-kb/knowledge/services.md` |
| Decide file placement or naming | Naming and directory structure | `.ati-kb/rules/naming.md`, `.ati-kb/knowledge/directory.md` |
| Change preload, IPC, or events | Communication layer | `.ati-kb/knowledge/api.md` |
| Determine feature ownership | Business modules | `.ati-kb/knowledge/business.md` |
| Write a commit message | Git rules | `.ati-kb/rules/git.md` |
| Select a coding pattern | Code style | `.ati-kb/rules/code-style.md` |
| Build a broad project view when context is insufficient | Knowledge index | `.ati-kb/knowledge/index.md` |

Inspect `.claude/` after selecting the matching project concern. Read the command, rule, agent, or reference that directly informs the task.

## Reading Style

- Read one or two relevant project-knowledge files per pass.
- Expand the read set only when an evidence gap remains.
- Inspect the target module's exports, immediate callers, shared utilities, and nearby tests before editing.
- Keep decisions traceable to current code, repository guidance, and runtime evidence.

## Skip Conditions

Skip additional `.ati-kb/` and `.claude/` reads for:

- single-line fixes, typos, and small configuration adjustments
- guidance already read in the current conversation that still covers the target
- clearly scoped changes contained within one established module

Continue applying active `AGENTS.md` and `CLAUDE.md` instructions throughout the task.
