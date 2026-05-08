const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let mongod;

async function connectDB() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false
  });
}

async function disconnectDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
}

async function clearCollections(...models) {
  for (const Model of models) {
    await Model.deleteMany({});
  }
}

async function createTestUser(overrides = {}) {
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(overrides.password || 'Password123!', salt);
  const user = await User.create({
    username: overrides.username || `user_${Date.now()}`,
    email: overrides.email || `user_${Date.now()}@test.com`,
    password: hashed,
    name: overrides.name || 'Test User'
  });
  // JWT_SECRET === ACCESS_TOKEN_SECRET in test env so one token works for all routes
  const accessToken = jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { user, accessToken };
}

async function createTestTenant(ownerId, overrides = {}) {
  return Tenant.create({
    name: overrides.name || `Org ${Date.now()}`,
    owner: ownerId,
    members: [{ user: ownerId, role: 'owner', status: 'active', joinedAt: new Date() }],
    status: 'active',
    ...overrides
  });
}

module.exports = { connectDB, disconnectDB, clearCollections, createTestUser, createTestTenant, app, request };
