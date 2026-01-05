import { MongoClient } from 'mongodb';

async function testRead() {
	const url = 'mongodb://localhost:27017';
	console.log(`Testing unauthenticated read from sveltycms_test.auth_users on ${url}...`);
	const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
	try {
		await client.connect();
		console.log(`✅ Connected to ${url}`);
		const db = client.db('sveltycms_test');
		try {
			const count = await db.collection('auth_users').countDocuments();
			console.log(`✅ Read successful! User count: ${count}`);
		} catch (e) {
			console.log(`❌ Read failed: ${e.message}`);
		}
		await client.close();
	} catch (e) {
		console.log(`❌ Failed to connect: ${e.message}`);
	}
}

testRead();
