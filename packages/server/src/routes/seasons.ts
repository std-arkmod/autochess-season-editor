import { Hono } from 'hono'
import { eq, desc, asc, sql, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { db, schema } from '../db/index.ts'
import { authMiddleware, requireRole } from '../middleware/auth.ts'
import { notifySeasonDeleted } from '../yjs/server.ts'
import { deepSortValue, normalizeSeasonDataForRuntime } from '@autochess-editor/shared'

/** Count leaf-level differences between two values */
function countDeepChanges(a: unknown, b: unknown, depth = 0): number {
  if (depth > 4) return canonicalStringify(a) !== canonicalStringify(b) ? 1 : 0
  if (a === b) return 0
  if (a == null || b == null) return 1
  if (typeof a !== 'object' || typeof b !== 'object') return canonicalStringify(a) !== canonicalStringify(b) ? 1 : 0
  if (Array.isArray(a) && Array.isArray(b)) {
    let count = 0
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      count += countDeepChanges(a[i], b[i], depth + 1)
    }
    return count || (canonicalStringify(a) !== canonicalStringify(b) ? 1 : 0)
  }
  if (Array.isArray(a) || Array.isArray(b)) return 1
  const aObj = a as Record<string, unknown>, bObj = b as Record<string, unknown>
  const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
  let count = 0
  for (const key of allKeys) {
    if (!(key in aObj) || !(key in bObj)) { count++; continue }
    if (typeof aObj[key] === 'object' && aObj[key] !== null && typeof bObj[key] === 'object' && bObj[key] !== null) {
      count += countDeepChanges(aObj[key], bObj[key], depth + 1)
    } else if (canonicalStringify(aObj[key]) !== canonicalStringify(bObj[key])) {
      count++
    }
  }
  return count
}
import type { AutoChessSeasonData } from '@autochess-editor/shared'

/**
 * Canonical JSON stringify with sorted keys.
 * JSONB in PostgreSQL doesn't preserve key order, so we need deterministic
 * serialization for accurate equality comparison.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(v => canonicalStringify(v)).join(',') + ']'
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalStringify((value as Record<string, unknown>)[k])).join(',') + '}'
}

/**
 * Reconstruct the full season data at the latest snapshot point.
 */
async function reconstructSnapshotData(seasonId: string, upToSnapshotId?: string): Promise<Record<string, unknown>> {
  const snapshots = await db
    .select({
      id: schema.seasonSnapshots.id,
      data: schema.seasonSnapshots.data,
      snapshotType: schema.seasonSnapshots.snapshotType,
      createdAt: schema.seasonSnapshots.createdAt,
    })
    .from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.seasonId, seasonId))
    .orderBy(asc(schema.seasonSnapshots.createdAt))

  if (snapshots.length === 0) return {}

  let result: Record<string, unknown> = {}
  let foundBaseline = false

  for (const snap of snapshots) {
    if (snap.snapshotType === 'full') {
      result = { ...(snap.data as Record<string, unknown>) }
      foundBaseline = true
    } else if (foundBaseline) {
      const diff = snap.data as Record<string, unknown>
      for (const [key, entry] of Object.entries(diff)) {
        const e = entry as Record<string, unknown>
        if ('old' in e && 'new' in e) {
          // Simple old/new pair (non-dict fields like arrays)
          result[key] = e.new
        } else {
          // Sub-diff: dict field with per-entry { old, new }
          const existing = (result[key] ?? {}) as Record<string, unknown>
          const merged = { ...existing }
          for (const [subKey, subEntry] of Object.entries(e)) {
            const se = subEntry as { old: unknown; new: unknown }
            if (se.new === null) {
              delete merged[subKey]
            } else {
              merged[subKey] = se.new
            }
          }
          result[key] = merged
        }
      }
    }
    if (upToSnapshotId && snap.id === upToSnapshotId) break
  }

  return result
}

/**
 * Check if a user can access a season (owner, admin, or has permission).
 * Returns the permission role or null if no access.
 */
