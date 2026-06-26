/**
 * @file src/stores/validation-store.svelte.ts
 * @description Form field validation — tracks per-field error messages and overall validity.
 *
 * Features:
 * - Per-field error tracking with setError / clearError / getError
 * - Reactive isValid derived from all errors
 * - clearAllErrors for form reset
 */

class ValidationStore {
  _errors = $state<Record<string, string | null>>({});

  get errors() {
    return this._errors;
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
  }

  getError(field: string) {
    return this._errors[field] ?? null;
  }

  hasError(field: string) {
    return !!this._errors[field];
  }
}

export const validationStore = new ValidationStore();
