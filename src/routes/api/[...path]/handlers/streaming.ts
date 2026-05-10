/**
 * @file src/routes/api/[...path]/handlers/streaming.ts
 * @description Utility for streaming JSON responses to improve TTFB and memory usage.
 */

// No imports needed here currently

/**
 * Creates a streaming JSON response for an array of items.
 * @param event The RequestEvent
 * @param iterator An async generator or array that yields items
 * @param totalCount Optional total count for metadata
 */
export function streamingJsonResponse(iterator: AsyncIterable<any> | any[], totalCount?: number) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send header
      controller.enqueue(encoder.encode('{"success":true,"data":['));

      let first = true;
      try {
        for await (const item of iterator as any) {
          if (!first) {
            controller.enqueue(encoder.encode(","));
          }
          controller.enqueue(encoder.encode(JSON.stringify(item)));
          first = false;
        }
      } catch (err) {
        console.error("[Streaming] Error during stream:", err);
        // We can't change the status code here as it's already sent
        // But we can append an error object if the JSON hasn't closed
      }

      // Send footer
      const metadata = totalCount !== undefined ? `,"metadata":{"totalCount":${totalCount}}` : "";
      controller.enqueue(encoder.encode(`]${metadata}}`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
