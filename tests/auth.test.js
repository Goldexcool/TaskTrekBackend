const { connectDB, disconnectDB, clearCollections, app, request } = require('./helpers');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');

beforeAll(() => connectDB());
afterAll(() => disconnectDB());
beforeEach(() => clearCollections(User, Tenant));
afterEach(() => jest.restoreAllMocks());

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

  it('creates a personal workspace during signup when setupType is personal', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      ...valid,
      email: 'personal@test.com',
      username: 'personal-user',
      setupType: 'personal',
      workspace: {
        name: 'Personal HQ',
        description: 'My personal workspace'
      },
      jobTitle: 'Engineer'
    });

    expect(res.status).toBe(201);
    expect(res.body.workspace).toBeDefined();
    expect(res.body.workspace.name).toBe('Personal HQ');
    expect(res.body.currentTenantId).toBe(String(res.body.workspace._id));

    const dbUser = await User.findOne({ email: 'personal@test.com' });
    const dbTenant = await Tenant.findById(res.body.currentTenantId);

    expect(dbUser.currentTenant.toString()).toBe(res.body.currentTenantId);
    expect(dbUser.tenants).toHaveLength(1);
    expect(dbTenant.owner.toString()).toBe(dbUser._id.toString());
    expect(dbTenant.members[0].role).toBe('owner');
    expect(dbTenant.settings.onboarding.setupType).toBe('personal');
    expect(dbTenant.settings.onboarding.jobTitle).toBe('Engineer');
  });

  it('creates a team workspace during signup when setupType is team', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      ...valid,
      email: 'team@test.com',
      username: 'team-user',
      setupType: 'team',
      workspace: {
        name: 'Launch Team'
      },
      teamSize: '11-50'
    });

    expect(res.status).toBe(201);
    expect(res.body.workspace).toBeDefined();

    const dbTenant = await Tenant.findById(res.body.currentTenantId);
    expect(dbTenant.settings.onboarding.setupType).toBe('team');
    expect(dbTenant.settings.onboarding.teamSize).toBe('11-50');
  });

  it('keeps the old signup flow working when no workspace is provided', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      username: 'legacy-user',
      email: 'legacy@test.com',
      password: 'Password123!'
    });

    expect(res.status).toBe(201);
    expect(res.body.workspace).toBeNull();
    expect(res.body.currentTenantId).toBeNull();

    const dbUser = await User.findOne({ email: 'legacy@test.com' });
    const tenantCount = await Tenant.countDocuments({});
    expect(dbUser.currentTenant).toBeNull();
    expect(tenantCount).toBe(0);
  });

  it('rolls back the user if workspace creation fails', async () => {
    jest.spyOn(Tenant, 'create').mockRejectedValueOnce(new Error('workspace create failed'));

    const res = await request(app).post('/api/auth/signup').send({
      username: 'rollback-user',
      email: 'rollback@test.com',
      password: 'Password123!',
      setupType: 'team',
      workspace: { name: 'Broken Workspace' }
    });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);

    const dbUser = await User.findOne({ email: 'rollback@test.com' });
    const tenantCount = await Tenant.countDocuments({});
    expect(dbUser).toBeNull();
    expect(tenantCount).toBe(0);
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
