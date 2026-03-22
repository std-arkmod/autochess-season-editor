/**
 * Import a season from a directory (same format as fsStore).
 * Usage: tsx src/db/import-season.ts <directory-path> [label]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { db, schema } from './index.ts'
import { eq, sql } from 'drizzle-orm'

const DICT_FIELDS = [
  'modeDataDict', 'bondInfoDict', 'charChessDataDict', 'charShopChessDatas',
  'trapChessDataDict', 'trapShopChessDatas', 'effectInfoDataDict',
  'effectBuffInfoDataDict', 'bossInfoDict', 'shopCharChessInfoData',
  'garrisonDataDict', 'bandDataListDict', 'stageDatasDict',
  'shopLevelDisplayDataDict', 'specialEnemyInfoDict', 'effectChoiceInfoDict',
]

function loadDirectory(dirPath: string): { label: string; data: Record<string, unknown> } {
  const projectPath = join(dirPath, 'project.json')
  if (!existsSync(projectPath)) {
    throw new Error(`project.json not found in ${dirPath}`)
  }

  const project = JSON.parse(readFileSync(projectPath, 'utf-8'))
  const label = project.label ?? 'Unnamed Season'
  const constFields = project.constFields ?? {}

  // Start with const fields
  const data: Record<string, unknown> = { ...constFields }

  // Load each dict field from subdirectories
  for (const field of DICT_FIELDS) {
    const subDir = join(dirPath, field)
    if (!existsSync(subDir)) {
      data[field] = {}
      continue
    }

    const files = readdirSync(subDir).filter(f => f.endsWith('.json'))
    const dict: Record<string, unknown> = {}

    for (const file of files) {
      const key = file.replace(/\.json$/, '')
      const content = JSON.parse(readFileSync(join(subDir, file), 'utf-8'))
      dict[key] = content
    }

    data[field] = dict
  }

  return { label, data }
}

async function main() {
  const dirPath = process.argv[2]
  if (!dirPath) {
    console.error('Usage: tsx src/db/import-season.ts <directory-path> [label]')
    process.exit(1)
  }

  const customLabel = process.argv[3]

  console.log(`Loading season data from: ${dirPath}`)
  const { label, data } = loadDirectory(dirPath)
  const finalLabel = customLabel ?? label

  // Find admin user to set as creator
  const [admin] = await db.select().from(schema.users).where(eq(schema.users.role, 'admin')).limit(1)
  if (!admin) {
    console.error('No admin user found. Run db:seed first.')
    process.exit(1)
  }

  const id = nanoid()
  const now = new Date()

  // Import as template by default (use --private flag for private season)
  const isTemplate = !process.argv.includes('--private')

  await db.insert(schema.seasons).values({
    id,
    label: finalLabel,
    data,
    version: 1,
    isTemplate: isTemplate ? 1 : 0,
    ownerId: isTemplate ? null : admin.id,
    createdBy: admin.id,
    createdAt: now,
    updatedAt: now,
  })

  console.log(`Imported as ${isTemplate ? 'template' : 'private season'}`)

  // Verify data was written correctly
  const [verify] = await db.select({ len: sql`length(data::text)` }).from(schema.seasons).where(eq(schema.seasons.id, id))
  console.log(`Season "${finalLabel}" imported successfully (id: ${id}, data size: ${(verify as any)?.len ?? '?'} bytes)`)
  process.exit(0)
}

main().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
