const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server');
const seedDatabase = require('./seedDatabase');

async function verify() {
  process.env.NODE_ENV = 'test';
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  await seedDatabase(uri, false);

  const server = app.listen(0);
  const port = server.address().port;

  const res = await axios.get(`http://localhost:${port}/api/nodes`);
  console.log('HTTP Status:', res.status);
  console.log('Count:', res.data.count);
  console.log('Sample Node JSON:\n', JSON.stringify(res.data.data[0], null, 2));

  let valid = true;
  for (const node of res.data.data) {
    if (!node.mapPosition || node.mapPosition.x === undefined || node.mapPosition.y === undefined) {
      console.error(`Missing mapPosition on node: ${node.name} (${node.hubId})`);
      valid = false;
    }
    if (!node.dimensions || !node.dimensions.width || !node.dimensions.depth || !node.dimensions.height) {
      console.error(`Missing dimensions on node: ${node.name} (${node.hubId})`);
      valid = false;
    }
    if (!node.zone) {
      console.error(`Missing zone on node: ${node.name} (${node.hubId})`);
      valid = false;
    }
  }

  if (valid && res.data.count === 16) {
    console.log('\n✅ ALL 16 NODES VERIFIED: mapPosition, dimensions, and zone returned accurately for every building!');
  } else {
    console.error('❌ Validation failed.');
  }

  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(valid ? 0 : 1);
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
