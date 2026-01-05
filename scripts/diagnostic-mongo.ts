import { MongoClient } from 'mongodb';

async function testConnection() {
	const urls = ['mongodb://localhost:27017', 'mongodb://127.0.0.1:27017'];

	for (const url of urls) {
		console.log(`Testing ${url}...`);
		const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
		try {
			await client.connect();
			console.log(`✅ Connected to ${url}`);
			const db = client.db('admin');
			try {
				const status = await db.command({ serverStatus: 1 });
				console.log(`✅ serverStatus successful on ${url}`);
			} catch (e) {
				console.log(`❌ serverStatus failed on ${url}: ${e.message}`);
			}
			await client.close();
		} catch (e) {
			console.log(`❌ Failed to connect to ${url}: ${e.message}`);
		}
	}
}

testConnection();
