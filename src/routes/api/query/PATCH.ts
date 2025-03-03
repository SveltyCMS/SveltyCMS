/**
 * @file src/routes/api/query/PATCH.ts
 * @description Handler for PATCH operations on collections.
 *
 * This module provides functionality to:
 * - Update documents in a specified collection
 * - Perform pre-update modifications via modifyRequest
 * - Track performance metrics
 *
 * Features:
 * - Document update support
 * - Pre-update request modification
 * - Performance monitoring
 * - Comprehensive error handling and logging
 */

import type { Schema } from '@root/src/content/types';
import type { User } from '@src/auth/types';


// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';
import { dbAdapter } from '@root/src/databases/db';

// Function to handle PATCH requests for a specified collection
export async function _PATCH({ data, schema, user }: { data: FormData; schema: Schema; user: User }) {
  const start = performance.now();
  try {
    logger.debug(`PATCH request received for schema: ${schema._id}, user_id: ${user._id}`);
    if (!dbAdapter) throw new Error('Database adapter not initialized');

    // Validate schema._id
    if (!schema._id) {
      logger.error('Invalid or undefined schema._id.');
      return new Response('Invalid schema._id', { status: 400 });
    }

    // Get collection models
    const collection = contentManager.getCollectionModelById(schema._id);
    if (!collection) {
      logger.error(`Collection not found for schema._id: ${schema._id}`);
      return new Response('Collection not found', { status: 404 });
    }
    const body: Record<string, unknown> = {};
    const fileIDS: string[] = [];

    for (const [key, value] of data.entries()) {
      try {
        body[key] = JSON.parse(value as string, (_, val) => {
          if (val?.instanceof === 'File') {
            fileIDS.push(val.id);
            return data.get(val.id) as File;
          }
          return val;
        });
      } catch {
        body[key] = value;
      }
    }

    //// Parse update data
    //const updateData = data.get('data');
    //if (!updateData) {
    //  logger.error('No update data provided');
    //  return new Response('No update data provided', { status: 400 });
    //}
    //
    //const parsedData = JSON.parse(updateData as string);

    // Perform pre-update modifications with performance tracking
    const modifyStart = performance.now();
    const result = await modifyRequest({
      data: [body],
      collection,
      fields: schema.fields,
      user,
      type: 'PATCH'
    });
    const modifyDuration = performance.now() - modifyStart;
    logger.debug(`Request modifications completed in ${modifyDuration.toFixed(2)}ms`);

    // Update the document
    const updateStart = performance.now();
    const updateResult = await dbAdapter.crud.updateOne(`collection_${schema._id}`, { _id: body._id }, result[0]);
    const updateDuration = performance.now() - updateStart;
    logger.debug(`Document update completed in ${updateDuration.toFixed(2)}ms`);

    const totalDuration = performance.now() - start;
    logger.info(`PATCH operation completed in ${totalDuration.toFixed(2)}ms for schema: ${schema._id}`, { user: user._id });

    // Return the result with performance metrics
    return new Response(
      JSON.stringify({
        success: true,
        result: updateResult,
        performance: {
          total: totalDuration,
          modify: modifyDuration,
          update: updateDuration
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  } catch (error) {
    const duration = performance.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`PATCH operation failed after ${duration.toFixed(2)}ms for schema: ${schema._id}: ${errorMessage}`, { stack: errorStack });
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        performance: {
          total: duration
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  }
}
