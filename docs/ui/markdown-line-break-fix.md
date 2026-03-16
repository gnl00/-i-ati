# Markdown Line Break Fix

## Issue
User-entered soft line breaks were collapsed into a single paragraph, e.g.:

Input:
```
1
2
3
4

5
```

Rendered:
```
1 2 3 4

5
```

## Root Cause
`react-markdown` follows CommonMark: single newlines inside a paragraph are treated as spaces unless an explicit hard break is inserted.

## Fix
Added a small remark plugin that transforms text nodes containing `\n` into `text` + `break` nodes, forcing hard line breaks.

Applied to all markdown renderers:
- user messages
- assistant messages (including reasoning)
- streaming markdown switch

## Files
- `src/renderer/src/components/chat/chatMessage/markdown-plugins.ts`
- `src/renderer/src/components/chat/chatMessage/user-message.tsx`
- `src/renderer/src/components/chat/chatMessage/assistant-message.tsx`
- `src/renderer/src/components/chat/chatMessage/StreamingMarkdownSwitch.tsx`
