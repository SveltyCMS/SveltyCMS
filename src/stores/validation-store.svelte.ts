/**
 * @file src/stores/validation-store.svelte.ts
 * @description Form field validation — tracks per-field error messages and overall validity.
 *
 * Features:
 * - Per-field error tracking with setError / clearError / getError
 * - Reactive isValid derived from all errors
 * - `surfaced` gate: errors stay internal until the user acts (AUD-017). Required
 *   fields are evaluated on mount, so an untouched create form used to open with a
 *   red "fix validation errors" banner and a red message under Save. The gate flips
 *   on the first save attempt, so the same errors appear when they are actionable.
 * - clearAllErrors for form reset
 */

class ValidationStore {
  _errors = $state<Record<string, string | null>>({});
  _surfaced = $state(false);

  get errors() {
    return this._errors;
  }

  /** True once the user attempted to save; gates every visible error surface. */
  get surfaced() {
    return this._surfaced;
  }

  markSurfaced() {
    this._surfaced = true;
  }

  get isValid() {
    return Object.values(this._errors).every((e) => !e);
  }

  setError(field: string, msg: string | null) {
    this._errors[field] = msg;
  }

  clearError(field: string) {
    delete this._errors[field];
  }

  clearAllErrors() {
    this._errors = {};
    this._surfaced = false;
  }

  getError(field: string) {
    return this._errors[field] ?? null;
  }

  hasError(field: string) {
    return !!this._errors[field];
  }
}

export const validationStore = new ValidationStore();
