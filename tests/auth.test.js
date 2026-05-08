const { connectDB, disconnectDB, clearCollections, app, request } = require('./helpers');
const User = require('../src/models/User');

beforeAll(() => connectDB());
afterAll(() => disconnectDB());
beforeEach(() => clearCollections(User));

describe('POST /api/auth/signup', () => {
  const valid = { username: 'alice', email: 'alice@test.com', password: 'Password123!' };

  it('creates a user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/signup').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(valid.email);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/signup').send(valid);
    const res = await request(app).post('/api/auth/signup').send(valid);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send({
      username: 'bob', email: 'bob@test.com', password: 'Password123!'
    });
  });

  it('returns tokens on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@test.com', password: 'Password123!'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'bob@test.com', password: 'wrongpassword'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects non-existent user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@test.com', password: 'Password123!'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/refresh-token', () => {
  it('issues a new access token from valid refresh token', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      username: 'carol', email: 'carol@test.com', password: 'Password123!'
    });
    const { refreshToken } = signup.body;

    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: 'bad.token.here' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user when authenticated', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      username: 'dave', email: 'dave@test.com', password: 'Password123!'
    });
    const { accessToken } = signup.body;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data?.email || res.body.user?.email).toBe('dave@test.com');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
