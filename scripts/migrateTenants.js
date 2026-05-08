/**
 * Tenant migration script.
 *
 * For every user who owns at least one Team with no tenant assigned,
 * this script:
 *   1. Creates a default Tenant named after the user.
 *   2. Assigns all of that user's Teams, Boards, Columns, Tasks,
 *      Activities, and Notifications to the new Tenant.
 *   3. Adds all team members and board members as Tenant members.
 *   4. Sets the user's currentTenant to the new Tenant.
 *
 * Idempotent: already-migrated documents (tenant field already set) are skipped.
 *
 * Usage:
 *   node scripts/migrateTenants.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Inline minimal models to avoid loading the full app
const Tenant  = require('../src/models/Tenant');
const User    = require('../src/models/User');
const Team    = require('../src/models/Team');
const Board   = require('../src/models/Board');
const Column  = require('../src/models/Column');
const Task    = require('../src/models/Task');
const Activity     = require('../src/models/Activity');
const Notification = require('../src/models/Notification');

const log = (msg) => console.log(`[migrate] ${msg}`);

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  log('Connected to MongoDB');

  // Find teams that have no tenant yet
  const unmigratedTeams = await Team.find({ tenant: { $exists: false } });
  if (unmigratedTeams.length === 0) {
    log('No un-migrated teams found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Group teams by owner
  const byOwner = {};
  for (const team of unmigratedTeams) {
    const ownerId = team.owner.toString();
    if (!byOwner[ownerId]) byOwner[ownerId] = [];
    byOwner[ownerId].push(team);
  }

  log(`Found ${unmigratedTeams.length} un-migrated teams across ${Object.keys(byOwner).length} owner(s)`);

  for (const [ownerId, teams] of Object.entries(byOwner)) {
    const owner = await User.findById(ownerId);
    if (!owner) {
      log(`  Owner ${ownerId} not found — skipping`);
      continue;
    }

    // Check if owner already has a default tenant
    let tenant = await Tenant.findOne({ owner: ownerId, status: 'active' });
    if (!tenant) {
      tenant = await Tenant.create({
        name: `${owner.name || owner.username}'s Organization`,
        owner: ownerId,
        members: [{ user: ownerId, role: 'owner', status: 'active', joinedAt: new Date() }],
        status: 'active'
      });
      log(`  Created tenant "${tenant.name}" (${tenant._id}) for owner ${owner.email}`);
    } else {
      log(`  Owner ${owner.email} already has tenant "${tenant.name}" (${tenant._id}) — reusing`);
    }

    const tenantId = tenant._id;

    // Collect all unique user IDs from team members for tenant membership
    const memberUserIds = new Set([ownerId]);

    for (const team of teams) {
      await Team.findByIdAndUpdate(team._id, { tenant: tenantId });
      log(`    Migrated team "${team.name}"`);

      for (const m of team.members || []) {
        if (m.user) memberUserIds.add(m.user.toString());
      }

      // Boards belonging to this team
      const boards = await Board.find({ team: team._id, tenant: { $exists: false } });
      const boardIds = boards.map(b => b._id);

      if (boardIds.length > 0) {
        await Board.updateMany({ _id: { $in: boardIds } }, { tenant: tenantId });
        log(`    Migrated ${boardIds.length} board(s) for team "${team.name}"`);

        // Collect board member user IDs
        for (const board of boards) {
          for (const m of board.members || []) {
            if (m.user) memberUserIds.add(m.user.toString());
          }
        }

        // Columns
        const colResult = await Column.updateMany(
          { board: { $in: boardIds }, tenant: { $exists: false } },
          { tenant: tenantId }
        );
        log(`    Migrated ${colResult.modifiedCount} column(s)`);

        // Tasks
        const taskResult = await Task.updateMany(
          { board: { $in: boardIds }, tenant: { $exists: false } },
          { tenant: tenantId }
        );
        log(`    Migrated ${taskResult.modifiedCount} task(s)`);

        // Activities
        const actResult = await Activity.updateMany(
          { boardId: { $in: boardIds }, tenant: { $exists: false } },
          { tenant: tenantId }
        );
        log(`    Migrated ${actResult.modifiedCount} activity record(s) for boards`);
      }

      // Team-scoped activities
      const teamActResult = await Activity.updateMany(
        { teamId: team._id, tenant: { $exists: false } },
        { tenant: tenantId }
      );
      log(`    Migrated ${teamActResult.modifiedCount} team activity record(s)`);
    }

    // Migrate user-scoped activities (by user, no board/team)
    const userActResult = await Activity.updateMany(
      { user: ownerId, tenant: { $exists: false } },
      { tenant: tenantId }
    );
    log(`  Migrated ${userActResult.modifiedCount} user activity record(s) for owner`);

    // Migrate notifications for owner
    const notifResult = await Notification.updateMany(
      { recipient: ownerId, tenant: { $exists: false } },
      { tenant: tenantId }
    );
    log(`  Migrated ${notifResult.modifiedCount} notification(s) for owner`);

    // Add all collected members to the tenant (skip those already present)
    const existingMemberIds = new Set(tenant.members.map(m => m.user.toString()));
    const toAdd = [...memberUserIds].filter(id => !existingMemberIds.has(id));

    if (toAdd.length > 0) {
      const newMembers = toAdd.map(uid => ({
        user: uid,
        role: 'member',
        status: 'active',
        joinedAt: new Date()
      }));
      await Tenant.findByIdAndUpdate(tenantId, { $push: { members: { $each: newMembers } } });
      log(`  Added ${toAdd.length} member(s) to tenant`);
    }

    // Set owner's currentTenant if not set
    if (!owner.currentTenant) {
      await User.findByIdAndUpdate(ownerId, { currentTenant: tenantId });
      log(`  Set currentTenant for owner ${owner.email}`);
    }
  }

  log('Migration complete.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
