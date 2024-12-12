/**
 * @file src/collections/categories.ts
 * @description Category configuration generated from folder structure
 *
 * ⚠️ WARNING: This is an auto-generated file.
 * DO NOT MODIFY DIRECTLY - Changes will be overwritten by the CMS.
 *
 * This file is generated from:
 * 1. Folder structure in config/collections/
 * 2. GUI & System updates via src/routes/api/categories
 *
 * Translations and metadata are stored in the database, not in this file.
 */


import type { CollectionData } from './types';

// Auto-generated category configuration
export const categoryConfig: Record<string, CollectionData> = {
    Collections: {
        uuid: '3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d',
        icon: 'bi:folder',
        name: 'Collections',
        subcategories: {
            Posts: {
                uuid: '8d9e0f1a-2b3c-4d5e-6f7g-8h9i0j1k2l3m',
                icon: 'bi:folder',
                name: 'Posts',
                subcategories: {
                    Posts: {
                        uuid: 'n4o5p6q7-r8s9-t0u1-v2w3-x4y5z6a7b8c9',
                        icon: 'bi:file-text',
                        name: 'Posts',
                        isCollection: true
                    }
                }
            },
            Media: {
                uuid: 'd0e1f2g3-h4i5-j6k7-l8m9-n0o1p2q3r4s5',
                icon: 'bi:image',
                name: 'Media',
                isCollection: true
            },
            Names: {
                uuid: 't6u7v8w9-x0y1-z2a3-b4c5-d6e7f8g9h0i1',
                icon: 'bi:person',
                name: 'Names',
                isCollection: true
            },
            Relation: {
                uuid: 'j2k3l4m5-n6o7-p8q9-r0s1-t2u3v4w5x6y7',
                icon: 'bi:link',
                name: 'Relation',
                isCollection: true
            },
            WidgetTest: {
                uuid: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
                icon: 'bi:grid',
                name: 'Widget Test',
                isCollection: true
            },
            ImageArray: {
                uuid: 'p6q7r8s9-t0u1-v2w3-x4y5-z6a7b8c9d0e1f2',
                icon: 'bi:images',
                name: 'Image Array',
                isCollection: true
            }
        }
    },
    Menu: {
        uuid: 'g8h9i0j1-k2l3-m4n5-o6p7-q8r9s0t1u2v3',
        icon: 'bi:folder',
        name: 'Menu',
        subcategories: {
            Menu: {
                uuid: 'c4d5e6f7-g8h9-i0j1-k2l3-m4n5o6p7q8',
                icon: 'bi:list',
                name: 'Menu',
                isCollection: true
            }
        }
    }
};
