# Runtime scenarios

## 首次发送

Host 装配 system、tools、历史、当前输入和动态 context。Bootstrap 一次映射为 ContextRecord[]。
Loop 创建 ContextManager，调用 prepare，再经 ExecutableRequestAdapter、ModelStreamExecutor 发送。
模型成功结束后，AgentStepMaterializer 生成稳定步骤，经普通 record 函数追加。

## 工具续接

Loop 解析完整调用，ReadyToolCallMaterializer / ToolBatchAssembler 构成 batch。
结果经过统一 normalizer，追加完整 modelContent；技能变化与 steering 追加为显式 context records。
下一次 prepare 检查同 step、同 ID 的一对一配对，保护整个未消费 batch。
成功返回下一 AgentStep 才消费旧 batch。先前已消费的步骤进入可压缩历史。

## 历史超预算

先计量必需上下文。必需内容超窗直接失败；否则装入旧摘要和最近完整历史。
若超窗则压缩旧前缀一次；失败、无效或超窗摘要退化为省略历史，并提示缺口。
取消停止压缩与发送。全过程不修改 raw records、数据库工具结果或恢复文件。

## 失败与终态

provider 或工具失败沿现有事件路径通知 Host，已稳定的事实仍完整导出。
batch 缺少结果时不补造结果，不发 continuation。终态调用 context.snapshot()，
AgentLoopResult.transcript 作为 Host / CLI 的完整证据产物。
最大步骤数和 wall-clock limit 保持 LoopExecutionConfig 的现有语义。
