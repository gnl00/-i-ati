# Native run notifications

Last verified against source: 2026-09-29.

[AgentNotificationSink](../../src/main/notifications/AgentNotificationSink.ts)
consumes main-agent terminal events. `loop.completed` can produce a completion
notification; `loop.failed` can produce a failure notification; `loop.aborted`
produces no system notification.

The sink checks OS support and the main-window foreground gate. Notification
errors are isolated from the run event bus. A module-level set retains live
Notification objects so click and close callbacks survive; click restores and
focuses the main window.

Scheduled attempts suppress intermediate failure notifications. The final
failure path can use `notifyTerminalRunFailure` even if no AgentRun was created.
An `occurrenceKey` deduplicates notifications across attempts, with a bounded
in-memory history. Successful execution and later scheduler-finalization errors
remain distinct. Startup recovery follows schedule persistence and events.

Host selection and sink registration belong to the run runtime; Telegram and
subagents retain their own event/response boundaries. See
[Chat runtime](chat-runtime-architecture-current.md) and [Scheduled tasks](scheduled-tasks.md).

[Original completed work](../archive/2026/notifications/2026-09-29-os-native-notification-plan.md)
retains the historical delivery context. Current automated coverage is in
[AgentNotificationSink tests](../../src/main/notifications/__tests__/AgentNotificationSink.test.ts).
Real OS delivery, focus restoration and platform notification settings require
runtime acceptance after a notification implementation change.
