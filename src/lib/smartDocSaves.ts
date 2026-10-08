/** Browser draft queues survive lesson changes, retaining unacknowledged edits.
 * One serialized writer per owner/placement prevents older requests overwriting
 * newer answers. Drafts stay in memory and are never shared between accounts.
 */
export type SmartDocSaveState = { pending: boolean; error: string | null };
type Writer = (promptId: number, value: string) => Promise<void>;

export function createSmartDocSaveQueue(write: Writer, delay = 400) {
  const drafts = new Map<number, { value: string; revision: number }>();
  const listeners = new Set<(state: SmartDocSaveState) => void>();
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  let error: string | null = null;
  const state = (): SmartDocSaveState => ({ pending: drafts.size > 0 || !!running, error });
  const notify = () => listeners.forEach((listener) => listener(state()));
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (running) return running.then(() => drafts.size ? flush() : undefined);
    if (!drafts.size) return Promise.resolve();
    error = null;
    running = Promise.resolve().then(async () => {
      while (drafts.size) {
        const [promptId, snapshot] = drafts.entries().next().value!;
        await write(promptId, snapshot.value);
        if (drafts.get(promptId)?.revision === snapshot.revision) drafts.delete(promptId);
      }
    }).catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : 'Your answers could not be saved.';
      throw cause;
    }).finally(() => { running = null; notify(); });
    notify();
    return running.then(() => drafts.size ? flush() : undefined);
  };
  return {
    state,
    flush,
    draftValues: () => Object.fromEntries([...drafts].map(([id, draft]) => [id, draft.value])),
    edit(promptId: number, value: string) {
      drafts.set(promptId, { value, revision: ++revision });
      error = null;
      clearTimeout(timer);
      timer = setTimeout(() => { void flush().catch(() => {}); }, delay);
      notify();
    },
    subscribe(listener: (state: SmartDocSaveState) => void) {
      listeners.add(listener);
      listener(state());
      return () => { listeners.delete(listener); };
    },
  };
}

export type SmartDocSaveQueue = ReturnType<typeof createSmartDocSaveQueue>;
const queues = new Map<string, SmartDocSaveQueue>();
let activeOwner: string | null = null;

export function getSmartDocSaveQueue(userId: string, contentBlockId: number) {
  activeOwner = userId;
  const key = `${userId}:${contentBlockId}`;
  let queue = queues.get(key);
  if (!queue) {
    queue = createSmartDocSaveQueue(async (promptId, value) => {
      const response = await fetch('/api/smartdoc/upsert', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content_block_id: contentBlockId, prompt_id: promptId, value, expected_user_id: userId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.details ?? body.error ?? 'Your answers could not be saved. Please retry.');
      }
    });
    queues.set(key, queue);
  }
  return queue;
}

export function hasPendingSmartDocSaves() {
  return activeQueues().some((queue) => queue.state().pending);
}

const activeQueues = () => [...queues].filter(([key]) => key.startsWith(`${activeOwner}:`)).map(([, queue]) => queue);

export async function flushPendingSmartDocSaves() {
  const results = await Promise.allSettled(activeQueues().map((queue) => queue.flush()));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
