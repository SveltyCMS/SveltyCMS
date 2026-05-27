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
		features: ['All Widgets', 'Deep Nesting', 'Relations', 'Menu Structure', 'Revision History'],
		complexity: 'advanced'
	},
	{
		id: 'blog',
		title: 'Blog / Editorial',
		description: 'Classic blog setup with posts, categories, and authors. Perfect for content creators.',
		icon: 'mdi:post-outline',
		features: ['Posts Collection', 'Categories', 'Authors', 'SEO Config', 'Rich Text Editing'],
		complexity: 'simple'
	},
	{
		id: 'agency',
		title: 'Agency / Portfolio',
		description: 'Showcase work, services, and client testimonials. Optimized for agencies.',
		icon: 'mdi:briefcase-outline',
		features: ['Projects & Portfolio', 'Services', 'Clients', 'Testimonials', 'Media Library'],
		complexity: 'moderate'
	},
	{
		id: 'saas',
		title: 'SaaS Product',
		description: 'Documentation, features, and pricing management for modern SaaS applications.',
		icon: 'mdi:cloud-outline',
		features: ['Documentation', 'Pricing Plans', 'Features', 'Changelog', 'Multi-tenant Support'],
		complexity: 'moderate'
	},
	{
		id: 'corporate',
		title: 'Corporate Site',
		description: 'Professional presence with team, careers, and locations. Built for large organizations.',
		icon: 'mdi:domain',
		features: ['Team Members', 'Careers / Jobs', 'Locations', 'Press', 'Audit Logs'],
		complexity: 'moderate'
	},
	{
		id: 'ecommerce',
		title: 'E-commerce',
		description: 'Complete online store with products, orders, and customers. Ready for scale.',
		icon: 'mdi:shopping-outline',
		features: ['Products & Variants', 'Orders & Customers', 'Price & Repeater Widgets', 'CRM Basics', 'Inventory Tracking'],
		complexity: 'advanced'
	}
];
