export const APP_EVENTS = {
  SESSION_UPDATED: 'app:session-updated',
  LIBRARY_UPDATED: 'app:library-updated',
  WISHLIST_UPDATED: 'app:wishlist-updated'
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

export function emitAppEvent(eventName: AppEventName): void {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function subscribeToAppEvents(eventNames: AppEventName[], handler: () => void): () => void {
  for (const eventName of eventNames) {
    window.addEventListener(eventName, handler);
  }

  return () => {
    for (const eventName of eventNames) {
      window.removeEventListener(eventName, handler);
    }
  };
}
