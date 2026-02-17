/**
 * @file src/databases/mongodb/models/index.ts
 * @description Central export file for all MongoDB models
 *
 * Features:
 * - Exports all models
 * - Exports all model types
 * - Exports all model schemas
 * - Exports all model discriminators
 */

export type { CategoryDocument, CollectionDocument, ContentStructureDocument } from './contentStructure';
// Content Structure
// Content Node - Use ContentStructureModel as ContentNodeModel
export { ContentStructureModel, ContentStructureModel as ContentNodeModel, registerContentStructureDiscriminators } from './contentStructure';

// Drafts
export { DraftModel } from './draft';
// Media
export { MediaModel, mediaSchema } from './media';
// Revisions
export { RevisionModel } from './revision';

// System Preferences
export { SystemPreferencesModel } from './systemPreferences';
export type { SystemSetting } from './systemSetting';
// System Settings
export { SystemSettingModel } from './systemSetting';
// System Virtual Folders
export { SystemVirtualFolderModel } from './systemVirtualFolder';
export type { Tenant, TenantQuota, TenantUsage } from './tenant';
// Tenants
export { TenantModel } from './tenant';
// Themes
export { ThemeModel } from './theme';
// Website Tokens
export { WebsiteTokenModel } from './websiteToken';
// Widgets
export { WidgetModel } from './widget';
