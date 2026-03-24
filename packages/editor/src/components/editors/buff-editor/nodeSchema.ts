export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'
  defaultValue: unknown
  examples: unknown[]
}

export interface NodeSchema {
  type: string
  shortName: string
  category: string
  properties: Record<string, PropertySchema>
  hasBranches: boolean
  hasCondition: boolean
  hasMultiCondition: boolean
  instanceCount: number
}

export function normalizeType(raw: string): string {
  return raw.replace(/, Assembly-CSharp$/i, '').replace(/\+/g, '.')
}

function shortTypeName(raw: string): string {
  const stripped = raw.replace(/, Assembly-CSharp$/i, '')
  const parts = stripped.split(/[.+]/)
  return parts[parts.length - 1] ?? raw
}

function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (/damage|atk|splash|poison|bleed|burn/.test(n)) return 'damage'
  if (/heal|recover|regen/.test(n)) return 'healing'
  if (/buff|debuff/.test(n)) return 'buff'
  if (/if|else|condition|check|filter|always|switch|donothing/.test(n)) return 'control_flow'
  if (/ability|skill|interrupt/.test(n)) return 'ability'
  if (/effect|timeline|visual/.test(n)) return 'effect'
  if (/blackboard|bb/.test(n)) return 'blackboard'
  if (/summon|spawn|token|withdraw/.test(n)) return 'entity'
  if (/mode|direction|move|teleport/.test(n)) return 'movement'
  if (/^act\d+side/i.test(n)) return 'stage_specific'
  return 'other'
}

import { collectPropertyValue, collectNestedValues, finalizeEnums } from './enumRegistry'

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])
const MAX_EXAMPLES = 3

// Runtime schema map
const schemaMap = new Map<string, NodeSchema>()
let _loaded = false

export function isSchemaLoaded(): boolean {
  return _loaded
}

/** Get schema for a $type. Always returns a schema. */
export function getSchema(rawType: string): NodeSchema {
  const key = normalizeType(rawType)
  const existing = schemaMap.get(key)
  if (existing) return existing

  const shortName = shortTypeName(rawType)
  const schema: NodeSchema = {
    type: rawType,
    shortName,
    category: inferCategory(shortName),
    properties: {},
    hasBranches: false,
    hasCondition: false,
    hasMultiCondition: false,
    instanceCount: 0,
  }
  schemaMap.set(key, schema)
  return schema
}

export function getAllSchemas(): NodeSchema[] {
  return Array.from(schemaMap.values())
}

export function getSchemasByCategory(): Map<string, NodeSchema[]> {
  const map = new Map<string, NodeSchema[]>()
  for (const s of schemaMap.values()) {
    const list = map.get(s.category) ?? []
    list.push(s)
    map.set(s.category, list)
  }
  return map
}

export function buildDefaultNode(rawType: string): Record<string, unknown> {
  const schema = getSchema(rawType)
  const node: Record<string, unknown> = { $type: rawType }
  for (const [key, prop] of Object.entries(schema.properties)) {
    node[key] = prop.defaultValue
  }
  return node
}

// ── Dynamic loading & schema generation ──

interface LoadProgress {
  phase: 'download' | 'parse' | 'scan' | 'done'
  percent: number
  detail?: string
}

/**
 * Download buff_template_data.json from public/, parse it,
 * scan all nodes to build schemas, and store reference templates.
 * Calls onProgress throughout the process.
 */
