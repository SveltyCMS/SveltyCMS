import { confirm, text, note } from '@clack/prompts';
import pc from 'picocolors';
import { Title } from '../cli-installer.js';

export async function configureOpenAI() {
	// SveltyCMS Title
	Title();

	// OpenAI configuration
	const USE_OPENAI = await confirm({
		message: 'Enable OpenAI integration?',
		initialValue: false
	});

	let VITE_OPEN_AI_KEY = '';

	if (USE_OPENAI) {
		VITE_OPEN_AI_KEY = await text({
			message: 'Enter your OpenAI API Key:',
			placeholder: 'see https://beta.openai.com/account/api-keys'
		});
	}

	// Summary
	note(`USE_OPENAI: ${USE_OPENAI}\n` + (USE_OPENAI ? `VITE_OPEN_AI_KEY: ${VITE_OPEN_AI_KEY}\n` : ''), pc.green('Review your OpenAI configuration:'));

	const action = await confirm({
		message: 'Is the above configuration correct?',
		initial: true
	});

	if (!action) {
		console.log('OpenAI configuration canceled.');
		process.exit(0); // Exit with code 0
	}

	// Compile and return the configuration data
	return {
		USE_OPENAI,
		VITE_OPEN_AI_KEY: USE_OPENAI ? VITE_OPEN_AI_KEY : undefined
	};
}
