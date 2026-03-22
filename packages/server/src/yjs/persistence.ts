import * as Y from 'yjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.ts'

/**
 * Load a Yjs document from PostgreSQL.
 * Returns the Y.Doc with the stored state applied, or an empty doc if none exists.
 */
export async function loadYjsDoc(seasonId: string): Promise<Y.Doc> {
  const doc = new Y.Doc()

  const [row] = await db
    .select()
    .from(schema.yjsDocuments)
    .where(eq(schema.yjsDocuments.seasonId, seasonId))

  if (row) {
    const stateBuffer = Buffer.from(row.state, 'base64')
    Y.applyUpdate(doc, new Uint8Array(stateBuffer))
  } else {
    // If no Yjs doc exists, load season data and initialize
    const [season] = await db
      .select()
      .from(schema.seasons)
      .where(eq(schema.seasons.id, seasonId))

    if (season?.data) {
      plainObjectToYDoc(doc, season.data as Record<string, unknown>)
    }
  }

  return doc
}

/**
 * Save a Yjs document state to PostgreSQL.
 */
export async function saveYjsDoc(seasonId: string, doc: Y.Doc): Promise<void> {
  // Check if season still exists (may have been deleted)
  const [season] = await db.select({ id: schema.seasons.id }).from(schema.seasons).where(eq(schema.seasons.id, seasonId))
  if (!season) return

  const stateVector = Y.encodeStateAsUpdate(doc)
  const stateBase64 = Buffer.from(stateVector).toString('base64')

  await db
    .insert(schema.yjsDocuments)
    .values({
      seasonId,
      state: stateBase64,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.yjsDocuments.seasonId,
      set: {
        state: stateBase64,
        updatedAt: new Date(),
      },
    })

  // Also sync back to seasons.data for REST API access
  const data = yDocToPlainObject(doc)
  if (Object.keys(data).length > 0) {
    await db
      .update(schema.seasons)
      .set({ data, updatedAt: new Date() })
      .where(eq(schema.seasons.id, seasonId))
  }
}

/** Check if a value is a plain dict (non-array object with string keys) suitable for nested YMap */
function isDictValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Convert a plain JS object to Yjs shared types inside a Y.Doc.
 *
 * Strategy: use a Y.Map called "season". For top-level fields whose values are
 * plain objects (dicts), use a nested Y.Map so each record is an independent entry.
 * This enables incremental sync — editing one record in a dict only sends that
 * record's data instead of the entire dict. Other values (arrays, primitives)
 * are stored as JSON-serialized strings.
 */
export function plainObjectToYDoc(doc: Y.Doc, data: Record<string, unknown>): void {
  doc.transact(() => {
    const yMap = doc.getMap('season')
    for (const [key, value] of Object.entries(data)) {
      if (isDictValue(value)) {
        const nested = new Y.Map<string>()
        for (const [subKey, subValue] of Object.entries(value)) {
          nested.set(subKey, JSON.stringify(subValue))
        }
        yMap.set(key, nested)
      } else {
        yMap.set(key, JSON.stringify(value))
      }
    }
  })
}

/**
 * Convert a Y.Doc back to a plain JS object.
 * Handles both nested YMap (new format) and plain string (legacy format).
 */
export function yDocToPlainObject(doc: Y.Doc): Record<string, unknown> {
  const yMap = doc.getMap('season')
  if (yMap.size === 0) return {}

  const result: Record<string, unknown> = {}
  yMap.forEach((val, key) => {
    if (val instanceof Y.Map) {
      // Nested YMap → reconstruct dict
      const dict: Record<string, unknown> = {}
      val.forEach((subVal: unknown, subKey: string) => {
        if (typeof subVal === 'string') {
          try {
            dict[subKey] = JSON.parse(subVal)
          } catch {
            dict[subKey] = subVal
          }
        } else {
          dict[subKey] = subVal
        }
      })
      result[key] = dict
    } else if (typeof val === 'string') {
      try {
        result[key] = JSON.parse(val)
      } catch {
        result[key] = val
      }
    } else {
      result[key] = val
    }
  })
  return result
}
