import type { Plugin } from '@src/plugins/types';

export const cookieConsentPlugin: Plugin = {
	metadata: {
		id: 'cookie-consent',
		name: 'Cookie Consent Manager',
		version: '1.0.0',
		description: 'GDPR-compliant cookie banner and consent management system.',
		icon: 'mdi:cookie-cog',
		enabled: true
	},
	config: {
		public: {
			position: 'center', // 'bottom' | 'center'
			privacyPolicyUrl: '/privacy'
		}
	}
};
