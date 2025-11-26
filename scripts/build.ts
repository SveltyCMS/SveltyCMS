/**
 * @file scripts/build.ts
 * @description Smart build script for production
 */

import { spawn } from 'child_process';

const args = process.argv.slice(2);
const buildAll = args.includes('--all');

function printBanner(text: string) {
	const colors = {
		green: '\x1b[32m',
		reset: '\x1b[0m',
		bold: '\x1b[1m'
	};

	const width = 65;
	const padding = Math.max(0, Math.floor((width - text.length - 2) / 2));

	console.log(
		`\n${colors.green}╔${'═'.repeat(width)}╗${colors.reset}\n${colors.green}║${' '.repeat(padding)}${colors.bold}${text}${colors.reset}${colors.green}${' '.repeat(width - padding - text.length)}║${colors.reset}\n${colors.green}╚${'═'.repeat(width)}╝${colors.reset}\n`
	);
}

function runBuild(target: string): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log(`\n📦 Building: ${target}\n`);

		const child = spawn('bunx', ['nx', 'build', target], {
			stdio: 'inherit',
			shell: true,
			env: {
				...process.env,
				NODE_OPTIONS: '--no-warnings --no-deprecation',
				FORCE_COLOR: '1'
			}
		});

		child.on('error', (error) => {
			console.error(`❌ Failed to build ${target}:`, error);
			reject(error);
		});

		child.on('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`${target} build exited with code ${code}`));
			} else {
				console.log(`✅ ${target} built successfully\n`);
				resolve();
			}
		});
	});
}

async function main() {
	try {
		printBanner('🏗️  SveltyCMS Build');

		if (buildAll) {
			console.log('🔧 Building all apps...\n');
			await runBuild('setup-wizard');
			await runBuild('cms');
			console.log('\n✅ All builds completed successfully!');
		} else {
			// Default: build CMS only
			await runBuild('cms');
		}
	} catch (error) {
		console.error('\n❌ Build failed:', error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
