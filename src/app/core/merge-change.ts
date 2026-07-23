export interface ChangeEvent<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  item: T;
}

export function mergeChange<T extends { id: string; modified_at: string }>(
  current: T[],
  change: ChangeEvent<T>,
): T[] {
  if (change.eventType === 'DELETE') {
    return current.filter((item) => item.id !== change.item.id);
  }

  const index = current.findIndex((item) => item.id === change.item.id);

  if (index === -1) {
    return [...current, change.item];
  }

  if (change.item.modified_at < current[index].modified_at) {
    return current;
  }

  return current.map((item, i) => (i === index ? change.item : item));
}
