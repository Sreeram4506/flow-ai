const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    await prisma.$connect();
    console.log('Connected to MongoDB via Prisma');
    
    // Try to get replica set status first
    try {
      const status = await prisma.$runCommandRaw({ replSetGetStatus: 1 });
      console.log('Replica set status:', JSON.stringify(status));
      console.log('Replica set already initialized!');
    } catch (e) {
      console.log('Error getting status:', e.message);
      
      // If not initialized, try to initiate
      if (e.message.includes('No replica set') || e.message.includes('NoReplicationEnabled')) {
        console.log('Initializing replica set...');
        try {
          const result = await prisma.$runCommandRaw({
            replSetInitiate: {
              _id: 'rs0',
              members: [{ _id: 0, host: '127.0.0.1:27017' }]
            }
          });
          console.log('Replica set initiated:', JSON.stringify(result));
        } catch (initErr) {
          console.log('Init error:', initErr.message);
        }
      }
    }
  } catch (e) {
    console.log('Connection error:', e.message);
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected');
  }
}

main();
