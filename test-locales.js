/**
 * Quick test to check LOCALES value in database
 */
import mongoose from 'mongoose';

const connectionString = 'mongodb://localhost:27017/SveltyCMS';

console.log('Connecting to MongoDB...');
await mongoose.connect(connectionString);

const db = mongoose.connection.db;
const collection = db.collection('system_settings');

console.log('\n🔍 Checking LOCALES in database...\n');

const localeSetting = await collection.findOne({ key: 'LOCALES' });

console.log('Full Document:');
console.log(JSON.stringify(localeSetting, null, 2));

if (localeSetting) {
	console.log('\n📊 Analysis:');
	console.log('- key:', localeSetting.key);
	console.log('- value type:', typeof localeSetting.value);
	console.log('- value:', localeSetting.value);
	console.log('- Is Array?:', Array.isArray(localeSetting.value));

	if (Array.isArray(localeSetting.value)) {
		console.log('- Array length:', localeSetting.value.length);
		console.log('- Array items:', localeSetting.value);
	}

	console.log('- category:', localeSetting.category);
	console.log('- scope:', localeSetting.scope);
}

await mongoose.connection.close();
console.log('\n✅ Done');
