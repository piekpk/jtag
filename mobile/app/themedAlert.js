// Drop-in themed replacement for React Native's Alert.alert.
// Same signature: showAlert(title, message, buttons?).
// Rendered by <ThemedAlert /> mounted in the root layout: black & gold,
// rounded card, works from any screen.
const listeners = new Set();

export function onThemedAlert(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showAlert(title, message, buttons) {
  const btns = buttons && buttons.length ? buttons : [{ text: 'OK' }];
  listeners.forEach((fn) => fn({ title, message, buttons: btns }));
}
