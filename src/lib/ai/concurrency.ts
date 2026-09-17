export class QueueFullError extends Error {
  code = 'AI_BUSY';
  constructor(message = 'AI server is currently busy. Please try again in a few moments.') {
    super(message);
    this.name = 'QueueFullError';
  }
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (val: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  queuedAt: number;
}

export class ConcurrencyController {
  private maxConcurrency: number;
  private maxQueueSize: number;
  private activeCount = 0;
  private queue: QueuedTask<unknown>[] = [];

  constructor(maxConcurrency = 2, maxQueueSize = 10) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Dynamically adjusts max concurrency ceiling for load testing (N = 1..4).
   */
  public setMaxConcurrency(n: number): void {
    this.maxConcurrency = Math.max(1, n);
    this.processQueue();
  }

  /**
   * Returns current active inferences and queue telemetry.
   */
  public getTelemetry() {
    return {
      activeInferences: this.activeCount,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Executes a promise-returning AI operation under concurrency + queue constraints.
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrency) {
      return this.execute(fn);
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new QueueFullError();
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (val: unknown) => void,
        reject,
        queuedAt: Date.now(),
      });
    });
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.execute(next.fn).then(next.resolve).catch(next.reject);
      }
    }
  }
}

// Global Singleton for local process
const initialConcurrency = Number.parseInt(process.env.AI_MAX_CONCURRENCY || '2', 10) || 2;
const initialQueueSize = Number.parseInt(process.env.AI_MAX_QUEUE_SIZE || '10', 10) || 10;

export const aiConcurrencyController = new ConcurrencyController(
  initialConcurrency,
  initialQueueSize
);
