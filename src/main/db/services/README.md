# services

`services/` 放数据库相关的业务动作与流程编排。

适合放在这里的内容：
- 组合多个 repository 完成一次完整动作
- 启动期 db 相关流程
- 迁移、同步、bootstrap、批处理
- 面向上层模块暴露的较稳定 db 应用服务

不应该放在这里的内容：
- 原始 SQL
- 纯形状转换
- 只涉及单表 CRUD 的简单读写

约束：
- service 可以依赖多个 repository / dao / mapper，但不应反过来被它们依赖
- service 解决“动作”和“流程”，不是新一层模糊转发
- 如果一个 service 只是在无意义地包一层 repository，需要考虑删掉或并回更清晰的边界

当前目录中常见的合理形态：
- bootstrap / migration / manifest sync
- 按领域提供的 db facade，例如 chat、config、plugin、planning 相关服务

判断标准：
- 如果这段逻辑描述的是“做成一件事”，它更像 `services/`
- 如果这段逻辑描述的是“怎么查这张表”，它不该在 `services/`
