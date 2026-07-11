# Settings Design Language

## Goal

Unify the visual language under `src/renderer/src/features/settings` while preserving the current settings workflows. The settings area should feel like a compact desktop control surface: dense, calm, operational, and consistent across tools, memory, knowledge base, MCP servers, skills, plugins, providers, and data logs.

## Current State

Settings pages used several local visual patterns before this normalization pass:

- Tools, Knowledge Base, and Data & Log use stacked section cards.
- Memory, Skills, and Plugins use a shared page shell with header/toolbar/list composition and no extra duplicated root surface.
- MCP Servers keeps its drawer workflow while using the resource-list two-card layout: a compact header/status card for page explanation and low-noise runtime summary above an internal scrolling list/editor card whose toolbar owns the mode tabs and current-mode actions. Server items use flat full-width resource rows with soft separators, compact metadata, status, and right-aligned actions.
- Providers uses a master-detail workspace with a provider list, configuration detail panel, and model list region.

The main remaining inconsistency is local styling inside provider-specific detail panels and any feature-specific advanced editor surfaces.

## Target Templates

### Section Stack

Use this template for pages made of independent settings blocks:

- Tools
- Knowledge Base
- Data & Log

Each block should use a `SettingsSection` with a `SettingsSectionHeader`. Optional controls sit in a footer/action bar with a subtle tinted background and top border.

### Resource List

Use this template for pages centered on a collection:

- Memory
- Skills
- Plugins
- MCP Servers

The page should use `SettingsPageShell`, followed by a header, toolbar/filter rows, and a `SettingsList` or equivalent internal scrolling region. Rows use the same density, hover, border, and text hierarchy. Parent tabs that host resource-list content should expose the same shell boundary and loading states.
The resource-list template can also split content into two stacked cards when needed: an upper card for title/description and lightweight status, and a lower card for mode tabs, mode-specific actions, list content, editor content, and internal scrolling. MCP Servers uses this split: the upper card footer hosts compact status chips such as connected servers, available tools, and registry cache state. The lower card toolbar hosts the installed/registry tab switcher on the left and active-mode controls on the right: local clipboard import plus JSON toggle for installed servers, or registry search for discovery. The body hosts installed rows, registry rows, loading/empty states, infinite-scroll sentinel, and the JSON editor. MCP Server rows follow the Memory/Skills density: name and `@name` lead the row, description/config/runtime errors stay in the text column, runtime status and Added state lead the row meta line beside connection type/tool count/version, and right-aligned actions stay limited to install/copy/remove with compact row action sizing. Registry install buttons use a low-saturation ghost action style that gains emphasis on hover.

### Master Detail

Use this template for pages that need two-pane editing:

- Providers

The provider workflow should keep its sidebar/detail structure. Shared settings primitives should only normalize outer shell, density, headings, rows, controls, and empty states.

## Shared Rules

- Page shell: `w-full h-full min-h-0 overflow-hidden` for the outer wrapper.
- Default shell (`scrollable=false`) keeps an inner column flex layout (`flex flex-col min-h-0`) so list regions with `flex-1` (such as `SettingsList`) can consume remaining height.
- Section-stack shell (`scrollable=true`) must not default to `flex flex-col`. It keeps normal block flow and enables shell-level `overflow-y-auto` so cards keep natural height and are not shrink-flexed.
- Both modes should consume available space from the nearest settings container (for example a popover that sets `w-[95vw] h-[93vh]`).
- Settings panel frame: title, save state, tab bar, and active tab content share one neutral outer frame so the page reads as a single settings workspace.
- Content surfaces live inside the settings frame as internal structure. Keep sibling outer cards for separate workflows outside the main settings panel.
- Surfaces: white or dark gray, `rounded-xl`, subtle border, `shadow-xs`.
- Header title: `text-[13.5px] font-semibold tracking-tight`.
- Header description: `text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed`.
- Toolbar labels: `text-[11px] font-medium uppercase tracking-wider`.
- List rows: `px-4 py-3.5 border-b hover:bg-white/70 dark:hover:bg-gray-800/40`.
- Primary actions: compact, dark/light inverse, `h-7 px-3`.
- Secondary actions: compact ghost/outline, `h-7 px-2.5` or `h-8` for search/toolbars.
- Icon actions: fixed square size, stable hover state, accessible label/title.
- Empty states: centered icon tile, one title line, one supporting line.

## Taste Decisions

- The main settings panel should feel like one connected control workspace. Header, save state, tabs, and tab content share the same outer boundary.
- Providers keep the product's established active selection treatment: blue horizontal gradient, bottom blue accent line, provider icon scale feedback, and expressive delete-hover motion.
- Settings normalization should preserve proven feature-specific active-state semantics while aligning surrounding shell, density, typography, inputs, and buttons.

## Shared Primitives

- `SettingsPageShell`: adaptive settings viewport with optional scroll behavior.
- For `scrollable=false` pages (resource-list templates), shell content applies `flex flex-col min-h-0` so inner list areas with `flex-1` keep a valid height and scroll when needed.
- For `scrollable=true` pages (section-stack templates), shell content stays in normal block flow and enables shell-level vertical scrolling so cards preserve full content height.
- `SettingsSurface`: full-height panel for resource-list pages.
- `SettingsMasterDetail`: compact two-pane settings workspace for sidebar/detail workflows.
- `SettingsSidePanel`: fixed-width sidebar panel for master-detail navigation lists.
- `SettingsDetailPanel`: flexible detail surface for the selected entity.
- `SettingsSection`: standalone card for section-stack pages.
- `SettingsSectionHeader`: compact title, badges, description, and right-side actions.
- `SettingsToolbar`: subtle footer or toolbar row with top border.
- `SettingsFieldRow`: left-side label/description with right-side control.
- `SettingsControlGroup`: stable bordered control container for inputs, selects, units, and inline buttons.
- `SettingsCollapsibleArea`: switch-driven expandable settings region with grid-row transition.
- `SettingsMetricGrid` and `SettingsMetricItem`: compact status metrics for runtime or configuration summaries.
- `SettingsNotice`: low-height contextual status text for draft state, runtime warnings, and operational hints.
- `SettingsSubsectionHeader`: internal grouping header for resource-list surfaces with multiple collections.
- `SettingsLoadingState`: compact loading state with the same icon tile and text density as empty states.
- `SettingsList` and `SettingsListItem`: collection layout with shared row density and hover state.
- `SettingsEmptyState`: centered empty state pattern for resource-list pages.

## Implementation Plan

1. Add settings-only layout primitives in `src/renderer/src/features/settings/common/SettingsLayout.tsx`.
2. Migrate Memory and Skills first to validate the resource-list template.
3. Migrate Data & Log to validate the section-stack template.
4. Migrate Tools to validate field rows, control groups, and switch-driven expandable regions.
5. Migrate Knowledge Base outer status, Recall Test, source list, and index parameter sections to validate metrics, notices, search, and result lists.
6. Migrate Plugins to the resource-list template with `SettingsSubsectionHeader` for installed and remote collections.
7. Migrate MCP Servers drawer and tab content to the resource-list two-card template with shared toolbar, empty/loading, button, tab, card, and editor-region language.
8. Migrate Providers to the master-detail template with shared side/detail panels, input styles, buttons, scrollbars, and empty states.
9. Keep changes behavior-preserving unless the current component has an existing layout defect.

## `.impeccable.md`

Settings design language is a cross-component design constraint, so the repository-level design context should include it. Keep detailed implementation rules in this document and keep `.impeccable.md` focused on durable product and visual principles.
