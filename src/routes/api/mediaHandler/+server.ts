import type { RequestHandler } from '@sveltejs/kit';
import logger from '@src/utils/logger';
import { dbAdapter } from "@src/databases/db";

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.formData();
  const image = data.get("image")

  if (!image || !image._id) {
    logger.error('Invalid image data received');
    return new Response('Invalid image data received', { status: 400 });
  }

  if (!dbAdapter) {
    logger.error('Database adapter is not initialized.');
    return new Response('Internal Server Error', { status: 500 });
  }

  try {
    logger.info(`Deleting image: ${image._id}`);
    const success = await dbAdapter.deleteMedia(image._id.toString());

    if (success) {
      logger.info('Image deleted successfully');
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      return new Response('Failed to delete image', { status: 500 });
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
