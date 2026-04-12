/**
 * ModelResponseStream
 *
 * 放置内容：
 * - `next` runtime 在 model execution 和 parser 之间使用的规范化响应流 contract
 *
 * 业务逻辑边界：
 * - 它只表达“按顺序产出 `ModelResponseChunk`”
 * - 它不规定底层 provider / SDK / transport 的具体实现
 */
import type { ModelResponseChunk } from './ModelResponseChunk'

export interface ModelResponseStream extends AsyncIterable<ModelResponseChunk> {}
