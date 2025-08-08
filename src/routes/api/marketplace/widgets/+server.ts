/**
 * @file src/routes/api/marketplace/widgets/+server.ts
 * @description API endpoint for browsing marketplace widgets
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { hasPermissionWithRoles } from '@src/auth/permissions';
import { roles } from '@root/config/roles';

// Mock marketplace widgets - replace with actual marketplace API integration
const MARKETPLACE_WIDGETS = [
	{
		id: 'premium-gallery',
		name: 'Premium Gallery',
		description: 'Advanced image gallery with lightbox, zoom, and slideshow features',
		version: '2.1.0',
		author: 'WidgetCorp',
		icon: 'mdi:view-gallery',
		price: '$29.99',
		category: 'Media',
		rating: 4.8,
		downloads: 1250,
		screenshots: ['/marketplace/premium-gallery-1.jpg', '/marketplace/premium-gallery-2.jpg'],
		dependencies: ['mediaUpload'],
		compatibility: '>=1.0.0'
	},
	{
		id: 'advanced-calendar',
		name: 'Advanced Calendar',
		description: 'Full-featured calendar widget with event management and recurring events',
		version: '1.5.2',
		author: 'CalendarPro',
		icon: 'mdi:calendar-multiple',
		price: 'Free',
		category: 'Productivity',
		rating: 4.6,
		downloads: 890,
		screenshots: ['/marketplace/calendar-1.jpg'],
		dependencies: ['date', 'dateTime'],
		compatibility: '>=1.0.0'
	},
	{
		id: 'social-media-embed',
		name: 'Social Media Embed',
		description: 'Embed content from Twitter, Instagram, YouTube, and other social platforms',
		version: '3.0.1',
		author: 'SocialWidgets',
		icon: 'mdi:share-variant',
		price: '$19.99',
		category: 'Social',
		rating: 4.9,
		downloads: 2100,
		screenshots: ['/marketplace/social-1.jpg', '/marketplace/social-2.jpg'],
		dependencies: [],
		compatibility: '>=1.2.0'
	},
	{
		id: 'ecommerce-product',
		name: 'E-commerce Product',
		description: 'Complete product widget with variants, pricing, inventory, and cart integration',
		version: '2.3.0',
		author: 'EcommercePlus',
		icon: 'mdi:shopping',
		price: '$49.99',
		category: 'E-commerce',
		rating: 4.7,
		downloads: 560,
		screenshots: ['/marketplace/ecommerce-1.jpg'],
		dependencies: ['currency', 'mediaUpload'],
		compatibility: '>=1.1.0'
	},
	{
		id: 'advanced-form-builder',
		name: 'Advanced Form Builder',
		description: 'Drag-and-drop form builder with conditional logic and validation rules',
		version: '1.8.0',
		author: 'FormMaster',
		icon: 'mdi:form-select',
		price: '$39.99',
		category: 'Forms',
		rating: 4.8,
		downloads: 720,
		screenshots: ['/marketplace/form-builder-1.jpg'],
		dependencies: ['input', 'checkbox', 'radio'],
		compatibility: '>=1.0.0'
	},
	{
		id: 'weather-widget',
		name: 'Weather Display',
		description: 'Real-time weather information with forecasts and customizable layouts',
		version: '1.2.3',
		author: 'WeatherApp',
		icon: 'mdi:weather-partly-cloudy',
		price: 'Free',
		category: 'Information',
		rating: 4.4,
		downloads: 1800,
		screenshots: ['/marketplace/weather-1.jpg'],
		dependencies: [],
		compatibility: '>=1.0.0'
	}
];

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = locals;

		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Check permission
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to marketplace API due to insufficient permissions`);
			throw error(403, 'Insufficient permissions');
		}

		// Get query parameters for filtering/searching
		const category = url.searchParams.get('category');
		const search = url.searchParams.get('search');
		const sort = url.searchParams.get('sort') || 'downloads'; // downloads, rating, name, price
		const order = url.searchParams.get('order') || 'desc'; // asc, desc

		let widgets = [...MARKETPLACE_WIDGETS];

		// Filter by category
		if (category && category !== 'all') {
			widgets = widgets.filter((w) => w.category.toLowerCase() === category.toLowerCase());
		}

		// Search functionality
		if (search) {
			const searchLower = search.toLowerCase();
			widgets = widgets.filter(
				(w) =>
					w.name.toLowerCase().includes(searchLower) ||
					w.description.toLowerCase().includes(searchLower) ||
					w.author.toLowerCase().includes(searchLower)
			);
		}

		// Sort widgets
		widgets.sort((a, b) => {
			let comparison = 0;

			switch (sort) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'rating':
					comparison = a.rating - b.rating;
					break;
				case 'downloads':
					comparison = a.downloads - b.downloads;
					break;
				case 'price': {
					const priceA = a.price === 'Free' ? 0 : parseFloat(a.price.replace('$', ''));
					const priceB = b.price === 'Free' ? 0 : parseFloat(b.price.replace('$', ''));
					comparison = priceA - priceB;
					break;
				}
			}

			return order === 'desc' ? -comparison : comparison;
		});

		logger.debug(`Retrieved ${widgets.length} marketplace widgets (filtered: category=${category}, search=${search})`);

		return json({
			widgets,
			total: widgets.length,
			filters: {
				category,
				search,
				sort,
				order
			}
		});
	} catch (err) {
		const message = `Failed to get marketplace widgets: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};