async function checkSeasonAccess(seasonId: string, userId: string, userRole: string): Promise<'owner' | 'admin' | 'editor' | 'viewer' | null> {
  if (userRole === 'admin') return 'admin'

  const [season] = await db
    .select({ ownerId: schema.seasons.ownerId, isTemplate: schema.seasons.isTemplate })
    .from(schema.seasons)
    .where(eq(schema.seasons.id, seasonId))

  if (!season) return null
  if (season.isTemplate) return 'viewer' // Templates are readable by all
  if (season.ownerId === userId) return 'owner'

  // Check season_permissions
  const [perm] = await db
    .select({ role: schema.seasonPermissions.role })
    .from(schema.seasonPermissions)
    .where(and(
      eq(schema.seasonPermissions.seasonId, seasonId),
      eq(schema.seasonPermissions.userId, userId),
    ))

  return (perm?.role as 'editor' | 'viewer') ?? null
}

/**
 * Check if user can edit a season.
 */
function canEdit(access: string | null): boolean {
  return access === 'owner' || access === 'admin' || access === 'editor'
}

const seasons = new Hono()
seasons.use('*', authMiddleware)

// ──────────────────── Templates (isTemplate=1) ────────────────────

// List all templates (all authenticated users can see)
seasons.get('/templates', async (c) => {
  const result = await db
    .select({
      id: schema.seasons.id,
      label: schema.seasons.label,
      version: schema.seasons.version,
      createdBy: schema.seasons.createdBy,
      createdAt: schema.seasons.createdAt,
      updatedAt: schema.seasons.updatedAt,
    })
    .from(schema.seasons)
    .where(eq(schema.seasons.isTemplate, 1))
    .orderBy(schema.seasons.updatedAt)

  return c.json({ templates: result })
})

// Get single template
seasons.get('/templates/:id', async (c) => {
  const { id } = c.req.param()

  const [season] = await db.select().from(schema.seasons)
    .where(and(eq(schema.seasons.id, id), eq(schema.seasons.isTemplate, 1)))

  if (!season) return c.json({ error: 'Template not found' }, 404)
  return c.json({ template: season })
})

// Create template (admin only)
seasons.post('/templates', requireRole('admin'), async (c) => {
  const { label, data } = await c.req.json<{ label: string; data: unknown }>()
  if (!label || !data) return c.json({ error: 'Label and data required' }, 400)

  const user = c.get('user')
  const id = nanoid()
  const now = new Date()

  await db.insert(schema.seasons).values({
    id,
    label,
    data: deepSortValue(data),
    version: 1,
    isTemplate: 1,
    ownerId: null,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
  })

  return c.json({
    template: { id, label, version: 1, createdBy: user.userId, createdAt: now, updatedAt: now }
  }, 201)
})

// Update template (admin only)
seasons.put('/templates/:id', requireRole('admin'), async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ label?: string; data?: unknown; dataPatch?: Record<string, unknown>; version: number }>()

  const [season] = await db.select().from(schema.seasons)
    .where(and(eq(schema.seasons.id, id), eq(schema.seasons.isTemplate, 1)))
  if (!season) return c.json({ error: 'Template not found' }, 404)

  if (body.version !== undefined && body.version !== season.version) {
    return c.json({ error: 'Version conflict', currentVersion: season.version }, 409)
  }

  const updates: Record<string, unknown> = { updatedAt: new Date(), version: season.version + 1 }
  if (body.label !== undefined) updates.label = body.label

  if (body.dataPatch !== undefined && Object.keys(body.dataPatch).length > 0) {
    const existing = (season.data ?? {}) as Record<string, unknown>
    updates.data = normalizeSeasonDataForRuntime({ ...existing, ...body.dataPatch } as unknown as AutoChessSeasonData)
  } else if (body.data !== undefined) {
    updates.data = normalizeSeasonDataForRuntime(body.data as unknown as AutoChessSeasonData)
  }

  await db.update(schema.seasons).set(updates).where(eq(schema.seasons.id, id))
  return c.json({ season: { ...season, ...updates } })
})

// Delete template (admin only)
seasons.delete('/templates/:id', requireRole('admin'), async (c) => {
  const { id } = c.req.param()
  await db.delete(schema.seasons).where(and(eq(schema.seasons.id, id), eq(schema.seasons.isTemplate, 1)))
  return c.body(null, 204)
})

