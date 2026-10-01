// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in: point this at an isolated Electron development profile, never a live user profile.
const endpoint = process.env.ATI_SEARCH_TEST_CDP_URL;

describe.runIf(Boolean(endpoint))("SchedulerChats Electron animation", () => {
  let socket: WebSocket;
  let requestId = 0;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();
  const send = <T = unknown>(method: string, params: object = {}): Promise<T> =>
    new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, {
        resolve: (value): void => resolve(value as T),
        reject,
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = await send<{
      exceptionDetails?: unknown;
      result: { value: T };
    }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  beforeAll(async () => {
    const targets = (await (
      await fetch(`${endpoint}/json/list`)
    ).json()) as Array<{ url: string; webSocketDebuggerUrl: string }>;
    const target = targets.find((item) =>
      /^http:\/\/localhost:\d+\/$/.test(item.url),
    );
    if (!target) throw new Error("No Electron development renderer found");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = (): void => resolve();
      socket.onerror = reject;
    });
    socket.onmessage = (event): void => {
      const response = JSON.parse(String(event.data)) as {
        id: number;
        result: unknown;
        error?: unknown;
      };
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.error) request.reject(response.error);
      else request.resolve(response.result);
    };
    await evaluate(`(async () => {
      const { useSheetStore } = await import('/src/features/chat/state/sheetStore.ts')
      useSheetStore.getState().setSheetOpenState(false)
      const { useChatStore } = await import('/src/features/chat/state/chatStore.ts')
      useChatStore.getState().setTasksPageOpen(true)
      await new Promise(resolve => setTimeout(resolve, 300))
    })()`);
  });

  afterAll(async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      await send("Emulation.clearDeviceMetricsOverride");
      await send("Emulation.setEmulatedMedia", { features: [] });
    } finally {
      socket.close();
    }
  });

  it("interpolates opening and closing, and respects reduced motion in both themes", async () => {
    for (const theme of ["light", "dark"]) {
      for (const width of [315, 640]) {
        for (const reduced of [false, true]) {
          await send("Emulation.setDeviceMetricsOverride", {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await send("Emulation.setEmulatedMedia", {
            features: [
              {
                name: "prefers-reduced-motion",
                value: reduced ? "reduce" : "no-preference",
              },
            ],
          });
          await evaluate(
            `document.documentElement.classList.toggle('dark', ${theme === "dark"})`,
          );
          const frames = await evaluate<{
            open: number[];
            close: number[];
          }>(`(async () => {
            const section = document.querySelector('section[aria-label="Chats"]')
            section.querySelector('button[aria-label="Close search"]')?.click()
            await new Promise(resolve => setTimeout(resolve, 300))
            const control = section.querySelector('[data-search-open]')
            const sample = async (label) => {
              const widths = [control.getBoundingClientRect().width]
              section.querySelector('button[aria-label="' + label + '"]').click()
              const start = performance.now()
              while (performance.now() - start < 320) {
                await new Promise(requestAnimationFrame)
                widths.push(control.getBoundingClientRect().width)
              }
              return widths
            }
            return { open: await sample('Search chats'), close: await sample('Close search') }
          })()`);
          for (const [direction, widths] of Object.entries(frames) as Array<
            [string, number[]]
          >) {
            const minimum = Math.min(...widths);
            const maximum = Math.max(...widths);
            expect(
              maximum - minimum,
              `${theme}/${width}/${direction}`,
            ).toBeGreaterThan(100);
            const intermediate = widths.some(
              (value) => value > minimum + 2 && value < maximum - 2,
            );
            expect(
              intermediate,
              `${theme}/${width}/${direction}, reduced=${reduced}`,
            ).toBe(!reduced);
          }
        }
      }
    }
  }, 15_000);
});
