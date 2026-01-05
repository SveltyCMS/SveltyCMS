import { MongoClient } from 'mongodb';

async function testInsert() {
	const url = 'mongodb://localhost:27017';
	console.log(`Testing unauthenticated insert into sveltycms_test on ${url}...`);
	const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
	try {
		await client.connect();
		console.log(`✅ Connected to ${url}`);
		const db = client.db('sveltycms_test');
		try {
			const result = await db.collection('test_auth').insertOne({ test: true, date: new Date() });
			console.log(`✅ Insert successful! ID: ${result.insertedId}`);
			await db.collection('test_auth').deleteOne({ _id: result.insertedId });
			console.log(`✅ Cleanup successful`);
		} catch (e) {
			console.log(`❌ Insert failed: ${e.message}`);
		}
		await client.close();
	} catch (e) {
		console.log(`❌ Failed to connect: ${e.message}`);
	}
}

testInsert();