// Fork template → create private season for user
seasons.post('/templates/:id/fork', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  if (user.role === 'viewer') return c.json({ error: 'Viewers cannot fork templates' }, 403)

  const body = await c.req.json<{ label?: string }>().catch(() => ({}))

  const [template] = await db.select().from(schema.seasons)
    .where(and(eq(schema.seasons.id, id), eq(schema.seasons.isTemplate, 1)))
  if (!template) return c.json({ error: 'Template not found' }, 404)

  const newId = nanoid()
  const now = new Date()
  const label = (body as { label?: string }).label || `${template.label} (我的副本)`

  const sortedData = normalizeSeasonDataForRuntime(template.data as unknown as AutoChessSeasonData)

  await db.insert(schema.seasons).values({
    id: newId,
    label,
    data: sortedData,
    version: 1,
    isTemplate: 0,
    ownerId: user.userId,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
  })

  // Create initial baseline snapshot so first edit produces a proper diff
  const dataJson = canonicalStringify(sortedData)
  const dataHash = createHash('sha256').update(dataJson).digest('hex')
  await db.insert(schema.seasonSnapshots).values({
    id: nanoid(),
    seasonId: newId,
    data: sortedData,
    snapshotType: 'full',
    userId: user.userId,
    description: null,
    dataHash,
    createdAt: now,
  })

  return c.json({
    season: { id: newId, label, version: 1, ownerId: user.userId, createdBy: user.userId, createdAt: now, updatedAt: now }
  }, 201)
})

// ──────────────────── Private Seasons (isTemplate=0) ────────────────────

// List user's own seasons + seasons shared with them (admin sees all)
seasons.get('/', async (c) => {
  const user = c.get('user')

  let result
  if (user.role === 'admin') {
    // Admin sees all private seasons
    result = await db
      .select({
        id: schema.seasons.id,
        label: schema.seasons.label,
        version: schema.seasons.version,
        ownerId: schema.seasons.ownerId,
        createdBy: schema.seasons.createdBy,
        createdAt: schema.seasons.createdAt,
        updatedAt: schema.seasons.updatedAt,
      })
      .from(schema.seasons)
      .where(eq(schema.seasons.isTemplate, 0))
      .orderBy(desc(schema.seasons.updatedAt))
  } else {
    // User sees own seasons + shared with them
    const ownSeasons = await db
      .select({
        id: schema.seasons.id,
        label: schema.seasons.label,
        version: schema.seasons.version,
        ownerId: schema.seasons.ownerId,
        createdBy: schema.seasons.createdBy,
        createdAt: schema.seasons.createdAt,
        updatedAt: schema.seasons.updatedAt,
      })
      .from(schema.seasons)
      .where(and(eq(schema.seasons.isTemplate, 0), eq(schema.seasons.ownerId, user.userId)))

    const sharedSeasons = await db
      .select({
        id: schema.seasons.id,
        label: schema.seasons.label,
        version: schema.seasons.version,
        ownerId: schema.seasons.ownerId,
        createdBy: schema.seasons.createdBy,
        createdAt: schema.seasons.createdAt,
        updatedAt: schema.seasons.updatedAt,
      })
      .from(schema.seasons)
      .innerJoin(schema.seasonPermissions, eq(schema.seasons.id, schema.seasonPermissions.seasonId))
      .where(and(
        eq(schema.seasons.isTemplate, 0),
        eq(schema.seasonPermissions.userId, user.userId),
      ))

    // Merge and dedup
    const seen = new Set<string>()
    result = []
    for (const s of [...ownSeasons, ...sharedSeasons]) {
      if (!seen.has(s.id)) { seen.add(s.id); result.push(s) }
    }
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  // Resolve owner display names
  const ownerIds = [...new Set(result.map(s => s.ownerId).filter(Boolean) as string[])]
  const ownerMap: Record<string, string> = {}
  if (ownerIds.length > 0) {
    const owners = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(sql`${schema.users.id} IN ${ownerIds}`)
    for (const o of owners) ownerMap[o.id] = o.displayName
  }

  // Resolve permission role for shared seasons
  const permMap: Record<string, string> = {}
  if (user.role !== 'admin') {
    const perms = await db
      .select({ seasonId: schema.seasonPermissions.seasonId, role: schema.seasonPermissions.role })
      .from(schema.seasonPermissions)
      .where(eq(schema.seasonPermissions.userId, user.userId))
    for (const p of perms) permMap[p.seasonId] = p.role
  }

  return c.json({
    seasons: result.map(s => ({
      ...s,
      ownerDisplayName: s.ownerId ? ownerMap[s.ownerId] ?? null : null,
      isOwner: s.ownerId === user.userId,
      permissionRole: s.ownerId === user.userId ? 'owner' : (user.role === 'admin' ? 'admin' : (permMap[s.id] ?? null)),
    }))
  })
})

// Get single season (with access check)
seasons.get('/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')

  const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  // Templates are readable by all
  if (season.isTemplate) return c.json({ season })

  // Private season: check access
  const access = await checkSeasonAccess(id, user.userId, user.role)
  if (!access) return c.json({ error: 'Access denied' }, 403)

  return c.json({ season })
})

