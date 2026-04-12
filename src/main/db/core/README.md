# core

`core/` 放数据库基础设施，不放具体领域逻辑。

适合放在这里的内容：
- SQLite 连接初始化、schema 建表、索引、事务基础设施
- db runtime 装配
- 与数据库底层能力强绑定、但不属于某个具体业务领域的加载器或启动辅助

不应该放在这里的内容：
- 面向具体表的 CRUD
- 领域实体映射
- 业务动作编排

当前目录中的典型职责：
- `Database.ts`：数据库连接、建表、索引、事务
- `DbRuntime.ts`：db 层运行时装配

判断标准：
- 如果一个模块离开 SQLite / schema / transaction 就没有意义，它大概率属于 `core/`
- 如果一个模块已经开始讨论 chat、message、plugin、provider 这类领域对象，它就不该继续留在 `core/`
