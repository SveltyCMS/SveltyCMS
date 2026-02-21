/**
 * @file src/routes/setup/presets.ts
 * @description Defines available setup presets and starter kits for SveltyCMS.
 * @author SveltyCMS
 */

export interface Preset {
	complexity?: 'simple' | 'moderate' | 'advanced';
	description: string;
	features: string[];
	icon: string;
	id: string;
	title: string;
}

export const PRESETS: Preset[] = [
	{
		id: 'blank',
		title: 'Blank Project',
		description: 'Start from scratch with a clean slate.',
		icon: 'mdi:file-outline',
		features: ['Core System', 'No Collections', 'Basic Settings'],
		complexity: 'simple'
	},
	{
		id: 'demo',
		title: 'Demo / Test Suite',
		description: 'Comprehensive test suite with all widget types and nested collections.',
		icon: 'mdi:test-tube',
		features: ['All Widgets', 'Deep Nesting', 'Relations', 'Menu Structure'],
		complexity: 'advanced'
	},
	{
		id: 'blog',
		title: 'Blog / Editorial',
		description: 'Classic blog setup with posts, categories, and authors.',
		icon: 'mdi:post-outline',
		features: ['Posts Collection', 'Categories', 'Authors', 'SEO Config'],
		complexity: 'simple'
	},
	{
		id: 'agency',
		title: 'Agency / Portfolio',
		description: 'Showcase work, services, and client testimonials.',
		icon: 'mdi:briefcase-outline',
		features: ['Projects & Portfolio', 'Services', 'Clients', 'Testimonials'],
		complexity: 'moderate'
	},
	{
		id: 'saas',
		title: 'SaaS Product',
		description: 'Documentation, features, and pricing management.',
		icon: 'mdi:cloud-outline',
		features: ['Documentation', 'Pricing Plans', 'Features', 'Changelog'],
		complexity: 'moderate'
	},
	{
		id: 'corporate',
		title: 'Corporate Site',
		description: 'Professional presence with team, careers, and locations.',
		icon: 'mdi:domain',
		features: ['Team Members', 'Careers / Jobs', 'Locations', 'Press'],
		complexity: 'moderate'
	},
	{
		id: 'ecommerce',
		title: 'E-commerce',
		description: 'Complete online store with products, orders, and customers.',
		icon: 'mdi:shopping-outline',
		features: ['Products & Variants', 'Orders & Customers', 'Price & Repeater Widgets', 'CRM Basics'],
		complexity: 'advanced'
	}
];
