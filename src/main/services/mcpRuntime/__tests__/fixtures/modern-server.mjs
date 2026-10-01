import { createInterface } from 'node:readline'

createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  const result = request.method === 'server/discover'
    ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } }
    : request.method === 'tools/list'
      ? { tools: [{ name: 'echo', inputSchema: { type: 'object' } }], ttlMs: 0, cacheScope: 'private' }
      : { content: [{ type: 'text', text: JSON.stringify(request.params.arguments) }] }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { resultType: 'complete', ...result } })}\n`)
})
