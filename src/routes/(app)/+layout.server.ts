/**
 * @file src/routes/(app)/+layout.server.ts
 * @description
 * This file is the server-side logic for the all collection data
 */

import type { LayoutServerLoad } from './$types';
import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals }) => {
  const { theme, user } = locals;

  try {
    await contentManager.initialize();

    const { contentStructure } = await contentManager.getCollectionData();

    return {
      theme: theme || DEFAULT_THEME,
      contentStructure: contentStructure,
    };
  } catch (error) {
    console.error('Failed to load layout data:', error);
    logger.error('Failed to load layout data:', error);

    // Return fallback data
    return {
      theme: theme || DEFAULT_THEME,
      user,
      contentStructure: [],
      error: 'Failed to load collection data'
    };
  }
};
