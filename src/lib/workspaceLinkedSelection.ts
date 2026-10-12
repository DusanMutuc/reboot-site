// A stale or inaccessible appointment link must never silently select another
// appointment. Generic workspace visits retain their existing default selection.
export function selectLinkedWorkspaceItem(
  items: readonly { id: number }[],
  requestedId: number | null | undefined,
  defaultId: number | null,
): number | null {
  const target = requestedId ?? defaultId;
  return items.some((item) => item.id === target) ? target : null;
}
