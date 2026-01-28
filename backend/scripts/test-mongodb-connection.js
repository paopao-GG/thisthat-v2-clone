// Quick MongoDB connection test
// Run with: node test-mongodb-connection.js

import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function testConnection() {
  try {
    console.log('🔌 Attempting to connect to MongoDB...');
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');

    // List all databases
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();

    console.log('\n📚 Available databases:');
    databases.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });

    // Check thisthat_test database
    const db = client.db('thisthat_test');
    const collections = await db.listCollections().toArray();

    console.log('\n📁 Collections in thisthat_test:');
    for (const collection of collections) {
      const count = await db.collection(collection.name).countDocuments();
      console.log(`  - ${collection.name}: ${count} documents`);
    }

    // Show sample document
    const marketsCollection = db.collection('markets');
    const sampleMarket = await marketsCollection.findOne();

    console.log('\n📄 Sample market document:');
    console.log('  Question:', sampleMarket.question);
    console.log('  Status:', sampleMarket.status);
    console.log('  THIS:', sampleMarket.thisOption);
    console.log('  THAT:', sampleMarket.thatOption);

    console.log('\n✅ MongoDB is working correctly!');
    console.log('👉 Use this connection string in Compass: mongodb://localhost:27017');

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.close();
  }
}

testConnection();
