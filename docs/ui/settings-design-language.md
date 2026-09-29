# Settings Design Language

## Goal

Unify the visual language under `src/renderer/src/features/settings` while preserving the current settings workflows. The settings area should feel like a compact desktop control surface: dense, calm, operational, and consistent across tools, memory, knowledge base, MCP servers, skills, plugins, providers, and data logs.

## Current State

Settings pages used several local visual patterns before this normalization pass:

- Tools and Data & Log use stacked section cards. Knowledge Base uses two compact flat sections: source management and recall testing with collapsed advanced settings.
- Memory, Skills, and Plugins use a shared page shell with header/toolbar/list composition and no extra duplicated root surface.
- MCP Servers keeps its drawer workflow while using the resource-list two-card layout: a compact header/status card for page explanation and low-noise runtime summary above an internal scrolling list/editor card whose toolbar owns the mode tabs and current-mode actions. Server items use flat full-width resource rows with soft separators, compact metadata, status, and right-aligned actions.
- Providers uses a master-detail workspace with a provider list, configuration detail panel, and model list region.

Provider-specific detail panels and advanced editor surfaces share the same dark material ladder as the settings frame. Feature-specific semantic tones remain local to their workflows.

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
- Panel header uses two compact rows: `Settings` on the left and save status plus a fixed-height Save button on the right, followed by the category tabs. Omit branding, version, subtitle, save-group surface, and vertical divider. Dirty state uses a static amber dot; the disabled Save button uses an inset surface and muted text. Title, tabs, and content shells share a 4px outer inset. Tabs retain their labels and icons with subtle borders and no active shadow.
- Content surfaces live inside the settings frame as internal structure. Keep sibling outer cards for separate workflows outside the main settings panel.
- Dark surfaces use the app semantic graphite tokens: popover canvas (`--app-canvas`), settings frame (`--app-surface`), content panels (`--app-surface-raised`), row hover (`--app-surface-hover`), and form/list inset (`--app-surface-inset`). Borders and text use the matching app semantic tokens.
- Shared model selectors expose an explicit settings variant. Settings triggers read as raised selects; Model Routing pairs use transparent layout groups so the selector and clear button own the enclosure. Their popovers use the raised graphite surface, inset search controls, quiet sticky provider headers, and compact current/keyboard selection states. Drawer and chat selector variants keep their own established material and interaction language.
- Light surfaces remain white or light gray, `rounded-xl`, with a subtle border and `shadow-xs`.
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
- Provider connection tests show success as an emerald check in the Test button, with the responding model in its tooltip and accessible status. Retesting or changing the account/provider configuration clears the result; failures retain error toasts.
- Providers keep a low-amplitude blue selection rail and tint, provider icon scale feedback, and expressive delete-hover motion.
- Dark depth comes from small luminance steps. Settings surfaces use quiet borders and restrained shadows; inputs and search controls read as inset regions.
- Provider model collections use separators between rows. Enabled, save, test, reset, delete, warning, and danger states retain their semantic weight.
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
5. Knowledge Base follows the source-first layout described below, reusing settings controls, notices, search, and section surfaces.
6. Migrate Plugins to the resource-list template with `SettingsSubsectionHeader` for installed and remote collections.
7. Migrate MCP Servers drawer and tab content to the resource-list two-card template with shared toolbar, empty/loading, button, tab, card, and editor-region language.
8. Migrate Providers to the master-detail template with shared side/detail panels, input styles, buttons, scrollbars, and empty states.
9. Keep changes behavior-preserving unless the current component has an existing layout defect.

## `.impeccable.md`

Settings design language is a cross-component design constraint, so the repository-level design context should include it. Keep detailed implementation rules in this document and keep `.impeccable.md` focused on durable product and visual principles.

## Knowledge Base

- Knowledge Base and Knowledge Search sit flat on the Settings surface, without outer borders, shadows, rounded corners, or independent backgrounds. Spacing and a subtle separator divide the two regions; Sources retains its inset enclosure.
- Order: compact runtime summary and a description-free Retrieval Mode row, embedded Sources, collapsed Index & Retrieval Settings, then Knowledge Search. Keep the settings shell, 13.5px headings, 12.5px field labels, compact buttons, and graphite semantic tokens.
- Runtime counts share one wrapping summary row. Status is refreshed on page load, every 1.5 seconds while indexing, and after index updates, rebuilds, and clears; no manual status refresh action is shown. Normal idle and completed status labels are omitted. Loading, indexing progress, and failures appear only when relevant; source availability remains on each source row. Base and source statuses use colored text without status dots; active indexing retains its loading indicator.
- Sources sit in an inset region within Knowledge Base, with aligned side margins, a subtle inset surface, small rounded corners, and a lower-level Sources heading. Sources are continuous rows with one folder name and one full path (truncated with a full-path tooltip). Use separators and the shared row hover surface, without individual cards or icon tiles.
- The Sources subsection heading owns Add Source (outline), Update Index (primary), and the maintenance menu. There is no separate bottom action bar. Update Index is the single incremental indexing action. Validate Sources, Rebuild Index, and Clear Index live in the keyboard-accessible maintenance menu; all indexing controls stay disabled while indexing or clearing. Index operations continue to use draft configuration.
- Recall shares the same `ExpandableSearchInput` as Skills, including click-to-expand and Escape clearing/collapse; typing triggers retrieval after a 300ms debounce, and stale requests are ignored, and an inline loading indicator. The surrounding Settings popover retains its existing Escape-to-dismiss behavior. The search control sits on the right of the Knowledge Search heading, with the shared 32px toolbar height. Recall uses saved configuration and the current built index. Unsaved drafts show a local save instruction and retain the existing search guard. The result count follows the Knowledge Search heading. Clear follows the input in the right-aligned action group and resets the query, results, and search feedback; there is no separate summary row. Clear invalidates pending retrieval and restores the initial view. No separate Search button is shown. Results show filename, path, score, and the excerpt; native Details disclosures hold similarity, chunk number, character range, token estimate, and file extension.
- Chunk Size, Chunk Overlap, and Max Results remain mounted in a native, initially collapsed Index & Retrieval Settings disclosure under Sources and above Knowledge Search. Expanded fields share the Sources inset surface and compact row spacing. Its summary uses `select-none`. Inputs keep a fixed width on focus. Retrieval Mode stays directly visible.
- The page has one outer vertical scroll region. Toolbars and fields wrap at compact widths; paths truncate, excerpts wrap, and row action hit areas remain stable. Light and Dark share the same hierarchy.

## Memory

- Long-term Memory sits flat on the Settings surface with a shared switch and one short description. Stored Memories groups its lower-level heading, count, Refresh, and continuous list in one inset region with aligned side margins, a subtle background, small rounded corners, and a fine border without shadow.
- Continuous rows lead with memory content and follow with quiet role/time metadata. Content wraps safely, clamps to two lines, and offers accessible Show more/Show less only when actually truncated. Row hover and inline delete confirmation use the existing shared controls.
- The list retains its internal scroll region so the heading and refresh remain visible. Light and Dark use the same hierarchy and shared semantic tokens.
