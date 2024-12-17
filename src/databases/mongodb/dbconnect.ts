/**
 * @file src/databases/mongodb/dbconnect.ts
 * @description MongoDB connection logic for the CMS.
 *
 * This module provides functions for connecting to MongoDB, handling connection retries,
 * and logging errors.
 */

import { privateEnv } from '@root/config/private';

import mongoose from 'mongoose';
import type { ConnectOptions } from 'mongoose';

// System Logging
import { logger } from '@utils/logger.svelte';

const MAX_RETRIES = privateEnv.DB_RETRY_ATTEMPTS || 3; // Maximum number of DB connection retries

export async function connectToMongoDB(): Promise<void> {
    const isAtlas = privateEnv.DB_HOST.startsWith('mongodb+srv://');

    // Construct the connection string
    let connectionString: string;
    if (isAtlas) {
        connectionString = `${privateEnv.DB_HOST}/${privateEnv.DB_NAME}`;
    } else {
        connectionString = `${privateEnv.DB_HOST}${privateEnv.DB_PORT ? `:${privateEnv.DB_PORT}` : ''}/${privateEnv.DB_NAME}`;
    }

    // Set connection options
    const options: ConnectOptions = {
        authSource: isAtlas ? undefined : 'admin', // Only use authSource for local connection
        user: privateEnv.DB_USER,
        pass: privateEnv.DB_PASSWORD,
        dbName: privateEnv.DB_NAME,
        maxPoolSize: privateEnv.DB_POOL_SIZE || 5,
        retryWrites: true,
        serverSelectionTimeoutMS: 5000, // 5 seconds timeout for server selection
    };

    // Use Mongoose's built-in retry logic
    mongoose.connection.on('connected', () => {
        logger.info('MongoDB connection established successfully.');
    });

    mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB connection lost. Attempting to reconnect...');
    });

    mongoose.connection.on('error', (err) => {
        logger.error(`MongoDB connection error: ${err.message}`);
    });


    let lastError: unknown;
    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            await mongoose.connect(connectionString, options);
            logger.debug(`Successfully connected to MongoDB database: \x1b[34m${privateEnv.DB_NAME}\x1b[0m`);
            return;
        } catch (error) {
            lastError = error;
            if (i === MAX_RETRIES) {
                logger.error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts: ${lastError}`);
                throw new Error('MongoDB connection failed');
            }
            logger.warn(`Connection attempt ${i}/${MAX_RETRIES} failed, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * i)); // Exponential backoff
        }
    }
}