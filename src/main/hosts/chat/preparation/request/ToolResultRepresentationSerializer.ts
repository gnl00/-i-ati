export function serializeSemanticCompactionToolResult(compactedContent: string): string {
  let result: unknown = compactedContent

  try {
    result = JSON.parse(compactedContent)
  } catch {
    // A compactor may return provider-neutral text. Preserve it as a JSON string value.
  }

  return JSON.stringify({
    compacted: true,
    lossy: true,
    result
  })
}
