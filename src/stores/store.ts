import { PUBLIC_LANGUAGE } from '$env/static/public';
import { writable, type Writable } from 'svelte/store';

// Store selection Collection
export const entryData: any = writable(undefined);

// Store entered Fields data
export const getFieldsData: Writable<Set<() => Promise<any>>> = writable(new Set());

// Store entered Fields data
export const MenuCurrentChild: Writable<any> = writable(undefined);

// Store selected content language
export const language: Writable<string> = writable(PUBLIC_LANGUAGE);

// Store image data while editing
export const saveEditedImage: Writable<boolean> = writable(false);

// Store image data while editing
export const toggleLeftSidebar: Writable<boolean> = writable(true);
