# ADR-0050: Supervised background subagent lifecycle

**Status:** Accepted<br>
**Date:** 2026-10-22<br>
**Extended by:** [ADR-0051](0051-persistent-subagent-sessions.md) for persistent sessions and messages<br>
**Related:** [Subagent architecture](../architecture/subagent-mvp.md)

## Context

The one-shot background service created an in-memory task and immediately ran it.
Its runner passed no abort signal to the runtime or tools, collapsed aborted
runs into failures, and allowed terminal updates to replace earlier terminal
facts. The parent approval/status bridge had no production registration caller.
Existing mocks did not exercise the registration seam.

## Decision

Keep the existing AgentRuntime/AgentLoop and independent worker prompt. The
subagent service owns one controller per task, a queue and active leases. It
admits at most four running tasks globally, two per parent chat (submission when
no chat exists), and sixteen pending tasks. The scheduler selects the earliest
eligible task, allowing another parent to use a slot while one group is full.
These are internal starting limits; no new settings or dependencies are added.

Expose cancel on the existing flat tool. Queued cancellation never starts work.
Active cancellation enters cancelling, signals the model and tool chain, waits
for started I/O and command process-group escalation to settle, then records
cancelled and returns the slot. Completed, failed and cancelled are immutable.
Each published record includes a monotonic revision for renderer ordering.
Wait timeout/cancellation cleans its timer and signal listener without stopping
the target task. Partial worker text is bounded to the last 32,000 characters;
successful file mutations and used tools remain available on unsuccessful runs.
These facts are evidence, not acceptance of the delegated task.

RunManager registers the parent bridge before execution. Parent completion and
each child hold independent references. Normal parent completion preserves child
approvals; explicit parent cancellation, failure or abort cancels its own jobs.
A cancelled child only cancels its own pending approvals. Approval deduplication
includes child identity so independent runtimes may reuse a provider tool ID.
The final child release removes a completed parent's channel. No completion
notification restarts the parent model. CLI uses its own approval/status adapter;
CLI, TUI and graceful Electron exit stop children before host teardown.

Trusted runtime identity overwrites model-provided parent/model fields. Tool
wait/cancel validates the target's chat before controlling it. Roles and their
existing execution permissions remain unchanged.

## Consequences and limits

This initial slice keeps live control in process and records in memory. ADR-0051
adds durable records and continuation. This initial slice has no database
migration, child messaging, automatic retry, restart recovery or new collaboration
mode. Process shutdown stops work; hard process termination is outside graceful
cleanup guarantees. A tool's ability to stop depends on its signal implementation;
already committed writes and externally processed requests cannot be undone.
Native Windows process-tree cleanup remains separate platform acceptance.

The process-wide command cleanup barrier is reused when cancelling a child; it
can also wait for another command's outstanding escalation. A per-process cleanup
lease is only needed if this causes measured cancellation delays.

## Verification

Cover admission limits, cross-parent scheduling, queue overflow, queued and active
cancellation, duplicate cancellation, immutable terminal facts, delayed callbacks,
wait timeout/abort cleanup, model-stream partial output, parent bridge registration,
parent completion with active children, independent approvals sharing tool IDs,
child-specific approval cancellation, renderer revision ordering and application
exit. Run affected tests, Node/web typechecks, changed-file lint, applicable main
and renderer boundary/path checks, full coverage and the production build.
Report isolated Electron runtime/renderer observations separately from real
provider and installed-app acceptance.
