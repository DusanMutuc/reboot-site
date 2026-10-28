import {
  preparationInput, validatePreparation,
  type BusinessAuditPreparationInput, type BusinessAuditPreparationPayload,
  type BusinessAuditPreparationSaveResult,
} from './businessAuditPreparationShared';

export type PreparationSaveRequest = {
  businessReviewId: number; expectedRevision: number; requestId: string;
  mode: 'draft' | 'submit'; values: BusinessAuditPreparationInput;
};
export type PreparationBackup = {
  userId: string; businessReviewId: number; revision: number;
  values: BusinessAuditPreparationInput; pending: PreparationSaveRequest | null;
};
export class PreparationSaveError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors: Record<string, string> = {}) { super(message); }
}
const equal = (a: BusinessAuditPreparationInput, b: BusinessAuditPreparationInput) =>
  Object.keys(a).every((key) => a[key as keyof typeof a] === b[key as keyof typeof b]);

/** One editor is permanently bound to one authenticated member and review. */
export class PreparationDraftEditor {
  payload: BusinessAuditPreparationPayload;
  values: BusinessAuditPreparationInput;
  revision: number;
  pending: PreparationSaveRequest | null = null;
  conflict: BusinessAuditPreparationPayload | null = null;
  error: string | null = null;
  fieldErrors: Record<string, string> = {};
  saving = false;
  submitting = false;
  submitted = false;
  recovered = false;
  private acknowledged: BusinessAuditPreparationInput;
  private flight: Promise<boolean> | null = null;
  private blocked = false;

  constructor(payload: BusinessAuditPreparationPayload, private io: {
    write(request: PreparationSaveRequest): Promise<BusinessAuditPreparationSaveResult>;
    reload(): Promise<BusinessAuditPreparationPayload>;
    requestId(): string;
    backup(value: PreparationBackup | null): void;
    changed(): void;
  }, backup?: PreparationBackup | null) {
    this.payload = payload;
    this.values = preparationInput(payload.draft?.values ?? payload.answers);
    this.acknowledged = { ...this.values };
    this.revision = payload.draft?.revision ?? 0;
    if (backup?.userId === payload.userId && backup.businessReviewId === payload.audit.id
      && Number.isSafeInteger(backup.revision) && backup.revision >= 0
      && !Object.keys(validatePreparation(backup.values, false)).length) {
      const acknowledgedRetry = !!backup.pending && backup.pending.requestId === payload.draft?.lastRequestId;
      if (!equal(backup.values, this.values)) {
        this.values = preparationInput(backup.values);
        this.recovered = true;
        if (backup.revision !== this.revision && !acknowledgedRetry) {
          this.conflict = payload;
          this.blocked = true;
        }
      }
      if (!this.conflict && !acknowledgedRetry && backup.pending
        && backup.pending.businessReviewId === payload.audit.id
        && backup.pending.expectedRevision === this.revision
        && ['draft', 'submit'].includes(backup.pending.mode)
        && !Object.keys(validatePreparation(backup.pending.values, backup.pending.mode === 'submit')).length) {
        this.pending = backup.pending;
      }
    }
  }

  get dirty() { return !equal(this.values, this.acknowledged); }
  get protected() { return this.dirty || this.saving || !!this.pending; }
  get hasUnsubmittedChanges() {
    return this.dirty || (this.payload.draft !== null && this.payload.draft.revision !== this.payload.draft.submittedRevision);
  }
  private notify() {
    this.io.backup(this.protected ? { userId: this.payload.userId, businessReviewId: this.payload.audit.id,
      revision: this.revision, values: { ...this.values }, pending: this.pending } : null);
    this.io.changed();
  }
  edit(field: keyof BusinessAuditPreparationInput, value: string | number | null) {
    if (this.submitting) return;
    this.values = { ...this.values, [field]: value };
    this.fieldErrors = { ...this.fieldErrors, [field]: '' };
    this.submitted = false;
    if (!this.pending && !this.blocked && !this.conflict) this.error = null;
    // A failed/uncertain request must be retried with its original id and values.
    this.notify();
  }
  async save(submit = false): Promise<boolean> {
    if (this.flight) {
      if (!await this.flight) return false;
      return this.save(submit);
    }
    if (this.blocked || this.conflict) return false;
    if (!this.pending && !submit && !this.dirty) return true;
    if (!this.pending) {
      this.fieldErrors = validatePreparation(this.values, submit);
      if (Object.keys(this.fieldErrors).length) {
        this.error = submit ? 'Please answer all eight questions before submitting.' : 'Check the highlighted answers.';
        this.notify(); return false;
      }
      this.pending = { businessReviewId: this.payload.audit.id, expectedRevision: this.revision,
        requestId: this.io.requestId(), mode: submit ? 'submit' : 'draft', values: { ...this.values } };
    }
    const request = this.pending;
    this.saving = true; this.error = null; this.notify();
    const work = async () => {
      try {
        const result = await this.io.write(request);
        if (result.businessReviewId !== this.payload.audit.id || result.draft.lastRequestId !== request.requestId) {
          throw new Error('The server could not confirm this save. Please retry.');
        }
        this.payload = { ...this.payload, answers: result.answers, draft: result.draft };
        this.revision = result.draft.revision;
        this.acknowledged = preparationInput(result.draft.values);
        this.pending = null;
        this.submitted = request.mode === 'submit';
        this.recovered = false;
        return true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Could not save your answers. Please retry.';
        if (error instanceof PreparationSaveError) {
          this.fieldErrors = error.fieldErrors;
          if (error.status === 409) {
            this.blocked = true;
            try { this.conflict = await this.io.reload(); }
            catch { this.error = 'The saved version could not be loaded. Your answers are preserved. Retry to compare versions.'; }
          } else if (error.status === 400) {
            this.pending = null;
          }
        }
        return false;
      } finally { this.saving = false; this.flight = null; this.notify(); }
    };
    this.flight = work();
    const result = await this.flight;
    // Explicit submission waits for an earlier draft/retry and includes any
    // newer edits made after that request's uncertain acknowledgement.
    if (result && submit && (request.mode !== 'submit' || this.dirty)) return this.save(true);
    return result;
  }
  async submit() {
    if (this.submitting) return false;
    this.submitting = true; this.notify();
    try { return await this.save(true); }
    finally { this.submitting = false; this.notify(); }
  }
  async retry() {
    if (this.blocked && !this.conflict) {
      try { this.conflict = await this.io.reload(); }
      catch { this.error = 'Could not load the saved version. Please retry.'; }
      this.notify(); return false;
    }
    return this.save();
  }
  resolveConflict(keepLocal: boolean) {
    if (!this.conflict || this.conflict.userId !== this.payload.userId || this.conflict.audit.id !== this.payload.audit.id) return;
    this.payload = this.conflict;
    this.revision = this.conflict.draft?.revision ?? 0;
    this.acknowledged = preparationInput(this.conflict.draft?.values ?? this.conflict.answers);
    if (!keepLocal) this.values = { ...this.acknowledged };
    this.conflict = null; this.blocked = false; this.pending = null; this.error = null; this.fieldErrors = {};
    this.notify();
  }
}
