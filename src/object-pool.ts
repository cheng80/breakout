export class ObjectPool<T> {
  private readonly available: T[] = [];

  constructor(
    private readonly create: () => T,
    private readonly reset: (item: T) => void,
  ) {}

  acquire(): T {
    return this.available.pop() ?? this.create();
  }

  release(item: T): void {
    this.reset(item);
    this.available.push(item);
  }

  releaseAll(items: T[]): void {
    items.forEach((item) => this.release(item));
    items.length = 0;
  }

  get size(): number {
    return this.available.length;
  }
}
