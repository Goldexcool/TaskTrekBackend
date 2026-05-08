const { connectDB, disconnectDB, clearCollections, createTestUser, createTestTenant, app, request } = require('./helpers');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');

beforeAll(() => connectDB());
afterAll(() => disconnectDB());
beforeEach(() => clearCollections(User, Tenant));

describe('POST /api/tenants — create tenant', () => {
  it('creates a tenant and sets caller as owner', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Acme Corp', description: 'Test org' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Acme Corp');
    expect(res.body.data.slug).toBe('acme-corp');
    expect(res.body.data.members[0].role).toBe('owner');
  });

  it('auto-generates a unique slug', async () => {
    const { accessToken: t1 } = await createTestUser({ username: 'u1', email: 'u1@test.com' });
    const { accessToken: t2 } = await createTestUser({ username: 'u2', email: 'u2@test.com' });

    await request(app).post('/api/tenants').set('Authorization', `Bearer ${t1}`).send({ name: 'Same Name' });
    const res = await request(app).post('/api/tenants').set('Authorization', `Bearer ${t2}`).send({ name: 'Same Name' });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe('same-name-1');
  });

  it('rejects missing name', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/tenants').send({ name: 'No Auth' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/tenants — list my tenants', () => {
  it('returns only tenants the user belongs to', async () => {
    const { user: u1, accessToken: t1 } = await createTestUser({ username: 'own1', email: 'own1@test.com' });
    const { accessToken: t2 } = await createTestUser({ username: 'own2', email: 'own2@test.com' });

    await createTestTenant(u1._id, { name: 'Org A' });

    const res1 = await request(app).get('/api/tenants').set('Authorization', `Bearer ${t1}`);
    const res2 = await request(app).get('/api/tenants').set('Authorization', `Bearer ${t2}`);

    expect(res1.status).toBe(200);
    expect(res1.body.data.length).toBe(1);
    expect(res2.body.data.length).toBe(0);
  });
});

describe('GET /api/tenants/current — resolve tenant context', () => {
  it('resolves tenant via x-tenant-id header', async () => {
    const { user, accessToken } = await createTestUser();
    const tenant = await createTestTenant(user._id, { name: 'My Org' });

    const res = await request(app)
      .get('/api/tenants/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('My Org');
  });

  it('resolves tenant via x-tenant-slug header', async () => {
    const { user, accessToken } = await createTestUser();
    const tenant = await createTestTenant(user._id, { name: 'Slug Org' });

    const res = await request(app)
      .get('/api/tenants/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-slug', tenant.slug);

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe(tenant.slug);
  });

  it('returns 400 when no tenant context provided', async () => {
    const { accessToken } = await createTestUser();
    const res = await request(app)
      .get('/api/tenants/current')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 when user is not a member of the tenant', async () => {
    const { user: owner } = await createTestUser({ username: 'owner1', email: 'owner1@test.com' });
    const { accessToken: otherToken } = await createTestUser({ username: 'other1', email: 'other1@test.com' });
    const tenant = await createTestTenant(owner._id, { name: 'Private Org' });

    const res = await request(app)
      .get('/api/tenants/current')
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-tenant-id', tenant._id.toString());

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/tenants/:tenantId — update tenant', () => {
  it('owner can update the tenant name', async () => {
    const { user, accessToken } = await createTestUser();
    const tenant = await createTestTenant(user._id, { name: 'Old Name' });

    const res = await request(app)
      .patch(`/api/tenants/${tenant._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString())
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
  });

  it('non-member cannot update', async () => {
    const { user: owner } = await createTestUser({ username: 'ownerU', email: 'ownerU@test.com' });
    const { accessToken: strangerToken } = await createTestUser({ username: 'strangerU', email: 'strangerU@test.com' });
    const tenant = await createTestTenant(owner._id, { name: 'Protected' });

    const res = await request(app)
      .patch(`/api/tenants/${tenant._id}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .set('x-tenant-id', tenant._id.toString())
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/tenants/:tenantId/members — add member', () => {
  it('owner can add a member by email', async () => {
    const { user: owner, accessToken } = await createTestUser({ username: 'ownerM', email: 'ownerM@test.com' });
    const { user: newUser } = await createTestUser({ username: 'newbie', email: 'newbie@test.com' });
    const tenant = await createTestTenant(owner._id, { name: 'Growing Org' });

    const res = await request(app)
      .post(`/api/tenants/${tenant._id}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString())
      .send({ email: 'newbie@test.com', role: 'member' });

    expect(res.status).toBe(201);
    const members = res.body.data;
    expect(members.some(m => m.user.toString() === newUser._id.toString())).toBe(true);
  });

  it('cannot add the same member twice', async () => {
    const { user: owner, accessToken } = await createTestUser({ username: 'ownerD', email: 'ownerD@test.com' });
    const { user: dupe } = await createTestUser({ username: 'dupeuser', email: 'dupe@test.com' });
    const tenant = await createTestTenant(owner._id, { name: 'No Dupes' });

    await request(app)
      .post(`/api/tenants/${tenant._id}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString())
      .send({ email: 'dupe@test.com', role: 'member' });

    const res = await request(app)
      .post(`/api/tenants/${tenant._id}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString())
      .send({ email: 'dupe@test.com', role: 'member' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/tenants/:tenantId — delete tenant', () => {
  it('owner can delete the tenant', async () => {
    const { user, accessToken } = await createTestUser();
    const tenant = await createTestTenant(user._id, { name: 'Doomed Org' });

    const res = await request(app)
      .delete(`/api/tenants/${tenant._id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString());

    expect(res.status).toBe(200);
    const deleted = await Tenant.findById(tenant._id);
    expect(deleted.status).toBe('deleted');
  });

  it('member cannot delete the tenant', async () => {
    const { user: owner } = await createTestUser({ username: 'delOwner', email: 'delOwner@test.com' });
    const { user: member, accessToken: memberToken } = await createTestUser({ username: 'delMember', email: 'delMember@test.com' });
    const tenant = await Tenant.create({
      name: 'Safe Org',
      owner: owner._id,
      members: [
        { user: owner._id, role: 'owner', status: 'active', joinedAt: new Date() },
        { user: member._id, role: 'member', status: 'active', joinedAt: new Date() }
      ],
      status: 'active'
    });

    const res = await request(app)
      .delete(`/api/tenants/${tenant._id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('x-tenant-id', tenant._id.toString());

    expect(res.status).toBe(403);
  });
});

describe('POST /api/tenants/:tenantId/switch', () => {
  it('sets the active tenant on the user', async () => {
    const { user, accessToken } = await createTestUser();
    const tenant = await createTestTenant(user._id, { name: 'Switch Target' });

    const res = await request(app)
      .post(`/api/tenants/${tenant._id}/switch`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-tenant-id', tenant._id.toString());

    expect(res.status).toBe(200);
    const updated = await User.findById(user._id);
    expect(updated.currentTenant.toString()).toBe(tenant._id.toString());
  });
});
