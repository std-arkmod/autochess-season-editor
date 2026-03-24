/**
 * Import seasons from a JSON file containing AutoChessSeasonData.
 *
 * Supported formats:
 *   1. activity_table.json — extracts all seasons from activity.AUTOCHESS_SEASON
 *   2. A single AutoChessSeasonData object — imported as one season
 *
 * Usage: tsx src/db/import-season.ts <json-file> [label]
 *   label is only used for format 2 (single season).
 */
import { readFileSync } from 'fs'
import { nanoid } from 'nanoid'
import { db, schema } from './index.ts'
import { eq, sql } from 'drizzle-orm'

/** Known top-level keys in AutoChessSeasonData */
const SEASON_KEYS = new Set([
  'modeDataDict', 'baseRewardDataList', 'bandDataListDict', 'charChessDataDict',
  'chessNormalIdLookupDict', 'diyChessDict', 'shopLevelDataDict', 'shopLevelDisplayDataDict',
  'charShopChessDatas', 'trapChessDataDict', 'trapShopChessDatas', 'stageDatasDict',
  'battleDataDict', 'bondInfoDict', 'garrisonDataDict', 'effectInfoDataDict',
  'effectBuffInfoDataDict', 'effectChoiceInfoDict', 'bossInfoDict', 'specialEnemyInfoDict',
  'enemyInfoDict', 'specialEnemyRandomTypeDict', 'trainingNpcList', 'milestoneList',
  'modeFactorInfo', 'difficultyFactorInfo', 'playerTitleDataDict', 'shopCharChessInfoData',
  'constData',
])

function isSeasonData(obj: Record<string, unknown>): boolean {
  return typeof obj.modeDataDict === 'object' && typeof obj.bondInfoDict === 'object'
}

function extractSeasons(raw: Record<string, unknown>): { label: string; data: Record<string, unknown> }[] {
  // Format 1: activity_table.json → activity.AUTOCHESS_SEASON.{actXautochess}
  const activity = raw.activity as Record<string, unknown> | undefined
  const autochess = activity?.AUTOCHESS_SEASON as Record<string, Record<string, unknown>> | undefined
  if (autochess) {
    return Object.entries(autochess)
      .filter(([, v]) => isSeasonData(v))
      .map(([key, data]) => ({ label: key, data }))
  }

  // Format 2: direct AutoChessSeasonData object
  if (isSeasonData(raw)) {
    return [{ label: 'Imported Season', data: raw }]
  }

  throw new Error('无法识别的 JSON 格式。支持 activity_table.json 或单个 AutoChessSeasonData 对象。')
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: tsx src/db/import-season.ts <json-file> [label]')
    process.exit(1)
  }

  const customLabel = process.argv[3]

  console.log(`Reading: ${filePath}`)
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  const seasons = extractSeasons(raw)
  console.log(`Found ${seasons.length} season(s)`)

  // Find admin user
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, 'admin')).limit(1)
  if (!admin) {
    console.error('No admin user found. Run db:seed first.')
    process.exit(1)
  }

  const isTemplate = !process.argv.includes('--private')

  for (const season of seasons) {
    const label = seasons.length === 1 && customLabel ? customLabel : season.label
    const id = nanoid()
    const now = new Date()

    await db.insert(schema.seasons).values({
      id,
      label,
      data: season.data,
      version: 1,
      isTemplate: isTemplate ? 1 : 0,
      ownerId: isTemplate ? null : admin.id,
      createdBy: admin.id,
      createdAt: now,
      updatedAt: now,
    })

    const [verify] = await db.select({ len: sql`length(data::text)` }).from(schema.seasons).where(eq(schema.seasons.id, id))
    console.log(`  ✓ "${label}" (id: ${id}, ${(verify as any)?.len ?? '?'} bytes) — ${isTemplate ? 'template' : 'private'}`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
