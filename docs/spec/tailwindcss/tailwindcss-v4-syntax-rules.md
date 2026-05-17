# Tailwind CSS v4 Syntax Rules

### Config
```css
@theme {
  --color-brand: oklch(70% 0.2 250);
  --radius-lg: 1rem;
}
```

### Custom utilities
```css
@utility tab-4 {
  tab-size: 4;
}
```

### Key differences from v3

| Scenario | v3 | v4 |
|---|---|---|
| Variable in arbitrary value | `bg-[--color]` | `bg-(--color)` |
| Grid arbitrary value spacing | `grid-cols-[1fr,auto]` | `grid-cols-[1fr_auto]` |
| Important modifier | `!flex` | `flex!` |
| Prefix position | `tw:flex` | `tw:flex` (same) |
| Variant stacking order | `first:*:pt-0` | `*:first:pt-0` |
| Reset transforms | `transform-none` | `scale-none` / `rotate-none` / `translate-none` |

### Removed
- `@tailwind base/components/utilities` → use `@import "tailwindcss"`
- `bg-opacity-*`, `text-opacity-*` → use `bg-black/50` syntax
- `flex-shrink-*`, `flex-grow-*` → `shrink-*`, `grow-*`
- `overflow-ellipsis` → `text-ellipsis`

### Renamed
| v3 | v4 |
|---|---|
| `shadow` | `shadow-sm` |
| `shadow-sm` | `shadow-xs` |
| `blur` | `blur-sm` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` | `ring-3` |

### Preflight defaults changed
- Border default: `currentColor` (was `gray-200`)
- Ring default: `1px` + `currentColor` (was `3px` + `blue-500`)
- Placeholder: `currentColor` at 50% opacity (was `gray-400`)
- Button cursor: `default` (was `pointer`)

### theme() function
Use CSS variables instead: `background-color: var(--color-red-500)` instead of `background-color: theme(colors.red.500)`

### No Sass/Less/Stylus
Use plain CSS only. Tailwind v4 is not designed for CSS preprocessors.