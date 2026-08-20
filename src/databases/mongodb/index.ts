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

export type {
  CategoryDocument,
  CollectionDocument,
  ContentStructureDocument,
} from "./content-structure";
// Content Structure
// Content Node - Use ContentStructureModel as ContentNodeModel
export {
  ContentStructureModel,
  ContentStructureModel as ContentNodeModel,
  registerContentStructureDiscriminators,
} from "./content-structure";

// Drafts
export { DraftModel } from "./draft";
// Media
export { MediaModel, mediaSchema } from "./media";
// Revisions
export { RevisionModel } from "./revision";
// System Preferences
export type { SystemSetting } from "./system-module";
// System Settings
export { SystemSettingModel, systemSettingSchema } from "./system-module";
// System Virtual Folders
export { SystemVirtualFolderModel } from "./system-virtual-folder";
export type { Tenant, TenantQuota, TenantUsage } from "./tenant";
// Tenants
export { TenantModel } from "./tenant";
// Themes
export { ThemeModel } from "./theme";
// Website Tokens
export { WebsiteTokenModel } from "./website-token";
// Widgets
export { WidgetModel } from "./widget";