// Create private season (from scratch, with data)
seasons.post('/', async (c) => {
  const user = c.get('user')
  if (user.role === 'viewer') return c.json({ error: 'Viewers cannot create seasons' }, 403)

  const { label, data } = await c.req.json<{ label: string; data: unknown }>()
  if (!label || !data) return c.json({ error: 'Label and data required' }, 400)

  const id = nanoid()
  const now = new Date()

  const sortedData = normalizeSeasonDataForRuntime(data as unknown as AutoChessSeasonData)

  await db.insert(schema.seasons).values({
    id,
    label,
    data: sortedData,
    version: 1,
    isTemplate: 0,
    ownerId: user.userId,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
  })

  // Create initial baseline snapshot
  const dataJson = canonicalStringify(sortedData)
  const dataHash = createHash('sha256').update(dataJson).digest('hex')
  await db.insert(schema.seasonSnapshots).values({
    id: nanoid(),
    seasonId: id,
    data: sortedData,
    snapshotType: 'full',
    userId: user.userId,
    description: null,
    dataHash,
    createdAt: now,
  })

  return c.json({
    season: { id, label, version: 1, ownerId: user.userId, createdBy: user.userId, createdAt: now, updatedAt: now }
  }, 201)
})

// Update season (owner/editor/admin only)
seasons.put('/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json<{ label?: string; data?: unknown; dataPatch?: Record<string, unknown>; version: number }>()

  const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  const access = await checkSeasonAccess(id, user.userId, user.role)
  if (!canEdit(access)) return c.json({ error: 'No edit permission' }, 403)

  if (body.version !== undefined && body.version !== season.version) {
    return c.json({ error: 'Version conflict', currentVersion: season.version }, 409)
  }

  const updates: Record<string, unknown> = { updatedAt: new Date(), version: season.version + 1 }
  if (body.label !== undefined) updates.label = body.label

  if (body.dataPatch !== undefined && Object.keys(body.dataPatch).length > 0) {
    const existing = (season.data ?? {}) as Record<string, unknown>
    updates.data = normalizeSeasonDataForRuntime({ ...existing, ...body.dataPatch } as unknown as AutoChessSeasonData)
  } else if (body.data !== undefined) {
    updates.data = normalizeSeasonDataForRuntime(body.data as unknown as AutoChessSeasonData)
  }

  await db.update(schema.seasons).set(updates).where(eq(schema.seasons.id, id))
  return c.json({ season: { ...season, ...updates } })
})

// Delete season (owner or admin)
seasons.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')

  const [season] = await db.select({ ownerId: schema.seasons.ownerId, isTemplate: schema.seasons.isTemplate })
    .from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  if (season.isTemplate) {
    if (user.role !== 'admin') return c.json({ error: 'Only admin can delete templates' }, 403)
  } else {
    if (season.ownerId !== user.userId && user.role !== 'admin') {
      return c.json({ error: 'Only owner or admin can delete' }, 403)
    }
  }

  await db.delete(schema.seasons).where(eq(schema.seasons.id, id))
  // Notify all connected clients and clean up WebSocket/Yjs state
  notifySeasonDeleted(id)
  return c.body(null, 204)
})

