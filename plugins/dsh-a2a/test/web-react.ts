/** React bridge for the standalone plugin specs. */
import { useSyncExternalStore } from 'react'

export function bindSnapshotSelector<S>(store: {
  getSnapshot(): S
  subscribe(listener: () => void): () => void
}) {
  return function useSnapshot<T>(selector: (state: S) => T): T {
    return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(store.getSnapshot()))
  }
}
