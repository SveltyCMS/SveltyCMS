import { confirm, text, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureTiktok() {
	// SveltyCMS Title
	Title();

	// TikTok configuration
	const USE_TIKTOK = await confirm({
		message: 'Enable TikTok integration?',
		initial: false
	});

	let TIKTOK_TOKEN = '';

	if (USE_TIKTOK) {
		TIKTOK_TOKEN = await text({
			message: 'Enter your TikTok API Token:'
		});
	}

	// Summary
	note(`USE_TIKTOK: ${USE_TIKTOK}\n` + (USE_TIKTOK ? `TIKTOK_TOKEN: ${TIKTOK_TOKEN}\n` : ''), pc.green('Review your TikTok configuration:'));

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (!action) {
		console.log('TikTok configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	// Compile and return the configuration data
	return {
		USE_TIKTOK,
		TIKTOK_TOKEN: USE_TIKTOK ? TIKTOK_TOKEN : undefined
	};
}
