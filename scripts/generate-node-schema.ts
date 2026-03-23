/**
 * Scans buff_template_data.json and generates a node schema file.
 *
 * Usage: npx tsx scripts/generate-node-schema.ts <path-to-buff_template_data.json>
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])
const MAX_EXAMPLES = 3

interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'
  defaultValue: unknown
  examples: unknown[]
}

interface NodeSchema {
  type: string
  shortName: string
  category: string
  properties: Record<string, PropertySchema>
  hasBranches: boolean
  hasCondition: boolean
  hasMultiCondition: boolean
  instanceCount: number
}

// Accumulator per $type
interface TypeAccumulator {
  type: string
  instanceCount: number
  hasBranches: boolean
  hasCondition: boolean
  hasMultiCondition: boolean
  properties: Map<string, PropAccumulator>
}

interface PropAccumulator {
  typeCounts: Map<string, number>
  valueCounts: Map<string, { value: unknown; count: number }>
}

function inferCategory(shortName: string): string {
  const n = shortName.toLowerCase()
  if (/damage|atk|splash|poison|bleed|burn/.test(n)) return 'damage'
  if (/heal|recover|regen/.test(n)) return 'healing'
  if (/buff|debuff/.test(n)) return 'buff'
  if (/if|else|condition|check|filter|always|switch|donothing/.test(n)) return 'control_flow'
  if (/ability|skill|trigger.*ability|trigger.*skill|interrupt/.test(n)) return 'ability'
  if (/effect|timeline|visual/.test(n)) return 'effect'
  if (/blackboard|bb|assign.*to.*bb/.test(n)) return 'blackboard'
  if (/summon|spawn|token|withdraw/.test(n)) return 'entity'
  if (/mode|direction|move|teleport/.test(n)) return 'movement'
  if (/^act\d+side/i.test(n)) return 'stage_specific'
  return 'other'
}

function shortTypeName(raw: string): string {
  const stripped = raw.replace(/, Assembly-CSharp$/i, '')
  const parts = stripped.split(/[.+]/)
  return parts[parts.length - 1] ?? raw
}

function inferPropType(value: unknown): PropertySchema['type'] {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as 'string' | 'number' | 'boolean'
}

function valueKey(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function walkNode(node: Record<string, unknown>, accumulators: Map<string, TypeAccumulator>) {
  const $type = node.$type as string
  if (!$type) return

  let acc = accumulators.get($type)
  if (!acc) {
    acc = {
      type: $type,
      instanceCount: 0,
      hasBranches: false,
      hasCondition: false,
      hasMultiCondition: false,
      properties: new Map(),
    }
    accumulators.set($type, acc)
  }
  acc.instanceCount++

  if (node._succeedNodes || node._failNodes) acc.hasBranches = true
  if (node._conditionNode) acc.hasCondition = true
  if (Array.isArray(node._conditionsNode)) acc.hasMultiCondition = true

  // Collect properties
  for (const [key, value] of Object.entries(node)) {
    if (TREE_KEYS.has(key)) continue

    let prop = acc.properties.get(key)
    if (!prop) {
      prop = { typeCounts: new Map(), valueCounts: new Map() }
      acc.properties.set(key, prop)
    }

    const ptype = inferPropType(value)
    prop.typeCounts.set(ptype, (prop.typeCounts.get(ptype) ?? 0) + 1)

    // Track value frequency — only for primitives (skip large objects/arrays)
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const vk = valueKey(value)
      const existing = prop.valueCounts.get(vk)
      if (existing) {
        existing.count++
      } else if (prop.valueCounts.size < 50) {
        prop.valueCounts.set(vk, { value, count: 1 })
      }
    }
  }

  // Recurse into tree children
  if (node._conditionNode && typeof node._conditionNode === 'object') {
    walkNode(node._conditionNode as Record<string, unknown>, accumulators)
  }
  if (Array.isArray(node._conditionsNode)) {
    for (const c of node._conditionsNode) {
      if (c && typeof c === 'object') walkNode(c as Record<string, unknown>, accumulators)
    }
  }
  if (Array.isArray(node._succeedNodes)) {
    for (const n of node._succeedNodes) {
      if (n && typeof n === 'object') walkNode(n as Record<string, unknown>, accumulators)
    }
  }
  if (Array.isArray(node._failNodes)) {
    for (const n of node._failNodes) {
      if (n && typeof n === 'object') walkNode(n as Record<string, unknown>, accumulators)
    }
  }
}

function buildSchema(acc: TypeAccumulator): NodeSchema {
  const shortName = shortTypeName(acc.type)
  const properties: Record<string, PropertySchema> = {}

  for (const [key, prop] of acc.properties) {
    // Determine most common type
    let bestType: PropertySchema['type'] = 'string'
    let bestCount = 0
    for (const [t, c] of prop.typeCounts) {
      if (c > bestCount) { bestType = t as PropertySchema['type']; bestCount = c }
    }

    // For complex types, use empty defaults (don't store huge objects)
    let defaultValue: unknown
    if (bestType === 'array') defaultValue = []
    else if (bestType === 'object') defaultValue = {}
    else if (bestType === 'null') defaultValue = null
    else if (bestType === 'number') defaultValue = 0
    else if (bestType === 'boolean') defaultValue = false
    else defaultValue = ''

    const sortedValues = [...prop.valueCounts.values()].sort((a, b) => b.count - a.count)
    if (sortedValues.length > 0 && bestType !== 'array' && bestType !== 'object') {
      defaultValue = sortedValues[0].value
    }

    // Examples: unique primitive values sorted by frequency
    const examples = sortedValues
      .slice(0, MAX_EXAMPLES)
      .map(v => v.value)

    properties[key] = { type: bestType, defaultValue, examples }
  }

  return {
    type: acc.type,
    shortName,
    category: inferCategory(shortName),
    properties,
    hasBranches: acc.hasBranches,
    hasCondition: acc.hasCondition,
    hasMultiCondition: acc.hasMultiCondition,
    instanceCount: acc.instanceCount,
  }
}

// Main
const inputPath = process.argv[2] ?? resolve(__dirname, '../../../py_arknights/res/ArknightsGameData/zh_CN/gamedata/battle/buff_template_data.json')
const outputPath = resolve(__dirname, '../packages/editor/src/components/editors/buff-editor/nodeSchemaBase.json')

console.log(`Reading: ${inputPath}`)
const raw = readFileSync(inputPath, 'utf-8')
const data = JSON.parse(raw) as Record<string, { eventToActions?: Record<string, unknown[]> }>

const accumulators = new Map<string, TypeAccumulator>()

let templateCount = 0
for (const [key, template] of Object.entries(data)) {
  if (!template.eventToActions) continue
  templateCount++
  for (const [event, actions] of Object.entries(template.eventToActions)) {
    if (!Array.isArray(actions)) continue
    for (const action of actions) {
      if (action && typeof action === 'object') {
        walkNode(action as Record<string, unknown>, accumulators)
      }
    }
  }
}

const schemas = [...accumulators.values()]
  .map(buildSchema)
  .sort((a, b) => b.instanceCount - a.instanceCount)

console.log(`Scanned ${templateCount} templates`)
console.log(`Found ${schemas.length} unique node types`)
console.log(`Top 10 by instance count:`)
for (const s of schemas.slice(0, 10)) {
  console.log(`  ${s.shortName}: ${s.instanceCount} instances, ${Object.keys(s.properties).length} properties`)
}

writeFileSync(outputPath, JSON.stringify(schemas, null, 2))
console.log(`Written to: ${outputPath}`)
console.log(`File size: ${(readFileSync(outputPath).length / 1024).toFixed(1)} KB`)
