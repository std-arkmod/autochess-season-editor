#!/usr/bin/env node
/**
 * Buff编辑器翻译完整性验证脚本
 * 从游戏数据中提取所有节点类型、属性名、事件类型，
 * 与翻译文件进行比对，输出遗漏项。
 *
 * 用法: node scripts/verify-buff-i18n.cjs [--generate-stub]
 * 注意: 因项目使用 ESM，请使用 .cjs 后缀版本运行
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── 1. 从游戏数据中提取所有节点类型和属性 ──
const dataPath = path.resolve(__dirname, '../ArknightsGameData/zh_CN/gamedata/battle/buff_template_data.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])

const nodeTypes = new Map()       // shortName → { count, fullType, props: Set }
const allProps = new Set()        // all unique property names across all nodes
const allEvents = new Set()       // all unique event types

function shortName(rawType) {
  return rawType.replace(/, Assembly-CSharp$/i, '').split(/[.+]/).pop()
}

function walkNode(node) {
  if (!node || typeof node !== 'object') return
  const t = node['$type']
  if (!t) return

  const sn = shortName(t)
  if (!nodeTypes.has(sn)) {
    nodeTypes.set(sn, { count: 0, fullType: t, props: new Set() })
  }
  const entry = nodeTypes.get(sn)
  entry.count++

  for (const k of Object.keys(node)) {
    if (!TREE_KEYS.has(k)) {
      entry.props.add(k)
      allProps.add(k)
    }
  }

  if (node._conditionNode) walkNode(node._conditionNode)
  if (Array.isArray(node._conditionsNode)) node._conditionsNode.forEach(walkNode)
  if (Array.isArray(node._succeedNodes)) node._succeedNodes.forEach(walkNode)
  if (Array.isArray(node._failNodes)) node._failNodes.forEach(walkNode)
}

console.log('正在扫描游戏数据...')
for (const [key, val] of Object.entries(data)) {
  if (val && val.eventToActions) {
    for (const [event, actions] of Object.entries(val.eventToActions)) {
      allEvents.add(event)
      if (Array.isArray(actions)) actions.forEach(walkNode)
    }
  }
}

console.log(`扫描完成: ${nodeTypes.size} 种节点类型, ${allProps.size} 个属性名, ${allEvents.size} 个事件类型\n`)

// ── 2. 加载翻译文件 ──
const i18nPath = path.resolve(__dirname, '../packages/editor/src/components/editors/buff-editor/buffEditorI18n.ts')
if (!fs.existsSync(i18nPath)) {
  console.error('翻译文件不存在:', i18nPath)
  process.exit(1)
}

const i18nSource = fs.readFileSync(i18nPath, 'utf8')

// Extract node translations - look for nodeNames map entries
const nodeNameMatches = new Set()
for (const m of i18nSource.matchAll(/['"]([A-Za-z0-9_]+)['"]\s*:/g)) {
  nodeNameMatches.add(m[1])
}

// Check which maps exist by looking at export names
const hasNodeNames = i18nSource.includes('nodeNames')
const hasPropLabels = i18nSource.includes('propLabels')
const hasEventLabels = i18nSource.includes('eventLabels')

// Extract specific entries from each map
function extractMapEntries(source, mapName) {
  const entries = new Set()
  // Find the map definition
  const mapRegex = new RegExp(`export\\s+const\\s+${mapName}[^{]*\\{([\\s\\S]*?)\\n\\}`, 'g')
  const match = mapRegex.exec(source)
  if (!match) return entries

  const body = match[1]
  // Match keys - handles both 'key': and key: and "key":
  for (const m of body.matchAll(/['"]?([A-Za-z0-9_]+)['"]?\s*:/g)) {
    entries.add(m[1])
  }
  return entries
}

const translatedNodes = extractMapEntries(i18nSource, 'nodeNames')
const translatedProps = extractMapEntries(i18nSource, 'propLabels')
const translatedEvents = extractMapEntries(i18nSource, 'eventLabels')

// ── 3. 比对 & 输出结果 ──
let totalMissing = 0

// Check node names
const missingNodes = []
for (const [sn, info] of [...nodeTypes.entries()].sort((a, b) => b[1].count - a[1].count)) {
  if (!translatedNodes.has(sn)) {
    missingNodes.push({ name: sn, count: info.count, props: [...info.props] })
  }
}

if (missingNodes.length > 0) {
  console.log(`\x1b[31m=== 缺失节点翻译: ${missingNodes.length}/${nodeTypes.size} ===\x1b[0m`)
  for (const n of missingNodes.slice(0, 50)) {
    console.log(`  ${n.name} (${n.count}次): ${n.props.join(', ')}`)
  }
  if (missingNodes.length > 50) {
    console.log(`  ... 还有 ${missingNodes.length - 50} 个`)
  }
  totalMissing += missingNodes.length
} else {
  console.log(`\x1b[32m✓ 节点翻译完整: ${nodeTypes.size}/${nodeTypes.size}\x1b[0m`)
}

// Check property labels
const missingProps = []
for (const p of allProps) {
  if (!translatedProps.has(p)) {
    missingProps.push(p)
  }
}

if (missingProps.length > 0) {
  console.log(`\n\x1b[31m=== 缺失属性翻译: ${missingProps.length}/${allProps.size} ===\x1b[0m`)
  for (const p of missingProps.sort().slice(0, 80)) {
    console.log(`  ${p}`)
  }
  if (missingProps.length > 80) {
    console.log(`  ... 还有 ${missingProps.length - 80} 个`)
  }
  totalMissing += missingProps.length
} else {
  console.log(`\x1b[32m✓ 属性翻译完整: ${allProps.size}/${allProps.size}\x1b[0m`)
}

// Check event labels
const missingEvents = []
for (const e of allEvents) {
  if (!translatedEvents.has(e)) {
    missingEvents.push(e)
  }
}

if (missingEvents.length > 0) {
  console.log(`\n\x1b[31m=== 缺失事件翻译: ${missingEvents.length}/${allEvents.size} ===\x1b[0m`)
  for (const e of missingEvents.sort()) {
    console.log(`  ${e}`)
  }
  totalMissing += missingEvents.length
} else {
  console.log(`\x1b[32m✓ 事件翻译完整: ${allEvents.size}/${allEvents.size}\x1b[0m`)
}

// Check for per-node property coverage
let nodesWithMissingProps = 0
const nodePropsDetail = []
for (const [sn, info] of [...nodeTypes.entries()].sort((a, b) => b[1].count - a[1].count)) {
  const missing = [...info.props].filter(p => !translatedProps.has(p))
  if (missing.length > 0) {
    nodesWithMissingProps++
    if (nodePropsDetail.length < 20) {
      nodePropsDetail.push({ name: sn, missing })
    }
  }
}

if (nodesWithMissingProps > 0) {
  console.log(`\n\x1b[33m=== 含有未翻译属性的节点: ${nodesWithMissingProps} ===\x1b[0m`)
  for (const d of nodePropsDetail) {
    console.log(`  ${d.name}: ${d.missing.join(', ')}`)
  }
}

// Summary
console.log('\n' + '='.repeat(60))
if (totalMissing === 0) {
  console.log(`\x1b[32m✓ 翻译完整性检查通过！所有 ${nodeTypes.size} 个节点、${allProps.size} 个属性、${allEvents.size} 个事件均有翻译。\x1b[0m`)
} else {
  console.log(`\x1b[31m✗ 共有 ${totalMissing} 项缺失翻译\x1b[0m`)
  console.log(`  节点: ${missingNodes.length}/${nodeTypes.size} 缺失`)
  console.log(`  属性: ${missingProps.length}/${allProps.size} 缺失`)
  console.log(`  事件: ${missingEvents.length}/${allEvents.size} 缺失`)
}

// Output for auto-generation
if (process.argv.includes('--generate-stub')) {
  console.log('\n// ── 自动生成的缺失项桩代码 ──')
  if (missingNodes.length > 0) {
    console.log('\n// 缺失的节点翻译:')
    for (const n of missingNodes) {
      console.log(`  ${n.name}: '${n.name}',`)
    }
  }
  if (missingProps.length > 0) {
    console.log('\n// 缺失的属性翻译:')
    for (const p of missingProps.sort()) {
      console.log(`  ${p}: '${p}',`)
    }
  }
  if (missingEvents.length > 0) {
    console.log('\n// 缺失的事件翻译:')
    for (const e of missingEvents.sort()) {
      console.log(`  ${e}: '${e}',`)
    }
  }
}

process.exit(totalMissing > 0 ? 1 : 0)
