/**
 * @file src/utils/globalSearchIndex.ts
 * @description
 * This file implements a global search index functionality for a web application.
 * It provides a centralized search mechanism across various parts of the application.
 * Key features include:
 *
 * - Creation and management of a global search index using Svelte stores
 * - Predefined search data for common application areas (Home, Marketplace, User Profile, etc.)
 * - Support for search triggers with associated actions and paths
 * - Functions to add new items to the search index
 * - Search functionality to query the global index
 * - Integration with system logging for tracking search-related activities
 * - Initialization function for setting up the global search functionality
 *
 * The global search index is designed to improve navigation and discoverability
 * within the application, allowing users to quickly find and access different
 * features and content areas.
 *
 * @module GlobalSearchIndex
 */

import { writable } from 'svelte/store';
import { modalState } from '@utils/modalState.svelte';
import ModalEditAvatar from '@src/routes/(app)/user/components/ModalEditAvatar.svelte';
import ModalEditForm from '@src/routes/(app)/user/components/ModalEditForm.svelte';

// System Logs
import { logger } from '@utils/logger';

export const isSearchVisible = writable(false);
export const triggerActionStore = writable<(() => void | Promise<void>)[]>([]);

// Create a writable store for the global search index
export interface SearchData {
	title: string;
	description: string;
	keywords: string[];
	triggers: {
		[title: string]: {
			path: string;
			action?: (() => void | Promise<void>)[];
		};
	};
}

// Initialize the global search index with predefined data
export const globalSearchIndex = writable<SearchData[]>([
	{
		title: 'Home',
		description: 'The home page of the blog.',
		keywords: ['home', 'dashboard'],
		triggers: { 'Go to Home Page': { path: '/' } }
	},
	{
		title: 'Marketplace',
		description: 'SveltCMS Widget Marketplace.',
		keywords: ['widget', 'marketplace', 'plugins', 'extensions'],
		triggers: { 'Go to Marketplace': { path: 'https://www.sveltycms.com' } }
	},
	{
		title: 'GraphQL Yoga',
		description: 'GraphQL Explorer',
		keywords: ['graphQL', 'Explorer', 'Yoga', 'API', 'query'],
		triggers: { 'Go to GraphQL Explorer': { path: '/api/graphql' } }
	},
	{
		title: 'User Profile',
		description: 'View and edit your user profile.',
		keywords: ['user', 'avatar', 'profile', 'settings', 'account', 'password', 'delete'],
		triggers: {
			'Show User Profile': { path: '/user' },
			'Edit Avatar Image': {
				path: '/user',
				action: [
					() => {
						modalState.trigger(ModalEditAvatar, {
							title: 'Edit Avatar',
							body: 'Upload or change your avatar image'
						});
					}
				]
			},
			'Edit User Profile': {
				path: '/user',
				action: [
					() => {
						modalState.trigger(ModalEditForm, {
							title: 'Edit Profile',
							body: 'Modify your data and then press Save.'
						});
					}
				]
			}
		}
	},
	{
		title: 'User Admin Area',
		description: 'View and edit users in the user admin area.',
		keywords: ['user', 'role', 'profile', 'settings', 'account', 'password', 'token', 'admin'],
		triggers: {
			'Show User Admin': { path: '/user' }
		}
	},
	{
		title: 'Media Gallery',
		description: 'View and edit your media gallery.',
		keywords: ['media', 'gallery', 'images', 'videos', 'documents', 'files'],
		triggers: {
			'Go to Media Gallery': { path: '/mediagallery' }
		}
	},
	{
		title: 'Add Media',
		description: 'Add new media to gallery.',
		keywords: ['add', 'media', 'gallery', 'images', 'videos', 'documents', 'upload'],
		triggers: {
			'Go to Add Media': { path: '/mediagallery/uploadMedia' }
		}
	},
	{
		title: 'Image Editor',
		description: 'Edit and manage images with the image editor.',
		keywords: ['image', 'editor', 'edit', 'photos', 'media', 'crop', 'resize'],
		triggers: {
			'Go to Image Editor': { path: '/imageEditor' }
		}
	},
	{
		title: 'System Dashboard',
		description: 'View and manage your dashboard.',
		keywords: ['dashboard', 'profile', 'settings', 'load', 'system', 'overview'],
		triggers: { 'Go to Dashboard': { path: '/dashboard' } }
	},
	{
		title: 'Configuration',
		description: 'Configure the system settings.',
		keywords: ['configuration', 'settings', 'system', 'setup'],
		triggers: { 'Go to Configuration': { path: '/config' } }
	},
	{
		title: 'System Builder',
		description: 'Build and customize your collections.',
		keywords: ['builder', 'category', 'collection', 'configuration', 'settings', 'system', 'permissions'],
		triggers: { 'Go to System Builder': { path: '/config/collectionbuilder' } }
	},
	{
		title: 'Access Management',
		description: 'Manage user access and permissions.',
		keywords: ['access', 'management', 'permissions', 'roles', 'users', 'security'],
		triggers: {
			'Go to Access Management': { path: '/config/accessManagement' }
		}
	},
	{
		title: 'Roles',
		description: 'Manage user roles in the system.',
		keywords: ['roles', 'user roles', 'permissions', 'access', 'security'],
		triggers: {
			'Manage Roles': { path: '/config/accessManagement/roles' }
		}
	},
	{
		title: 'Permissions',
		description: 'Configure and manage system permissions.',
		keywords: ['permissions', 'access control', 'security', 'roles'],
		triggers: {
			'Manage Permissions': { path: '/config/accessManagement/permissions' }
		}
	},
	{
		title: 'Theme Management',
		description: 'Customize the look and feel of your site.',
		keywords: ['theme', 'appearance', 'design', 'colors', 'layout', 'customize'],
		triggers: {
			'Customize Theme': { path: '/config/themeManagement' }
		}
	},
	{
		title: 'Widget Management',
		description: 'Extend the functionality of your site.',
		keywords: ['widget', 'extension', 'customization', 'plugins'],
		triggers: {
			'Customize Widget': { path: '/config/widgetManagement' }
		}
	}
]);

logger.info('Global search index initialized');

// Function to add new items to the global search index
export function addToGlobalSearchIndex(newItem: SearchData) {
	globalSearchIndex.update((currentIndex) => [...currentIndex, newItem]);
	logger.info(`Added new item to global search index: ${newItem.title}`);
}

// Function to search the global index
export function searchGlobalIndex(query: string): SearchData[] {
	let results: SearchData[] = [];
	globalSearchIndex.subscribe((index) => {
		results = index.filter(
			(item) =>
				item.title.toLowerCase().includes(query.toLowerCase()) ||
				item.description.toLowerCase().includes(query.toLowerCase()) ||
				item.keywords.some((keyword) => keyword.toLowerCase().includes(query.toLowerCase()))
		);
	})();
	return results;
}

// Initialize the global search functionality
export function initializeGlobalSearch() {
	// This function can be called to set up any necessary event listeners or initial state
	logger.info('Global search functionality initialized');
}
