class ConcurrencyLimiter {
  private active = 0;

  constructor(private readonly max: number) {}

  get isAtCapacity(): boolean {
    return this.active >= this.max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
    }
  }
}

export { ConcurrencyLimiter };
