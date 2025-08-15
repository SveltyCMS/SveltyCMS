import type { LayoutData } from './$types';
import { setPublicSettings } from '@src/stores/publicSettings';

export const ssr = false;
export const prerender = false;

export function load({ data }: { data: LayoutData }) {
	// Use settings from server instead of global store
	const { settings } = data;

	// Initialize the public settings store with server data
	setPublicSettings(settings);

	return {
		settings // Pass settings to components
	};
}
