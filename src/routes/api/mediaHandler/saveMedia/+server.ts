import type { RequestHandler } from '@sveltejs/kit';
import logger from '@src/utils/logger';
import { dbAdapter } from "@src/databases/db";

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.formData();
  try {
    if (dbAdapter === null) {
      logger.error('Database adapter is not initialized.');
      return new Response('Database adapter is not initialized', { status: 500 });
    }
    const files = data.getAll('files');
    if (files.length === 0) {
      logger.error('No files received');
      return new Response('No files received', { status: 400 });
    }
    const medias = []
    for (const file of files) {
      const media = {
        _id: file._id,
        name: file.name,
        type: file.type,
        size: file.size,
        data: file.data,
      };
      medias.push(media);
    }
    logger.info(`Saving media: ${JSON.stringify(medias)}`);
    const dbResponse = await dbAdapter.insertMany("media", medias);
    return new Response(JSON.stringify({ data: dbResponse }), { status: 200 });
  } catch (error) {
    console.error('Error saving media:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
