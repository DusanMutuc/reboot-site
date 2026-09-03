// Admin navigation is client-side, so beforeunload alone cannot protect a draft.
export const DISCOVERY_NAVIGATION_EVENT = 'discovery:before-admin-navigation';

export function navigateWithDiscoveryGuard(run: () => void) {
  const event = new CustomEvent<{ run: () => void }>(DISCOVERY_NAVIGATION_EVENT, {
    cancelable: true, detail: { run },
  });
  if (window.dispatchEvent(event)) run();
}
