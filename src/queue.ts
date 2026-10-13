// Minimal serial job queue.
//
// The browser is a single, stateful resource: two scenarios must never
// drive it at the same time. Every tool call funnels through here so
// jobs run strictly one-at-a-time, in arrival order.

type Task<T> = () => Promise<T>;

class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private depth = 0;

  get pending(): number {
    return this.depth;
  }

  run<T>(task: Task<T>): Promise<T> {
    this.depth++;
    const result = this.tail.then(task, task);
    // Keep the chain alive regardless of individual task outcome.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.depth--;
    });
    return result;
  }
}

export const queue = new SerialQueue();
