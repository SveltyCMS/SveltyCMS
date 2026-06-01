/** @file src/stores/store.svelte.ts
 * @description Global state management with Enterprise-grade reactivity.
 */

class AppStore {
  _systemLanguage = $state("en");
  _contentLanguage = $state("en");
  avatarSrc = $state("/Default_User.svg");
  listboxValueState = $state("create");
  tabSetState = $state(0);
  drawerExpandedState = $state(true);
  completionStatus = $state(0);
  translationStatusOpen = $state(false);
  saveEditedImage = $state(false);
  file = $state<File | null>(null);
  shouldShowNextButton = $state(false);
  saveLayerStore = $state<() => Promise<void>>(async () => {});
  saveFunction = $state<{ fn: (args?: unknown) => unknown; reset: () => void }>({
    fn: () => {},
    reset: () => {},
  });

  get systemLanguage() {
    return this._systemLanguage;
  }
  set systemLanguage(v: string) {
    this._systemLanguage = v;
  }

  get contentLanguage() {
    return this._contentLanguage;
  }
  set contentLanguage(v: string) {
    this._contentLanguage = v;
  }

  setAvatarSrc(v: string) {
    this.avatarSrc = v;
  }
}

export const app = new AppStore();

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

class DataChangeStore {
  hasChanges = $state(false);
  initialDataSnapshot = $state("");

  setHasChanges(v: boolean) {
    this.hasChanges = v;
  }

  setInitialSnapshot(data: Record<string, unknown>) {
    this.initialDataSnapshot = JSON.stringify(data);
    this.hasChanges = false;
  }

  compareWithCurrent(currentData: Record<string, unknown>): boolean {
    if (!this.initialDataSnapshot) {
      return false;
    }
    const currentSnapshot = JSON.stringify(currentData);
    const changed = currentSnapshot !== this.initialDataSnapshot;
    if (this.hasChanges !== changed) {
      this.hasChanges = changed;
    }
    return changed;
  }

  reset() {
    this.hasChanges = false;
    this.initialDataSnapshot = "";
  }
}

export const dataChangeStore = new DataChangeStore();

export const systemLanguage = {
  get value() {
    return app.systemLanguage;
  },
  set value(v: string) {
    app.systemLanguage = v;
  },
};

export const contentLanguage = {
  get value() {
    return app.contentLanguage;
  },
  set value(v: string) {
    app.contentLanguage = v;
  },
};

let _transProgress = $state(0);
export const translationProgress = {
  get value() {
    return _transProgress;
  },
  set value(v: number) {
    _transProgress = v;
  },
};

export const storeListboxValue = {
  get value() {
    return app.listboxValueState;
  },
  set value(v: string) {
    app.listboxValueState = v;
  },
};

export const tabSet = {
  get value() {
    return app.tabSetState;
  },
  set value(v: number) {
    app.tabSetState = v;
  },
};

export const avatarSrc = {
  get value() {
    return app.avatarSrc;
  },
  set value(v: string) {
    app.avatarSrc = v;
  },
};

export function normalizeAvatarUrl(url: string | null | undefined): string {
  const DEFAULT_AVATAR = "/Default_User.svg";
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith("data:") || /^https?:\/\//i.test(url)) return url;
  if (/^\/?Default_User\.svg$/i.test(url)) return DEFAULT_AVATAR;
  const normalized = url.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "/");
  if (normalized.startsWith("/files/")) return normalized;
  return normalized.startsWith("/") ? normalized : "/files/" + normalized;
}

export const tableHeaders = ["id", "email", "username", "role", "createdAt"] as const;
export const indexer = undefined;

export { toast } from "./toast.svelte.ts";
