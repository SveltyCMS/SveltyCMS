/**
 * @file src/databases/mongodb/models/index.ts
 * @description Central export file for all MongoDB models
 */

// Content Structure
export { ContentStructureModel, registerContentStructureDiscriminators } from './contentStructure';
export type { CategoryDocument, CollectionDocument, ContentStructureDocument } from './contentStructure';

// Content Node - Use ContentStructureModel as ContentNodeModel
export { ContentStructureModel as ContentNodeModel } from './contentStructure';

// Drafts
export { DraftModel } from './draft';

// Revisions
export { RevisionModel } from './revision';

// Media
export { MediaModel, mediaSchema } from './media';

// System Preferences
export { SystemPreferencesModel } from './systemPreferences';

// System Settings
export { SystemSettingModel } from './systemSetting';
export type { SystemSetting } from './systemSetting';

// Themes
export { ThemeModel } from './theme';

// Widgets
export { WidgetModel } from './widget';

// System Virtual Folders
export { SystemVirtualFolderModel } from './systemVirtualFolder';
