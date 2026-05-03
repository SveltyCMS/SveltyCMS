/**
 * @file src/utils/preview.ts
 * @description Unified live preview system for SveltyCMS.
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

// --- Frontend: Live Preview Listener (Merged from use-live-preview.ts) ---

/**
 * Creates a listener for live preview updates from the CMS admin.
 */
export function createLivePreviewListener(options: LivePreviewOptions): { destroy: () => void } {
  const { onUpdate, origin, visualEditing = false } = options;

  function handleMessage(event: MessageEvent) {
    if (origin && origin !== "*" && event.origin !== origin) return;

    if (event.data?.type === "svelty:update" && event.data.data) {
      onUpdate(event.data.data);
    }

    if (event.data?.type === "svelty:field:select" && event.data.fieldName) {
      const el = document.querySelector(`[data-svelty-field="${event.data.fieldName}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("svelty-field-active");
        setTimeout(() => el.classList.remove("svelty-field-active"), 2000);
      }
    }
  }

  let cleanupVisualEditing = () => {};

  if (visualEditing && typeof document !== "undefined") {
    const styleId = "svelty-live-preview-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        [data-svelty-field] { transition: outline 0.2s ease-in-out; cursor: pointer !important; }
        [data-svelty-field]:hover { outline: 2px dashed #ff3e00 !important; outline-offset: 2px; }
        .svelty-field-active { outline: 2px solid #ff3e00 !important; outline-offset: 2px; animation: svelty-pulse 1s infinite; }
        @keyframes svelty-pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
      `;
      document.head.appendChild(style);
    }

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-svelty-field]");
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        const fieldName = target.getAttribute("data-svelty-field");
        if (fieldName && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "svelty:field:click", fieldName }, "*");
        }
      }
    };

    const handleHover = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-svelty-field]");
      if (target) {
        const fieldName = target.getAttribute("data-svelty-field");
        if (fieldName && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "svelty:field:hover", fieldName }, "*");
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("mouseover", handleHover, true);

    cleanupVisualEditing = () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("mouseover", handleHover, true);
      document.getElementById(styleId)?.remove();
    };
  }

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "svelty:init" }, "*");
    }
  }

  return {
    destroy() {
      if (typeof window !== "undefined") window.removeEventListener("message", handleMessage);
      cleanupVisualEditing();
    },
  };
}

// --- Server: Token Verification (Merged from preview-verification.ts) ---

/**
 * Verifies a HMAC-signed preview token.
 */
export async function verifyPreviewToken(
  token: string,
  secret: string,
): Promise<VerificationResult> {
  try {
    const { createHmac } = await import("node:crypto");
    const decoded = Buffer.from(token, "base64url").toString();
    const [userId, entryId, expiresStr, signature] = decoded.split(":");
    const expires = Number(expiresStr);

    if (Date.now() > expires) return { valid: false, userId, entryId, expires };

    const payload = `${userId}:${entryId}:${expiresStr}`;
    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 32);

    if (signature !== expectedSignature) return { valid: false, userId, entryId, expires };
    return { valid: true, userId, entryId, expires };
  } catch (error) {
    logger.error("Preview token verification failed", error);
    return { valid: false, userId: "", entryId: "", expires: 0 };
  }
}
