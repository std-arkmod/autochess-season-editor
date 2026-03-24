/**
 * Import seasons from JSON files containing AutoChessSeasonData.
 *
 * Supported formats:
 *   1. activity_table.json — extracts all seasons from activity.AUTOCHESS_SEASON
 *   2. A single AutoChessSeasonData object — imported as one season
 *   3. { "seasonKey": AutoChessSeasonData, ... } — multiple seasons keyed by name
 *
 * Usage: tsx src/db/import-season.ts [json-file] [label]
 *   When no file is given, imports all .json files from data/ directory.
 *   label is only used when importing a single file with format 2.
 */
import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { nanoid } from 'nanoid'
import { db, schema } from './index.ts'
import { eq, sql } from 'drizzle-orm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUNDLED_DIR = resolve(__dirname, '../../data')

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

  // Format 3: { "seasonKey": AutoChessSeasonData, ... }
  const entries = Object.entries(raw).filter(([, v]) =>
    typeof v === 'object' && v !== null && isSeasonData(v as Record<string, unknown>),
  )
  if (entries.length > 0) {
    return entries.map(([key, data]) => ({ label: key, data: data as Record<string, unknown> }))
  }

  throw new Error('无法识别的 JSON 格式。支持 activity_table.json、单个 AutoChessSeasonData 或 { key: SeasonData } 格式。')
}

async function main() {
  const filePath = process.argv[2]
  const customLabel = process.argv[3]

  // Collect files to import
  let files: { path: string; label?: string }[]
  if (filePath) {
    files = [{ path: filePath, label: customLabel }]
  } else {
    // Import all .json from bundled data/ directory
    const entries = readdirSync(BUNDLED_DIR).filter(f => f.endsWith('.json')).sort()
    if (entries.length === 0) {
      console.error(`No .json files found in ${BUNDLED_DIR}`)
      process.exit(1)
    }
    files = entries.map(f => ({ path: resolve(BUNDLED_DIR, f), label: basename(f, '.json') }))
    console.log(`Found ${files.length} file(s) in data/`)
  }

  // Extract seasons from all files
  const seasons: { label: string; data: Record<string, unknown> }[] = []
  for (const file of files) {
    console.log(`Reading: ${file.path}`)
    const raw = JSON.parse(readFileSync(file.path, 'utf-8')) as Record<string, unknown>
    const extracted = extractSeasons(raw)
    for (const s of extracted) {
      seasons.push({ label: file.label && extracted.length === 1 ? file.label : s.label, data: s.data })
    }
  }
  console.log(`Found ${seasons.length} season(s) total`)

  // Find admin user
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, 'admin')).limit(1)
  if (!admin) {
    console.error('No admin user found. Run db:seed first.')
    process.exit(1)
  }

  const isTemplate = !process.argv.includes('--private')

  for (const season of seasons) {
    const label = season.label
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
