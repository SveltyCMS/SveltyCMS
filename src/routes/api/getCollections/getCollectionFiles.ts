/**
 * @file src/routes/api/getCollections/getCollectionFiles.ts
 * @description
 * Asynchronous utility function for retrieving collection files.
 * This version only checks the compiled collections folder and relies on the server hooks for caching.
 */

import { browser } from '$app/environment';

// System Logger
import { logger } from '@utils/logger.svelte';

// Custom error type for collection-related errors
class CollectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CollectionError';
        // Set the prototype explicitly to ensure instanceof works correctly
        Object.setPrototypeOf(this, CollectionError.prototype);
    }
}

// Define types for Node.js modules
type FSModule = typeof import('fs/promises');
type PathModule = typeof import('path');
type CryptoModule = typeof import('crypto');

interface ServerModules {
    fs: FSModule;
    path: PathModule;
    crypto: CryptoModule;
    compiledCollectionsFolder: string; // Changed to compiledCollectionsFolder
}


interface FileInfo {
    name: string;
    mtime: number;
    size: number;
}

// Module cache
let moduleCache: ServerModules | null = null;


// Create a module loader that only runs on the server
const loadServerModules = async (): Promise<ServerModules | null> => {
    if (browser) return null;
    if (moduleCache) return moduleCache;

    try {
        const [fs, path, crypto] = await Promise.all([
            import('fs/promises') as Promise<FSModule>,
            import('path') as Promise<PathModule>,
            import('crypto') as Promise<CryptoModule>
        ]);

        moduleCache = {
            fs,
            path,
            crypto,
            compiledCollectionsFolder: path.join(import.meta.env.root, 'collections'), // Only compiled collections folder
        };
        return moduleCache;
    } catch (error) {
        logger.error('Failed to load server modules:', error);
        return null;
    }
};


// Optimized recursive file scanning with batch processing
async function getAllFiles(dir: string, fs: FSModule, path: PathModule, batchSize = 50): Promise<string[]> {
    const results: string[] = [];
    const queue: string[] = [dir];

    while (queue.length > 0) {
        const batch = queue.splice(0, batchSize);
        const batchPromises = batch.map(async (currentDir) => {
            try {
                const entries = await fs.readdir(currentDir, { withFileTypes: true });
                const subResults: string[] = [];

                for (const entry of entries) {
                    const fullPath = path.join(currentDir, entry.name);
                    if (entry.isDirectory()) {
                        queue.push(fullPath);
                    } else {
                        subResults.push(fullPath);
                    }
                }
                return subResults;
            } catch (error) {
                logger.error(`Error scanning directory ${currentDir}:`, error);
                return [];
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.flat());
    }
    return results;
}

// Get collection files with optimized scanning
export async function getCollectionFiles(userId?: string): Promise<string[]> {
    if (browser) {
        throw new CollectionError('This function is server-only.');
    }

    const modules = await loadServerModules();
    if (!modules) {
        throw new CollectionError('Failed to load server modules');
    }

    const { fs, path, compiledCollectionsFolder } = modules;

    try {
         // Create the compiled directory if needed
         await fs.mkdir(compiledCollectionsFolder, { recursive: true });

        // Get all files in the compiled folder
        const allFiles = await getAllFiles(compiledCollectionsFolder, fs, path);

        // Filter files, only keep javascript files
        const filteredFiles = allFiles.filter((file) => {
            const ext = path.extname(file);
            return ext === '.js';
        });

        if (filteredFiles.length === 0) {
             logger.warn('No valid collection files found');
             return [];
        }

       return filteredFiles;
    } catch (error) {
        logger.error('Error reading collection files', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw new CollectionError(`Failed to read collection files: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Helper function to check if a file is a valid collection file
export async function isValidCollectionFile(filePath: string): Promise<boolean> {
    if (browser) return false;
    const modules = await loadServerModules();
    if (!modules) return false;
    const { fs, path } = modules;

    try {
        // Check file extension - we only want Javascript files
        if (path.extname(filePath) !== '.js') {
            return false;
        }
        // Check if file exists and is readable
        await fs.access(filePath, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}