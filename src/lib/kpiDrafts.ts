import { parseKpiValue } from './kpiFormat';

export type KpiPatch = Record<string, number | null>;

type Draft = {
  values: Record<string, string>;
  revisions: Record<string, number>;
  acknowledged: Record<string, number>;
  revision: number;
  pending: number;
  tail: Promise<void>;
  error: string | null;
  saved: boolean;
  changedAt: number;
};

// A tracker owns its drafts for the lifetime of the mounted editor. Switching
// months or members does not discard edits or retarget an in-flight write.
export class KpiDrafts {
  private drafts = new Map<string, Draft>();
  private clock = 0;

  checkpoint(): number {
    return this.clock;
  }

  seed(key: string, values: Record<string, string>): Record<string, string> {
    if (!this.drafts.has(key)) {
      this.drafts.set(key, {
        values: { ...values }, revisions: {}, acknowledged: {}, revision: 0,
        pending: 0, tail: Promise.resolve(), error: null, saved: false, changedAt: this.clock,
      });
    }
    return this.values(key);
  }

  // Use only for an actual completed history read. An older read must not
  // overwrite a write/edit that happened while it was in flight.
  refresh(key: string, values: Record<string, string>, checkpoint: number): void {
    const draft = this.drafts.get(key);
    if (!draft) {
      this.seed(key, values);
      return;
    }
    if (draft.pending || draft.changedAt > checkpoint) return;
    for (const [field, value] of Object.entries(values)) {
      if ((draft.revisions[field] ?? 0) <= (draft.acknowledged[field] ?? 0)) {
        draft.values[field] = value;
      }
    }
  }

  values(key: string): Record<string, string> {
    return { ...this.drafts.get(key)?.values };
  }

  edit(key: string, field: string, value: string): Record<string, string> {
    const draft = this.drafts.get(key);
    if (!draft) return {};
    if (draft.values[field] !== value) {
      draft.values[field] = value;
      draft.revisions[field] = ++draft.revision;
      draft.changedAt = ++this.clock;
    }
    return this.values(key);
  }

  format(key: string, field: string, value: string): Record<string, string> {
    const draft = this.drafts.get(key);
    if (draft) draft.values[field] = value;
    return this.values(key);
  }

  status(key: string): { state: 'idle' | 'saving' | 'saved' | 'error'; error: string | null } {
    const draft = this.drafts.get(key);
    if (!draft) return { state: 'idle', error: null };
    const dirty = Object.keys(draft.revisions).some(
      (field) => draft.revisions[field] > (draft.acknowledged[field] ?? 0),
    );
    return {
      state: draft.pending ? 'saving' : draft.error ? 'error' : dirty ? 'idle' : draft.saved ? 'saved' : 'idle',
      error: draft.error,
    };
  }

  async save(
    key: string,
    fields: string[] | undefined,
    write: (patch: KpiPatch) => Promise<void>,
  ): Promise<KpiPatch> {
    const draft = this.drafts.get(key);
    if (!draft) return {};

    // Capture the event's values now. A later edit must not change an earlier
    // request or become acknowledged by it. Omitted fields are untouched by RPC.
    const snapshot = (fields ?? Object.keys(draft.revisions))
      .filter((field) => (draft.revisions[field] ?? 0) > (draft.acknowledged[field] ?? 0))
      .map((field) => ({ field, revision: draft.revisions[field], value: parseKpiValue(field, draft.values[field]) }));

    draft.pending += 1;
    const operation = draft.tail.then(async () => {
      const changes = snapshot.filter(({ field, revision }) => revision > (draft.acknowledged[field] ?? 0));
      const patch = Object.fromEntries(changes.map(({ field, value }) => [field, value]));
      if (!changes.length) return patch;
      await write(patch);
      for (const { field, revision } of changes) draft.acknowledged[field] = revision;
      draft.saved = true;
      draft.changedAt = ++this.clock;
      if (Object.keys(draft.revisions).every((field) => draft.revisions[field] <= (draft.acknowledged[field] ?? 0))) {
        draft.error = null;
      }
      return patch;
    });
    const settled = operation.catch((error: unknown) => {
      draft.error = error instanceof Error ? error.message : 'Could not save KPI values.';
      throw error;
    }).finally(() => { draft.pending -= 1; });

    // A failed write retains its dirty fields but cannot poison later retries.
    draft.tail = settled.then(() => {}, () => {});
    return settled;
  }
}