export async function loadGameData(
  onProgress: (p: LoadProgress) => void,
): Promise<Record<string, { templateKey: string; effectKey: string; onEventPriority: string; eventToActions: Record<string, unknown[]> }>> {
  // ── Phase 1: Download ──
  onProgress({ phase: 'download', percent: 0, detail: '正在下载游戏数据...' })
  const res = await fetch('/buff_template_data.json')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const contentLength = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No reader')

  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (contentLength > 0) {
      onProgress({ phase: 'download', percent: Math.round((received / contentLength) * 100), detail: `下载中... ${(received / 1024 / 1024).toFixed(1)}MB` })
    }
  }

  // ── Phase 2: Parse JSON ──
  onProgress({ phase: 'parse', percent: 0, detail: '正在解析 JSON...' })
  const blob = new Blob(chunks as BlobPart[])
  const text = await blob.text()
  const parsed = JSON.parse(text) as Record<string, any>
  const entries = Object.entries(parsed)
  onProgress({ phase: 'parse', percent: 100, detail: `解析完成，${entries.length} 个模板` })

  // ── Phase 3: Scan nodes to build schemas ──
  onProgress({ phase: 'scan', percent: 0, detail: '正在分析节点类型...' })
  const templates: Record<string, { templateKey: string; effectKey: string; onEventPriority: string; eventToActions: Record<string, unknown[]> }> = {}
  let scanned = 0

  for (const [key, val] of entries) {
    if (val && typeof val === 'object' && val.eventToActions) {
      templates[key] = {
        templateKey: val.templateKey ?? key,
        effectKey: val.effectKey ?? '',
        onEventPriority: val.onEventPriority ?? 'DEFAULT',
        eventToActions: val.eventToActions ?? {},
      }
      // Walk all nodes in this template
      for (const actions of Object.values(val.eventToActions as Record<string, unknown[]>)) {
        if (Array.isArray(actions)) {
          for (const action of actions) {
            if (action && typeof action === 'object') {
              walkNode(action as Record<string, unknown>)
            }
          }
        }
      }
    }
    scanned++
    if (scanned % 500 === 0) {
      onProgress({ phase: 'scan', percent: Math.round((scanned / entries.length) * 100), detail: `已分析 ${scanned}/${entries.length} 个模板，${schemaMap.size} 种节点` })
      // Yield to UI
      await new Promise(r => setTimeout(r, 0))
    }
  }

  finalizeEnums(new Set(Object.keys(templates)))
  _loaded = true
  onProgress({ phase: 'done', percent: 100, detail: `完成：${schemaMap.size} 种节点类型` })
  return templates
}

function walkNode(node: Record<string, unknown>) {
  const $type = node.$type as string
  if (!$type) return

  const key = normalizeType($type)
  let schema = schemaMap.get(key)
  if (!schema) {
    const shortName = shortTypeName($type)
    schema = {
      type: $type,
      shortName,
      category: inferCategory(shortName),
      properties: {},
      hasBranches: false,
      hasCondition: false,
      hasMultiCondition: false,
      instanceCount: 0,
    }
    schemaMap.set(key, schema)
  }
  schema.instanceCount++

  if (node._succeedNodes || node._failNodes) schema.hasBranches = true
  if (node._conditionNode) schema.hasCondition = true
  if (Array.isArray(node._conditionsNode)) schema.hasMultiCondition = true

  for (const [k, v] of Object.entries(node)) {
    if (TREE_KEYS.has(k)) continue
    collectPropertyValue(k, v)
    // Recurse into nested objects to collect their inner field values
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectNestedValues(v as Record<string, unknown>)
    }
    if (!schema.properties[k]) {
      const ptype = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v as PropertySchema['type']
      const isPrimitive = v === null || typeof v !== 'object'
      schema.properties[k] = {
        type: ptype,
        defaultValue: ptype === 'array' ? [] : ptype === 'object' ? {} : v,
        examples: isPrimitive && v !== null ? [v] : [],
      }
    } else {
      // Add to examples if primitive and not yet seen
      const prop = schema.properties[k]
      if (v !== null && typeof v !== 'object' && prop.examples.length < MAX_EXAMPLES) {
        if (!prop.examples.includes(v)) {
          prop.examples.push(v)
        }
      }
    }
  }

  // Recurse
  if (node._conditionNode && typeof node._conditionNode === 'object') {
    walkNode(node._conditionNode as Record<string, unknown>)
  }
  if (Array.isArray(node._conditionsNode)) {
    for (const c of node._conditionsNode) {
      if (c && typeof c === 'object') walkNode(c as Record<string, unknown>)
    }
  }
  if (Array.isArray(node._succeedNodes)) {
    for (const n of node._succeedNodes) {
      if (n && typeof n === 'object') walkNode(n as Record<string, unknown>)
    }
  }
  if (Array.isArray(node._failNodes)) {
    for (const n of node._failNodes) {
      if (n && typeof n === 'object') walkNode(n as Record<string, unknown>)
    }
  }
}

export const categoryLabels: Record<string, string> = {
  control_flow: '流程控制',
  damage: '伤害',
  healing: '治疗',
  buff: 'Buff管理',
  ability: '技能',
  effect: '效果',
  blackboard: '黑板/状态',
  entity: '实体',
  movement: '移动',
  stage_specific: '关卡特有',
  other: '其他',
}

export const categoryColors: Record<string, string> = {
  control_flow: '#e67e22',
  damage: '#e74c3c',
  healing: '#2ecc71',
  buff: '#3498db',
  ability: '#9b59b6',
  effect: '#1abc9c',
  blackboard: '#f39c12',
  entity: '#34495e',
  movement: '#16a085',
  stage_specific: '#8e44ad',
  other: '#7f8c8d',
}
