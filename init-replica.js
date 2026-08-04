const { PrismaClient } = require('@prisma/client');

async function main() {
  // Connect WITHOUT replicaSet to initiate the replica set
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'mongodb://127.0.0.1:27017/admin?directConnection=true'
      }
    }
  });
  
  try {
    await prisma.$connect();
    console.log('Connected to MongoDB (admin database)');
    
    console.log('Initializing replica set...');
    const result = await prisma.$runCommandRaw({
      replSetInitiate: {
        _id: 'rs0',
        members: [{ _id: 0, host: '127.0.0.1:27017' }]
      }
    });
    console.log('Replica set initiated:', JSON.stringify(result));
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected');
  }
}

