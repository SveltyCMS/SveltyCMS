/**
 * @file src/hooks.client.ts
 * @description Client-side hooks for global error handling and initialization.
 *
 * ### Features:
 * - suppresses browser-extension message-channel errors
 */

/**
 * Suppress the noisy "message channel closed" error that browser extensions
 * (e.g., Grammarly, LastPass, React DevTools) inject into every page.
 * This is not an application bug — the error originates from extension
 * content scripts that use chrome.runtime.sendMessage with an async
 * listener that never sends a response before the port closes.
 */
function suppressExtensionNoise(): void {
  if (typeof window === "undefined") return;

  // Guard: only register once (HMR may cause re-execution)
  const KEY = "__sveltycms_unhandledrejection_registered";
  if ((window as any)[KEY]) return;
  (window as any)[KEY] = true;

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason?.message ?? String(reason ?? "");

    // This is the exact Chrome extension error we want to suppress
    if (
      typeof message === "string" &&
      message.includes("message channel closed") &&
      message.includes("asynchronous response")
    ) {
      event.preventDefault(); // Prevents the error from appearing in the console
      return;
    }
  });
}

suppressExtensionNoise();
