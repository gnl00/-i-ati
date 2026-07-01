# Support Segment Streaming Group Motion

## Scope

Latest streaming assistant messages can render a single groupable support item as a `supportGroup`. This gives the renderer a stable shell before the next tool or thought item arrives.

## Grouping

- `buildSupportRenderUnits(items, { groupSingletons: true })` wraps singleton tool and reasoning items in a `supportGroup`.
- The streaming mapper enables singleton grouping only for the latest streaming assistant message.
- Support groups stay bounded by layer, order adjacency, and groupable item type.
- The group key and expansion identity are anchored to the first support item, so appending later support items keeps the same shell.

## Expansion

- Groups with running, pending, errored, or streaming-tail items force expanded display.
- Completed groups longer than three items default to the compact summary row.
- User expand or collapse choice stays attached to the first support item identity while completed items append.

## Motion

- The support group renders through one stable shell for both expanded and collapsed accordion states.
- The shell uses Framer Motion layout size animation with `overflow-hidden`, so the compact summary and full detail content share the same clipped frame during the size change.
- Accordion switching changes the inner content directly. The phase wrapper is a plain keyed React wrapper, keeping opacity transitions out of the accordion-level state swap.
- Tool and thought append motion stays at the item row layer with opacity, 4px y movement, and a 0.995 scale start.
- Tool phases always render through the same mapped row path. A single tool and a multi-tool timeline share the same row component; the multi-tool state adds connector styling and aggregate metric chips.
- The shared motion transition is 200ms with ease `[0.22, 1, 0.36, 1]`.
- `useReducedMotion()` and the renderer test override switch the group to static layout rendering while preserving the same content tree.

## Visual Test Entry

Open the dev-only playground with:

```text
?testPage=support-streaming-merge
```

The page covers tool append, thought append, status change, compact summary expand/collapse, and reduced-motion rendering.
It also includes an accordion stress section where the same running/pending group auto-settles into a completed collapsed group in both normal and reduced-motion panels.
