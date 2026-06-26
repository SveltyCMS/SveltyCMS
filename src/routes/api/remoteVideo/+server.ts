import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Lazy-cached video module — avoids parsing heavy SDK deps on cold start
let _videoModule: typeof import("@widgets/custom/remote-video/video") | null = null;

/**
 * @file src/routes/api/remoteVideo/+server.ts
 * @description Secure server-side endpoint for fetching remote video metadata.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.url) {
      return json({ success: false, error: "URL required in valid JSON body" }, { status: 400 });
    }
    const { url, allowedPlatforms } = body;

    // Lazy-load video module
    if (!_videoModule) {
      _videoModule = await import("@widgets/custom/remote-video/video");
    }
    const { getRemoteVideoData, detectPlatform } = _videoModule;

    // Detect platform from URL
    const parsed = detectPlatform(url);
    if (!parsed) {
      return json({ success: false, error: "Invalid or unsupported video URL" }, { status: 400 });
    }

    // Security: Validate against allowed platforms if provided
    if (
      allowedPlatforms &&
      allowedPlatforms.length > 0 &&
      !allowedPlatforms.includes(parsed.platform)
    ) {
      return json(
        {
          success: false,
          error: `Platform '${parsed.platform}' is not allowed for this field.`,
        },
        { status: 403 },
      );
    }

    // Fetch metadata using server-side credentials
    const data = await getRemoteVideoData(url);
    if (!data) {
      return json(
        {
          success: false,
          error: "Could not fetch video metadata. Please check the URL and try again.",
        },
        { status: 404 },
      );
    }

    return json({ success: true, data });
  } catch (err: any) {
    return json(
      {
        success: false,
        error: err.message || "Internal server error",
      },
      { status: 500 },
    );
  }
};
