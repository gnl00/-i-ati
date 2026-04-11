/**
 * HostStepOutputBuilder
 *
 * 放置内容：
 * - 把单个 step 的 runtime 事实整理成外部可见对象
 *
 * 业务逻辑边界：
 * - 它属于 host 层，不属于 core loop
 * - 它可以有多个 host-specific 实现
 * - 它负责把 AgentStep 变成 HostStepOutput，而不是反过来
 */
export {}
