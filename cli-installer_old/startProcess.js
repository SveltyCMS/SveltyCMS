import { spawn } from 'child_process';
import { select } from '@clack/prompts';

export async function startProcess() {
	try {
		const { startProcess } = await select({
			message: 'Do you want to start the dev or build process?',
			choices: [
				{ name: 'Start dev process', value: 'dev', hint: 'Default' },
				{ name: 'Start build process', value: 'build' },
				{ name: 'Exit', value: 'exit' }
			]
		});

		if (startProcess === 'dev') {
			const devProcess = spawn('pnpm', ['run', 'dev'], { shell: true, stdio: 'inherit' });
			devProcess.on('exit', (code) => {
				console.log(`Dev process exited with code ${code}`);
			});
		} else if (startProcess === 'build') {
			const buildProcess = spawn('pnpm', ['run', 'build'], { shell: true, stdio: 'inherit' });
			buildProcess.on('exit', (code) => {
				console.log(`Build process exited with code ${code}`);
			});
		} else {
			console.log('Exiting...');
		}
	} catch (error) {
		console.error('An error occurred while starting the process:', error);
	}
}