// Duplicate season (creates a new private season)
seasons.post('/:id/duplicate', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  if (user.role === 'viewer') return c.json({ error: 'Viewers cannot duplicate' }, 403)

  const [original] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!original) return c.json({ error: 'Season not found' }, 404)

  // Check access for non-templates
  if (!original.isTemplate) {
    const access = await checkSeasonAccess(id, user.userId, user.role)
    if (!access) return c.json({ error: 'Access denied' }, 403)
  }

  const newId = nanoid()
  const now = new Date()

  const sortedData = normalizeSeasonDataForRuntime(original.data as unknown as AutoChessSeasonData)

  await db.insert(schema.seasons).values({
    id: newId,
    label: `${original.label} (副本)`,
    data: sortedData,
    version: 1,
    isTemplate: 0,
    ownerId: user.userId,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
  })

  // Create initial baseline snapshot
  const dataJson = canonicalStringify(sortedData)
  const dataHash = createHash('sha256').update(dataJson).digest('hex')
  await db.insert(schema.seasonSnapshots).values({
    id: nanoid(),
    seasonId: newId,
    data: sortedData,
    snapshotType: 'full',
    userId: user.userId,
    description: null,
    dataHash,
    createdAt: now,
  })

  return c.json({
    season: { id: newId, label: `${original.label} (副本)`, version: 1, ownerId: user.userId, createdBy: user.userId, createdAt: now, updatedAt: now }
  }, 201)
})

// ──────────────────── Sharing / Permissions ────────────────────

// List permissions for a season (owner/admin only)
seasons.get('/:id/permissions', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')

  const [season] = await db.select({ ownerId: schema.seasons.ownerId })
    .from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)
  if (season.ownerId !== user.userId && user.role !== 'admin') {
    return c.json({ error: 'Only owner or admin can view permissions' }, 403)
  }

  const perms = await db
    .select({
      id: schema.seasonPermissions.id,
      userId: schema.seasonPermissions.userId,
      role: schema.seasonPermissions.role,
    })
    .from(schema.seasonPermissions)
    .where(eq(schema.seasonPermissions.seasonId, id))

  // Resolve user info
  const userIds = perms.map(p => p.userId)
  const userMap: Record<string, { username: string; displayName: string }> = {}
  if (userIds.length > 0) {
    const users = await db
      .select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName })
      .from(schema.users)
      .where(sql`${schema.users.id} IN ${userIds}`)
    for (const u of users) userMap[u.id] = { username: u.username, displayName: u.displayName }
  }

  return c.json({
    permissions: perms.map(p => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      username: userMap[p.userId]?.username ?? null,
      displayName: userMap[p.userId]?.displayName ?? null,
    }))
  })
})

// Add/update permission (owner/admin only)
seasons.post('/:id/permissions', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json<{ userId: string; role: 'editor' | 'viewer' }>()

  const [season] = await db.select({ ownerId: schema.seasons.ownerId })
    .from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)
  if (season.ownerId !== user.userId && user.role !== 'admin') {
    return c.json({ error: 'Only owner or admin can manage permissions' }, 403)
  }
  if (body.userId === season.ownerId) {
    return c.json({ error: 'Cannot set permission for the owner' }, 400)
  }
  if (!['editor', 'viewer'].includes(body.role)) {
    return c.json({ error: 'Role must be editor or viewer' }, 400)
  }

  // Upsert
  const [existing] = await db
    .select({ id: schema.seasonPermissions.id })
    .from(schema.seasonPermissions)
    .where(and(
      eq(schema.seasonPermissions.seasonId, id),
      eq(schema.seasonPermissions.userId, body.userId),
    ))

  if (existing) {
    await db.update(schema.seasonPermissions)
      .set({ role: body.role })
      .where(eq(schema.seasonPermissions.id, existing.id))
  } else {
    await db.insert(schema.seasonPermissions).values({
      id: nanoid(),
      seasonId: id,
      userId: body.userId,
      role: body.role,
    })
  }

  return c.json({ ok: true })
})

// Remove permission
seasons.delete('/:id/permissions/:userId', async (c) => {
  const { id, userId: targetUserId } = c.req.param()
  const user = c.get('user')

  const [season] = await db.select({ ownerId: schema.seasons.ownerId })
    .from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)
  if (season.ownerId !== user.userId && user.role !== 'admin') {
    return c.json({ error: 'Only owner or admin can manage permissions' }, 403)
  }

  await db.delete(schema.seasonPermissions)
    .where(and(
      eq(schema.seasonPermissions.seasonId, id),
      eq(schema.seasonPermissions.userId, targetUserId),
    ))

  return c.body(null, 204)
})

