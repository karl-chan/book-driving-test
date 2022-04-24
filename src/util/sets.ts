export function setDifference<T> (a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>()
  for (const el of a) {
    if (!b.has(el)) {
      result.add(el)
    }
  }
  return result
}
