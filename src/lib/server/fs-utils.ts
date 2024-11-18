/**
 * Server-only file system utilities
 * This file should only be imported in server-side code
 */

import fs from 'fs/promises';
import path from 'path';

export async function readConfigFile(configPath: string) {
    try {
        const fullPath = path.resolve(configPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading config file: ${error}`);
        throw error;
    }
}

export async function writeConfigFile(configPath: string, data: any) {
    try {
        const fullPath = path.resolve(configPath);
        await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing config file: ${error}`);
        throw error;
    }
}