// ──────────────────── Snapshots ────────────────────

// Create snapshot
seasons.post('/:id/snapshots', async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json<{ description?: string }>().catch(() => ({}))

  const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  const currentData = season.data as Record<string, unknown>
  const dataJson = canonicalStringify(currentData)
  const dataHash = createHash('sha256').update(dataJson).digest('hex')

  const [latest] = await db
    .select({ dataHash: schema.seasonSnapshots.dataHash })
    .from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.seasonId, id))
    .orderBy(desc(schema.seasonSnapshots.createdAt))
    .limit(1)

  if (latest && latest.dataHash === dataHash) {
    return c.json({ skipped: true })
  }

  const isFirst = !latest
  let snapshotData: unknown
  let snapshotType: 'full' | 'diff'

  if (isFirst) {
    snapshotData = currentData
    snapshotType = 'full'
  } else {
    const prevFull = await reconstructSnapshotData(id)
    const diff: Record<string, { old: unknown; new: unknown }> = {}
    const allKeys = new Set([...Object.keys(prevFull), ...Object.keys(currentData)])
    for (const key of allKeys) {
      const oldVal = prevFull[key] ?? null
      const newVal = currentData[key] ?? null
      if (canonicalStringify(oldVal) === canonicalStringify(newVal)) continue

      // For dict-type fields, drill down to only store changed sub-entries
      if (oldVal && newVal && typeof oldVal === 'object' && typeof newVal === 'object'
          && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
        const oldDict = oldVal as Record<string, unknown>
        const newDict = newVal as Record<string, unknown>
        const subDiff: Record<string, { old: unknown; new: unknown }> = {}
        const subKeys = new Set([...Object.keys(oldDict), ...Object.keys(newDict)])
        for (const sk of subKeys) {
          if (canonicalStringify(oldDict[sk]) !== canonicalStringify(newDict[sk])) {
            subDiff[sk] = { old: oldDict[sk] ?? null, new: newDict[sk] ?? null }
          }
        }
        diff[key] = subDiff as unknown as { old: unknown; new: unknown }
      } else {
        diff[key] = { old: oldVal, new: newVal }
      }
    }
    snapshotData = diff
    snapshotType = 'diff'
  }

  // Count detailed field-level changes for diff snapshots
  let changeCount: number | null = null
  if (snapshotType === 'diff') {
    changeCount = 0
    const diff = snapshotData as Record<string, unknown>
    for (const entry of Object.values(diff)) {
      const e = entry as Record<string, unknown>
      if ('old' in e && 'new' in e) {
        // Simple old/new pair
        changeCount += countDeepChanges(e.old, e.new)
      } else {
        // Sub-diff: count each sub-entry
        for (const subEntry of Object.values(e)) {
          const se = subEntry as { old: unknown; new: unknown }
          changeCount += countDeepChanges(se.old, se.new)
        }
      }
    }
  }

  const snapshotId = nanoid()
  await db.insert(schema.seasonSnapshots).values({
    id: snapshotId,
    seasonId: id,
    data: snapshotData,
    snapshotType,
    userId: user.userId,
    description: (body as { description?: string }).description ?? null,
    dataHash,
    changeCount,
    createdAt: new Date(),
  })

  // Enforce max 200 snapshots per season
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.seasonId, id))
  const count = countResult[0]?.count ?? 0
  if (count > 200) {
    await db.execute(sql`
      DELETE FROM season_snapshots WHERE id IN (
        SELECT id FROM season_snapshots
        WHERE season_id = ${id}
        ORDER BY created_at ASC
        LIMIT ${count - 200}
      )
    `)
  }

  return c.json({
    snapshot: { id: snapshotId, seasonId: id, userId: user.userId, description: (body as { description?: string }).description ?? null, createdAt: new Date() }
  }, 201)
})

