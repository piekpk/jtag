// Tiny pub/sub bridge so plain modules (duckApi.js) can trigger the themed
// milestone celebration modal mounted in the root layout. The native
// Alert.alert can't be styled, so celebrations go through here instead.
const listeners = new Set();

export function onCelebration(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitCelebration(completed) {
  if (!completed || !completed.length) return;
  listeners.forEach((fn) => fn(completed));
}
