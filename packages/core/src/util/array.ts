/**
 * Appends items in place. Unlike `into.push(...items)`, this doesn't pass every item as a
 * function argument, which overflows the call stack for large arrays (~100k items).
 */
export function append<T>(into: T[], items: readonly T[]): T[] {
  for (const x of items) into.push(x);
  return into;
}