// List snapshots
seasons.get('/:id/snapshots', async (c) => {
  const { id } = c.req.param()
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100)
  const offset = parseInt(c.req.query('offset') ?? '0')

  const snapshots = await db
    .select({
      id: schema.seasonSnapshots.id,
      seasonId: schema.seasonSnapshots.seasonId,
      userId: schema.seasonSnapshots.userId,
      description: schema.seasonSnapshots.description,
      snapshotType: schema.seasonSnapshots.snapshotType,
      data: schema.seasonSnapshots.data,
      changeCount: schema.seasonSnapshots.changeCount,
      createdAt: schema.seasonSnapshots.createdAt,
    })
    .from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.seasonId, id))
    .orderBy(desc(schema.seasonSnapshots.createdAt))
    .limit(limit)
    .offset(offset)

  const userIds = [...new Set(snapshots.map(s => s.userId).filter(Boolean) as string[])]
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const usersResult = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(sql`${schema.users.id} IN ${userIds}`)
    for (const u of usersResult) userMap[u.id] = u.displayName
  }

  return c.json({
    snapshots: snapshots.map(s => ({
      id: s.id,
      seasonId: s.seasonId,
      userId: s.userId,
      description: s.description,
      snapshotType: s.snapshotType,
      changedFields: s.snapshotType === 'diff' ? Object.keys(s.data as Record<string, unknown>) : null,
      changeCount: s.changeCount,
      createdAt: s.createdAt,
      userDisplayName: s.userId ? userMap[s.userId] ?? null : null,
    }))
  })
})

// Get single snapshot
// ?full=1 returns reconstructed full data at that point (for rollback preview)
seasons.get('/:id/snapshots/:sid', async (c) => {
  const { id, sid } = c.req.param()
  const wantFull = c.req.query('full') === '1'

  const [snapshot] = await db.select().from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.id, sid))
  if (!snapshot) return c.json({ error: 'Snapshot not found' }, 404)

  if (wantFull) {
    let fullData: unknown
    if (snapshot.snapshotType === 'full') {
      fullData = snapshot.data
    } else {
      fullData = await reconstructSnapshotData(id, sid)
    }
    return c.json({ snapshot: { ...snapshot, data: fullData, reconstructed: true } })
  }

  return c.json({ snapshot })
})

// Rollback to snapshot
seasons.post('/:id/snapshots/:sid/rollback', async (c) => {
  const { id, sid } = c.req.param()
  const user = c.get('user')

  const access = await checkSeasonAccess(id, user.userId, user.role)
  if (!canEdit(access)) return c.json({ error: 'No edit permission' }, 403)

  const [snapshot] = await db.select().from(schema.seasonSnapshots)
    .where(eq(schema.seasonSnapshots.id, sid))
  if (!snapshot) return c.json({ error: 'Snapshot not found' }, 404)

  let rollbackData: Record<string, unknown>
  if (snapshot.snapshotType === 'full') {
    rollbackData = snapshot.data as Record<string, unknown>
  } else {
    rollbackData = await reconstructSnapshotData(id, sid)
  }

  const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  const newVersion = season.version + 1
  const now = new Date()

  await db.update(schema.seasons)
    .set({ data: rollbackData, version: newVersion, updatedAt: now })
    .where(eq(schema.seasons.id, id))

  const rollbackHash = createHash('sha256').update(canonicalStringify(rollbackData)).digest('hex')
  await db.insert(schema.seasonSnapshots).values({
    id: nanoid(),
    seasonId: id,
    data: rollbackData,
    snapshotType: 'full',
    userId: user.userId,
    description: `回滚到 ${snapshot.createdAt.toLocaleString('zh-CN')} 的版本`,
    dataHash: rollbackHash,
    createdAt: now,
  })

  return c.json({ season: { id, version: newVersion, updatedAt: now } })
})

// Export season as JSON
seasons.get('/:id/export', async (c) => {
  const { id } = c.req.param()
  const [season] = await db.select().from(schema.seasons).where(eq(schema.seasons.id, id))
  if (!season) return c.json({ error: 'Season not found' }, 404)

  c.header('Content-Type', 'application/json')
  c.header('Content-Disposition', `attachment; filename="${season.label}.json"`)
  return c.body(JSON.stringify(season.data, null, 2))
})

export default seasons
