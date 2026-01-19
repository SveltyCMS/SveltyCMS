import fs from 'fs';

const usedKeys = fs.readFileSync('used_keys.txt', 'utf-8').split('\n').filter(Boolean);
const locales = ['en', 'de'];

locales.forEach((locale) => {
	const filePath = `messages/${locale}.json`;
	if (fs.existsSync(filePath)) {
		const messages = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		const newMessages = { $schema: messages.$schema };

		let count = 0;
		usedKeys.forEach((key) => {
			if (messages[key]) {
				newMessages[key] = messages[key];
				count++;
			}
		});

		fs.writeFileSync(filePath, JSON.stringify(newMessages, null, 4));
		console.log(`Pruned ${locale}.json: kept ${count} keys.`);
	}
});
