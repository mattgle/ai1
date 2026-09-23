// A map that only forgets an entry when the value given to forget it is
// still the current one. This guards against a stale, asynchronous callback
// (for example a closed terminal's own delayed close event, registered
// against one particular terminal instance) dropping a newer value that has
// since replaced it under the same key.
export class IdentityMap<K, V> {
  protected readonly map = new Map<K, V>();

  set(key: K, value: V): void {
    this.map.set(key, value);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  // Deletes `key` only if its current value is still `value`. Returns
  // whether it deleted.
  forgetIfSame(key: K, value: V): boolean {
    if (this.map.get(key) === value) {
      this.map.delete(key);
      return true;
    }
    return false;
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
