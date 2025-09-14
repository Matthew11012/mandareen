// Global event system for refreshing user's current level
// This allows components to trigger level refresh from anywhere in the app

const LEVEL_REFRESH_EVENT = "level-refresh";

export const triggerLevelRefresh = () => {
  const event = new CustomEvent(LEVEL_REFRESH_EVENT);
  window.dispatchEvent(event);
};

export const useLevelRefreshListener = (callback: () => void) => {
  const handleRefresh = () => {
    callback();
  };

  if (typeof window !== "undefined") {
    window.addEventListener(LEVEL_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(LEVEL_REFRESH_EVENT, handleRefresh);
    };
  }

  return () => {}; // No-op for SSR
};
