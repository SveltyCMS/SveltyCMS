/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { ContentStructure } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Content structure schema for categories and collections
export const contentStructureSchema = new Schema(
    {
        _id: { type: String, required: true },  // UUID from compiled collection
        name: { type: String, required: true },
        path: { type: String, required: true, unique: true },  // Always starts with /collections/
        icon: { type: String, default: 'bi:file-text' },  // Default icon for collections
        order: { type: Number, default: 999 },
        translations: [{
            languageTag: String,
            translationName: String
        }],
        isCollection: { type: Boolean, default: true },  // Default to true since we're syncing collections
        collectionConfig: { type: Schema.Types.Mixed },  // Store the full collection config
        updatedAt: { type: Date, default: Date.now }
    },
    {
        timestamps: true,
        collection: 'system_content_structure',
        strict: false, // Allow additional fields from collection config
        autoIndex: false,
    }
);

// // Add indexes
// contentStructureSchema.index({ path: 1 }, { unique: true });
contentStructureSchema.index({ isCollection: 1 });
contentStructureSchema.index({ order: 1 });

// Static methods for the ContentStructure model
contentStructureSchema.statics = {
    // Create content structure
    async createContentStructure(contentData: {
        name: string;
        parent?: string;
        path: string;
        icon?: string;
        order?: number;
        isCollection?: boolean;
        collectionId?: string;
        translations?: { languageTag: string; translationName: string; }[];
        _id?: string;
    }): Promise<Document> {
        try {
            const node = new this(contentData);
            await node.save();
            logger.info(`Created content structure node: \x1b[34m${contentData.path}\x1b[0m`);
            return node;
        } catch (error) {
            logger.error(`Error creating content structure: ${error.message}`);
            throw error;
        }
    },

    // Get all content structure nodes
    async getContentStructure(): Promise<Document[]> {
        try {
            const nodes = await this.find().sort({ order: 1 }).exec();
            logger.debug(`Retrieved \x1b[34m${nodes.length}\x1b[0m content structure nodes`);
            return nodes;
        } catch (error) {
            logger.error(`Error retrieving content structure: ${error.message}`);
            throw error;
        }
    },

    // Get children of a specific path
    async getContentStructureChildren(parentPath: string): Promise<Document[]> {
        try {
            const nodes = await this.find({
                path: new RegExp(`^${parentPath}/[^/]+$`)
            }).sort({ order: 1 }).exec();
            logger.debug(`Retrieved \x1b[34m${nodes.length}\x1b[0m children for path: \x1b[34m${parentPath}\x1b[0m`);
            return nodes;
        } catch (error) {
            logger.error(`Error retrieving content structure children: ${error.message}`);
            throw error;
        }
    },

    // Get content structure by ID
    async getContentStructureById(id: string): Promise<Document | null> {
        try {
            const node = await this.findById(id).exec();
            logger.debug(`Retrieved content structure node: \x1b[34m${id}\x1b[0m`);
            return node;
        } catch (error) {
            logger.error(`Error retrieving content structure by ID: ${error.message}`);
            throw error;
        }
    },

    // Update content structure
    async updateContentStructure(contentId: string, updateData: Partial<ContentStructure>): Promise<Document | null> {
        try {
            const node = await this.findByIdAndUpdate(contentId, updateData, { new: true }).exec();
            if (node) {
                logger.info(`Updated content structure node: \x1b[34m${contentId}\x1b[0m`);
            } else {
                logger.warn(`Content structure node not found: \x1b[34m${contentId}\x1b[0m`);
            }
            return node;
        } catch (error) {
            logger.error(`Error updating content structure: ${error.message}`);
            throw error;
        }
    },

    // Delete content structure
    async deleteContentStructure(contentId: string): Promise<boolean> {
        try {
            const result = await this.findByIdAndDelete(contentId).exec();
            if (result) {
                logger.info(`Deleted content structure node: \x1b[34m${contentId}\x1b[0m`);
                return true;
            }
            logger.warn(`Content structure node not found for deletion: \x1b[34m${contentId}\x1b[0m`);
            return false;
        } catch (error) {
            logger.error(`Error deleting content structure: ${error.message}`);
            throw error;
        }
    }
};

// Create and export the ContentStructure model
export const ContentStructureModel = mongoose.models?.ContentStructure ||
    mongoose.model<ContentStructure>('ContentStructure', contentStructureSchema);
