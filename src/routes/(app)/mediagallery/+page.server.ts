/**
 * @file src/routes/(app)/mediagallery/+page.server.ts
 * @description Server-side logic for the media gallery page.
 *
 * This module handles:
 * - Fetching media files from various collections (images, documents, audio, video)
 * - Fetching virtual folders
 * - File upload processing for different media types
 * - Error handling and logging
 *
 * The load function prepares data for the media gallery, including user information,
 * a list of all media files, and virtual folders. The actions object defines the
 * server-side logic for handling file uploads.
 */
import { publicEnv } from '@root/config/public';

import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// Utils
import { saveImage, saveDocument, saveAudio, saveVideo } from '@utils/media/mediaProcessing';
import { constructUrl } from '@utils/media/mediaUtils';

// Auth
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger, type LoggableValue } from '@utils/logger.svelte';

// Helper function to convert _id and other nested objects to string
interface StackItem {
  parent: Record<string, unknown> | Array<unknown> | null;
  key: string;
  value: unknown;
}

function convertIdToString(obj: Record<string, unknown> | Array<unknown>): Record<string, unknown> | Array<unknown> {
  const stack: StackItem[] = [{ parent: null, key: '', value: obj }];
  const seen = new WeakSet();
  const root: Record<string, unknown> | Array<unknown> = Array.isArray(obj) ? [] : {};

  while (stack.length) {
    const { parent, key, value } = stack.pop()!;
    // logger.debug('Stack: ', stack)

    // If value is not an object, assign directly
    if (value === null || typeof value !== 'object') {
      if (parent) parent[key] = value;
      continue;
    }

    // Handle circular references
    if (seen.has(value)) {
      if (parent) parent[key] = value;
      continue;
    }
    seen.add(value);

    // Initialize object or array
    const result: Record<string, unknown> | Array<unknown> = Array.isArray(value) ? [] : {};
    if (parent) parent[key] = result;

    // Process each key/value pair or array element
    for (const k in value) {
      if (value[k] === null) {
        root[k] = null;
      } else if (k === '_id' || k === 'parent') {
        root[k] = value[k]?.toString() || null;
        // Convert _id or parent to string
      } else if (Buffer.isBuffer(value[k])) {
        root[k] = value[k].toString('hex'); // Convert Buffer to hex string
      } else if (typeof value[k] === 'object') {
        // Add object to the stack for further processing
        stack.push({ parent: result, key: k, value: value[k] });
      } else {
        root[k] = value[k]; // Assign primitive values
      }
    }
  }

  return root;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!dbAdapter) {
    logger.error('Database adapter is not initialized');
    throw error(500, 'Internal Server Error');
  }

  try {
    // User is already validated in hooks.server.ts
    const { user } = locals;
    if (!user) {
      throw redirect(302, '/login');
    }

    const folderIdentifier = publicEnv.MEDIA_FOLDER;

    // Fetch media files
    const media_types = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
    const media_promises = media_types.map((type) => {
      const query = type === 'media_remote' ? { folder: folderIdentifier } : {};
      return dbAdapter && dbAdapter.crud.findMany(type, query);
    });

    let results = await Promise.all(media_promises);

    results = results.map(
      (arr, index) =>
        arr &&
        arr.map((item) =>
          convertIdToString({
            ...item,
            path: item.path ?? 'global',
            name: item.name ?? 'unnamed-media',
            type: media_types[index].split('_')[1],
            url: item.thumbnail?.url
              ? constructUrl('global', item.hash, item.thumbnail.url, item.thumbnail.url.split('.').pop(), media_types[index])
              : '',
            thumbnailUrl: item.thumbnail?.url
              ? constructUrl('global', item.hash, `${item.thumbnail.url}-thumbnail`, item.thumbnail.url.split('.').pop(), media_types[index])
              : ''
          })
        )
    );

    const media = results.flat();

    // Fetch virtual folders
    const result = await dbAdapter.virtualFolders.getAll();
    if (!result.success) {
      logger.error(`Failed to fetch virtual folders: ${result.error.message}`);
    }
    const virtualFolders = result.data;

    const serializedVirtualFolders = virtualFolders.map((folder) => convertIdToString(folder));

    logger.info(`Fetched \x1b[34m${serializedVirtualFolders.length}\x1b[0m virtual folders`);

    logger.debug('Media gallery data and virtual folders loaded successfully');
    const returnData = {
      user: {
        role: user.role,
        _id: user._id,
        avatar: user.avatar
      },
      media,
      virtualFolders: serializedVirtualFolders
    };

    // Added Debugging: Log the returnData
    logger.debug('Returning data from load function:', returnData);

    return returnData;
  } catch (err) {
    const message = `Error in media gallery load function: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
    logger.error(message);
    throw error(500, message);
  }
};

export const actions: Actions = {
  // Default action for file upload
  default: async ({ request, locals }) => {
    if (!dbAdapter) {
      logger.error('Database adapter is not initialized');
      throw error(500, 'Internal Server Error');
    }

    try {
      const user = locals.user;
      if (!user) {
        logger.warn('No user found in locals during file upload');
        throw redirect(302, '/login');
      }

      const formData = await request.formData();
      const files = formData.getAll('files');

      // Map of file types to their respective save functions
      const save_media_file = {
        application: saveDocument,
        audio: saveAudio,
        font: saveDocument,
        example: saveDocument,
        image: saveImage,
        message: saveDocument,
        model: saveDocument,
        multipart: saveDocument,
        text: saveDocument,
        video: saveVideo
      };

      const collection_names: Record<string, string> = {
        application: 'media_documents',
        audio: 'media_audio',
        font: 'media_documents',
        example: 'media_documents',
        image: 'media_images',
        message: 'media_documents',
        model: 'media_documents',
        multipart: 'media_documents',
        text: 'media_documents',
        video: 'media_videos'
      };

      for (const file of files) {
        if (file instanceof File) {
          const type = file.type.split('/')[0] as keyof typeof save_media_file;
          if (type in save_media_file) {
            const { fileInfo } = await save_media_file[type](file, collection_names[type], user._id);
            await dbAdapter.insertMany(collection_names[type], [{ ...fileInfo, user: user._id }]);
            logger.info(`File uploaded successfully: ${file.name}`);
          } else {
            logger.warn(`Unsupported file type: ${file.type}`);
          }
        }
      }

      return { success: true };
    } catch (err) {
      const message = `Error during file upload: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  },

  // Action to delete a media file
  deleteMedia: async ({ request }) => {
    logger.warn('Request Body', await request.json());
    const image = (await request.json())?.image;
    logger.debug('Received delete request for image:', image);

    if (!image || !image._id) {
      logger.error('Invalid image data received');
      throw error(400, 'Invalid image data received');
    }

    if (!dbAdapter) {
      logger.error('Database adapter is not initialized.');
      throw error(500, 'Internal Server Error');
    }

    try {
      logger.info(`Deleting image: ${image._id}`);
      const success = await dbAdapter.deleteMedia(image._id.toString());

      if (success) {
        logger.info('Image deleted successfully');
        return { success: false };
      } else {
        throw error(500, 'Failed to delete image');
      }
    } catch (err) {
      logger.error('Error deleting image:', err as LoggableValue);
      throw error(500, 'Internal Server Error');
    }
  }
};
