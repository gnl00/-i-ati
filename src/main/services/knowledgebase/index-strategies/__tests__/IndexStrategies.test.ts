import { describe, expect, it } from 'vitest'
import { resolveIndexStrategy } from '..'

const baseFile = {
  folderPath: '/workspace/docs',
  filePath: '/workspace/docs/example.txt',
  fileName: 'example.txt',
  ext: '.txt',
  size: 128,
  mtimeMs: 1
}

describe('knowledgebase index strategies', () => {
  it('resolves html and xml files to HTMLIndexStrategy', () => {
    const htmlStrategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/page.html',
      fileName: 'page.html',
      ext: '.html'
    })
    const xmlStrategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/page.xml',
      fileName: 'page.xml',
      ext: '.xml'
    })

    expect(htmlStrategy.name).toBe('html')
    expect(xmlStrategy.name).toBe('html')
  })

  it('resolves markdown files to MDIndexStrategy', () => {
    const strategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/readme.md',
      fileName: 'readme.md',
      ext: '.md'
    })

    expect(strategy.name).toBe('markdown')
  })

  it('falls back to DefaultIndexStrategy for other file types', () => {
    const strategy = resolveIndexStrategy(baseFile)

    expect(strategy.name).toBe('default')
  })

  it('cleans markup noise in html strategy output', () => {
    const strategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/docker.html',
      fileName: 'docker.html',
      ext: '.html'
    })

    const prepared = strategy.prepare({
      file: {
        ...baseFile,
        filePath: '/workspace/docs/docker.html',
        fileName: 'docker.html',
        ext: '.html'
      },
      rawText: '<html><head><script>noise()</script></head><body><h1>分布式锁</h1><p>Redis 方案</p></body></html>',
      chunkSize: 200,
      chunkOverlap: 20
    })

    expect(prepared.strategyName).toBe('html')
    expect(prepared.normalizedText).toContain('分布式锁')
    expect(prepared.normalizedText).toContain('Redis 方案')
    expect(prepared.normalizedText).not.toContain('noise()')
    expect(prepared.sharedMetadata.strategy).toBe('html')
    expect(prepared.chunks.length).toBeGreaterThan(0)
  })

  it('preserves markdown content while stripping frontmatter and link syntax', () => {
    const strategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/redis-lock.md',
      fileName: 'redis-lock.md',
      ext: '.md'
    })

    const prepared = strategy.prepare({
      file: {
        ...baseFile,
        filePath: '/workspace/docs/redis-lock.md',
        fileName: 'redis-lock.md',
        ext: '.md'
      },
      rawText: [
        '---',
        'title: Distributed Lock',
        '---',
        '# 分布式锁',
        '查看 [Redis 文档](https://redis.io)',
        '![diagram](./diagram.png)',
        '> 需要 fencing token'
      ].join('\n'),
      chunkSize: 200,
      chunkOverlap: 20
    })

    expect(prepared.strategyName).toBe('markdown')
    expect(prepared.normalizedText).toContain('分布式锁')
    expect(prepared.normalizedText).toContain('查看 Redis 文档')
    expect(prepared.normalizedText).toContain('需要 fencing token')
    expect(prepared.normalizedText).not.toContain('title: Distributed Lock')
    expect(prepared.normalizedText).not.toContain('[Redis 文档]')
    expect(prepared.sharedMetadata.strategy).toBe('markdown')
    expect(prepared.chunks[0]?.text).toContain('# 分布式锁')
  })

  it('chunks markdown by heading hierarchy and repeats heading path in long sections', () => {
    const strategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/spring-bean.md',
      fileName: 'spring-bean.md',
      ext: '.md'
    })

    const prepared = strategy.prepare({
      file: {
        ...baseFile,
        filePath: '/workspace/docs/spring-bean.md',
        fileName: 'spring-bean.md',
        ext: '.md'
      },
      rawText: [
        '# Spring',
        '## Bean 生命周期',
        'BeanDefinition 加载阶段会先解析配置来源，并把元数据注册到容器中。',
        '',
        '实例化阶段负责创建对象，并为后续依赖注入和初始化做好准备。',
        '',
        '初始化阶段会执行 aware、postProcessBeforeInitialization、init-method 和 postProcessAfterInitialization。',
        '',
        '销毁阶段会在容器关闭时释放资源并执行 destroy 回调。'
      ].join('\n'),
      chunkSize: 150,
      chunkOverlap: 70
    })

    expect(prepared.chunks.length).toBeGreaterThan(1)
    expect(prepared.chunks[0]?.text).toContain('# Spring')
    expect(prepared.chunks[0]?.text).toContain('## Bean 生命周期')
    expect(prepared.chunks[1]?.text).toContain('# Spring')
    expect(prepared.chunks[1]?.text).toContain('## Bean 生命周期')
    expect(prepared.chunks[1]?.text).toContain('初始化阶段')
    expect(prepared.chunks[1]?.text).toContain('销毁阶段')
  })

  it('preserves fenced code blocks inside markdown sections', () => {
    const strategy = resolveIndexStrategy({
      ...baseFile,
      filePath: '/workspace/docs/redis-code.md',
      fileName: 'redis-code.md',
      ext: '.md'
    })

    const prepared = strategy.prepare({
      file: {
        ...baseFile,
        filePath: '/workspace/docs/redis-code.md',
        fileName: 'redis-code.md',
        ext: '.md'
      },
      rawText: [
        '# Redis',
        '## 分布式锁',
        '下面是一个 Lua 释放锁脚本：',
        '',
        '```lua',
        "if redis.call('get', KEYS[1]) == ARGV[1] then",
        "  return redis.call('del', KEYS[1])",
        'end',
        'return 0',
        '```'
      ].join('\n'),
      chunkSize: 220,
      chunkOverlap: 40
    })

    expect(prepared.normalizedText).toContain('```lua')
    expect(prepared.normalizedText).toContain("redis.call('del', KEYS[1])")
    expect(prepared.chunks[0]?.text).toContain('## 分布式锁')
    expect(prepared.chunks[0]?.text).toContain('```lua')
  })
})
