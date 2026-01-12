# Memory Tools 测试文档

## 📋 测试概述

本文档描述了 memory_save 和 memory_retrieval 工具的测试用例。

## 🧪 测试文件

- **位置**: `src/tools/memory/__tests__/MemoryToolsProcessor.test.ts`
- **测试框架**: Vitest
- **测试数量**: 9 个测试用例
- **Mock 策略**: 使用 vi.mock 模拟 MemoryService

## 📝 测试用例列表

### processMemorySave 测试 (3个)

1. **应该成功保存带完整 metadata 的记忆**
   - 测试保存带 category、importance、tags 的记忆
   - 验证 MemoryService.addMemory 被正确调用

2. **应该成功保存不带 metadata 的记忆**
   - 测试可选参数的处理
   - 验证默认 role 为 'system'

3. **应该验证 addMemory 被正确调用**
   - 测试参数传递的正确性
   - 验证 chatId、role、content、metadata

### processMemoryRetrieval 测试 (6个)

4. **应该成功检索相关记忆**
   - 测试基本检索功能
   - 验证返回结构和 MemoryService 调用

5. **应该返回带相似度分数的记忆**
   - 测试相似度分数在 [0, 1] 范围内
   - 验证返回数据结构完整性

6. **应该遵守 topK 参数限制**
   - 测试结果数量不超过 topK
   - 验证参数传递正确

7. **应该遵守 threshold 阈值过滤**
   - 测试低相似度结果被过滤
   - 验证阈值参数生效

8. **应该在无匹配时返回空结果**
   - 测试空结果处理
   - 验证提示消息正确

9. **应该按 chatId 过滤记忆**
   - 测试 chatId 参数传递
   - 验证不同 chat 的隔离

## 🚀 运行测试

### 运行命令

```bash
# 运行所有测试
npm test

# 运行 memory 工具测试
npm test memory

# 运行特定测试文件
npm test src/tools/memory/__tests__/MemoryToolsProcessor.test.ts

# 运行测试并显示详细输出
npm test -- --reporter=verbose

# 运行测试并生成覆盖率报告
npm test -- --coverage

# 监听模式运行测试
npm test -- --watch
```

## 📊 预期结果

所有 9 个测试应该通过:

```
✓ src/tools/memory/__tests__/MemoryToolsProcessor.test.ts (9)
  ✓ MemoryToolsProcessor (9)
    ✓ processMemorySave (3)
      ✓ 应该成功保存带完整 metadata 的记忆
      ✓ 应该成功保存不带 metadata 的记忆
      ✓ 应该验证 addMemory 被正确调用
    ✓ processMemoryRetrieval (6)
      ✓ 应该成功检索相关记忆
      ✓ 应该返回带相似度分数的记忆
      ✓ 应该遵守 topK 参数限制
      ✓ 应该遵守 threshold 阈值过滤
      ✓ 应该在无匹配时返回空结果
      ✓ 应该按 chatId 过滤记忆

Test Files  1 passed (1)
Tests  9 passed (9)
```

## 🎭 Mock 策略

测试使用 `vi.mock` 模拟 MemoryService，避免依赖真实的数据库和 embedding 模型：

- **addMemory**: 模拟保存记忆，返回带 id 的记忆对象
- **searchMemories**: 模拟语义搜索，基于关键词匹配返回结果
- **deleteMemory**: 模拟删除操作
- **clear**: 模拟清空操作

这种方式使测试：
- ✅ 运行速度快（无需加载模型）
- ✅ 独立可靠（不依赖外部资源）
- ✅ 易于维护（专注于工具逻辑）

## 📚 参考文档

- [Vitest 官方文档](https://vitest.dev/)
- [EmbeddingService 测试示例](../../../main/services/embedding/__tests__/EmbeddingService.test.ts)
- [MemoryService 实现](../../../main/services/MemoryService.ts)
- [Memory Tools 定义](../../definitions/memory_tools.ts)
