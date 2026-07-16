/**
 * @file src/utils/preview.ts
 * @description Unified live preview system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - Timing-safe HMAC comparison: timingSafeEqual prevents side-channel signature attacks
 * - Full HMAC digest (no truncation): 256-bit integrity, matches preview-service
 * - CSS.escape: sanitizes field names in selectors to prevent CSS injection
 * - Event delegation: single document-level listener replaces per-field bindings
 * - postMessage prefix filter: ignores non-"svelty:" messages from extensions/noise
 *
 * Consolidates:
 * - Live Preview Listener (frontend message handling, visual editing)
 * - Preview Verification (server-side token validation)
 */

import { logger } from "./logger";

// --- Types ---

export interface LivePreviewOptions {
  onUpdate: (data: Record<string, unknown>) => void;
  origin?: string;
  visualEditing?: boolean;
}

export interface VerificationResult {
  valid: boolean;
  userId: string;
  entryId: string;
  expires: number;
}

// --- Frontend: Live Preview Listener ---

/**
 * Creates a listener for live preview updates from the CMS admin.
 */
export function createLivePreviewListener(options: LivePreviewOptions): {
  destroy: () => void;
} {
  const { onUpdate, origin, visualEditing = false } = options;

  function handleMessage(event: MessageEvent) {
    // 🛡️ Security: Enforce strict origin checking to prevent postMessage spoofing/hijacking
    if (origin && event.origin !== origin) return;
    if (!event.data?.type?.startsWith("svelty:")) return;

    if (event.data.type === "svelty:update" && event.data.data) {
      onUpdate(event.data.data);
    }

    if (event.data.type === "svelty:field:select" && typeof event.data.fieldName === "string") {
      const el = document.querySelector(
        `[data-svelty-field="${CSS.escape(event.data.fieldName)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("svelty-field-active");
        setTimeout(() => el.classList.remove("svelty-field-active"), 2000);
      }
    }
  }

  let cleanupVisualEditing = () => {};

  if (visualEditing && typeof document !== "undefined") {
    // 🚀 Performance: Only inject styles if they don't exist
    if (!document.getElementById("svelty-live-preview-styles")) {
      const style = document.createElement("style");
      style.id = "svelty-live-preview-styles";
      style.textContent = `
        [data-svelty-field] { transition: outline 0.2s ease-in-out; cursor: pointer !important; }
        [data-svelty-field]:hover { outline: 2px dashed #ff3e00 !important; outline-offset: 2px; }
        .svelty-field-active { outline: 2px solid #ff3e00 !important; outline-offset: 2px; animation: svelty-pulse 1s infinite; }
        @keyframes svelty-pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
      `;
      document.head.appendChild(style);
    }

    // 🚀 Performance: Use Event Delegation (Single listener for entire document)
    const handleEvent = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-svelty-field]");
      if (!target) return;

      const fieldName = target.getAttribute("data-svelty-field");
      if (fieldName && window.parent !== window) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage(
          {
            type: e.type === "click" ? "svelty:field:click" : "svelty:field:hover",
            fieldName,
          },
          origin || "*",
        );
      }
    };

    document.addEventListener("click", handleEvent, true);
    document.addEventListener("mouseover", handleEvent, true);

    cleanupVisualEditing = () => {
      document.removeEventListener("click", handleEvent, true);
      document.removeEventListener("mouseover", handleEvent, true);
    };
  }

  window.addEventListener("message", handleMessage);
  if (window.parent !== window) {
    window.parent.postMessage({ type: "svelty:init", version: "1.2.0" }, origin || "*");
  }

  return {
    destroy() {
      window.removeEventListener("message", handleMessage);
      cleanupVisualEditing();
    },
  };
}

// --- Server: Token Verification ---

/**
 * Verifies a HMAC-signed preview token.
 * Uses timing-safe comparison to prevent side-channel attacks.
 */
export async function verifyPreviewToken(
  token: string,
  secret: string,
): Promise<VerificationResult> {
  try {
    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const decoded = Buffer.from(token, "base64url").toString();
    const [userId, entryId, expiresStr, signature] = decoded.split(":");
    const expires = Number(expiresStr);

    if (Date.now() > expires) return { valid: false, userId, entryId, expires };

    const payload = `${userId}:${entryId}:${expiresStr}`;
    const expectedBuffer = createHmac("sha256", secret).update(payload).digest();
    const providedBuffer = Buffer.from(signature, "hex");

    // 🛡️ Security: Use timingSafeEqual to prevent side-channel timing attacks
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return { valid: false, userId, entryId, expires };
    }

    return { valid: true, userId, entryId, expires };
  } catch (error) {
    logger.error("Preview token verification error", error);
    return { valid: false, userId: "", entryId: "", expires: 0 };
  }
}
