# Skills

This app supports Agent Skills as a lightweight, file-based way to extend the assistant with specialized workflows.

## Directory layout

Installed skills live under the app-level `skills/` directory:

```
skills/
  <skill-name>/
    SKILL.md
    scripts/
    references/
    assets/
```

`SKILL.md` must include YAML frontmatter with `name` and `description`, and the skill directory name must match the `name`.

## Loading skills

Use the `load_skill` tool to install a skill from a URL or local path. Remote archives are supported (`.zip`, `.tar`, `.tar.gz`, `.tgz`):

```
load_skill({
  "source": "https://example.com/my-skill/SKILL.md",
  "activate": true
})
```

If `activate` is `true`, the skill is added to the current chat. If the same skill name is already installed, set `allowOverwrite` to replace it.
For local paths, relative paths resolve against the current chat workspace when available.
Archives must contain exactly one `SKILL.md` (at root or inside a single skill folder).
Archive extraction relies on system `tar`/`unzip` availability.

## Import from folders

In the Settings UI, you can add one or more folders. The app scans subfolders **recursively** for `SKILL.md` and installs each skill found (stopping at any folder containing `SKILL.md`). Each discovered skill is copied into the app-level `skills/` directory.
On app start, the app re-scans each configured folder to pick up new or updated skills. Rescans overwrite previously installed skills when the source path matches, so repeated scans do not create duplicates.

If a skill name conflicts with an existing one, the installed name is rewritten to include the folder name, using hyphens only (for example: `pdf-processing-myskills`). The `@` character is not allowed by the skills spec.

To support rescan deduplication, each installed skill includes a `.skill-source.json` file that records its original source path.

## Unloading skills

Use `unload_skill` to remove a loaded skill from the current chat:

```
unload_skill({
  "name": "pdf-processing"
})
```

## Prompt injection

On each request, the system prompt includes a `## Skills` section:

- **Available Skills**: all installed skill names and descriptions
- **Loaded Skills**: full `SKILL.md` content for skills loaded into the chat

When multiple skills are loaded, the most recently loaded skill takes precedence.

## Reading skill references

`SKILL.md` may refer to other files (for example `references/REFERENCE.md`). Use the `read_skill_file` tool to access those files:

```
read_skill_file({
  "name": "pdf-processing",
  "path": "references/REFERENCE.md"
})
```
