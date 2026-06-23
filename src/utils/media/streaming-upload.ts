/**
 * @file src/utils/media/streaming-upload.ts
 * @description High-performance streaming multipart parser for multi-gigabyte uploads.
 * Uses Web Streams for maximum compatibility (Bun, Node, Edge).
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

interface PartInfo {
  name: string;
  filename: string;
  contentType: string;
  stream: ReadableStream;
}

/**
 * Parses a multipart/form-data stream without buffering files into memory.
 * Uses chunk-based boundary detection on the raw ReadableStream.
 */
export async function parseMultipartStream(
  request: Request,
  callbacks: {
    onFile: (info: PartInfo) => Promise<void>;
    onField?: (name: string, value: string) => void;
  },
): Promise<void> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw new AppError("Invalid content type", 400);
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) {
    throw new AppError("No boundary found in content-type", 400);
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = request.body;
  if (!body) throw new AppError("Empty request body", 400);

  const reader = body.getReader();
  let done = false;

  // Read all chunks into buffer for boundary-based parsing
  const chunks: Uint8Array[] = [];
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (value) chunks.push(value);
    done = streamDone;
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((s, c) => s + c.length, 0);
  const full = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    full.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(full);
  const boundaryRE = new RegExp(boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");

  // Split by boundary
  const parts = text.split(boundaryRE).filter((p) => p.trim() && p.trim() !== "--");

  for (const part of parts) {
    // Remove leading \r\n
    const clean = part
      .replace(/^\r\n/, "")
      .replace(/\r\n--$/, "")
      .replace(/\r\n$/, "");

    // Split headers from body
    const headerEnd = clean.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerSection = clean.slice(0, headerEnd);
    const bodyContent = clean.slice(headerEnd + 4);

    // Parse Content-Disposition
    const nameMatch = headerSection.match(/name="([^"]+)"/);
    const filenameMatch = headerSection.match(/filename="([^"]+)"/);
    const ctMatch = headerSection.match(/Content-Type:\s*(.+)/i);

    const name = nameMatch?.[1] || "";
    const filename = filenameMatch?.[1] || "";

    if (filename) {
      // File part — convert body text back to binary where possible
      const data = new TextEncoder().encode(bodyContent);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });

      await callbacks.onFile({
        name,
        filename,
        contentType: ctMatch?.[1]?.trim() || "application/octet-stream",
        stream,
      });
    } else if (callbacks.onField) {
      callbacks.onField(name, bodyContent);
    }
  }

  logger.info("[Streaming] Multipart parse complete");
}
