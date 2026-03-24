#!/usr/bin/env node
/**
 * Comprehensive round-trip & schema fidelity test for the buff editor.
 *
 * Reads buff_template_data.json directly, reimplements the key logic from
 * constants.ts, nodeSchema.ts, and graphConversion.ts in pure JS, and
 * reports every discrepancy it finds.
 *
 * Run:  node roundtrip.test.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = resolve(
  __dirname, '..', '..', '..', '..', '..', 'public', 'buff_template_data.json',
)

// ═══════════════════════════════════════════════════════════════════════
// 0. Re-implement editor constants and helpers
// ═══════════════════════════════════════════════════════════════════════

const GRAPH_TREE_KEYS = new Set([
  '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode',
])

const OPAQUE_TREE_KEYS = new Set([
  '_actions', '_actionsToTarget', '_loopBody',
  '_rightNodes', '_leftNodes', '_upNodes', '_downNodes',
  '_otherwiseActions', '_attackTriggerNodes',
])

const TREE_KEYS = new Set([
  '$type', '_isAnd',
  ...GRAPH_TREE_KEYS,
  ...OPAQUE_TREE_KEYS,
])

function normalizeType(raw) {
  return raw.replace(/, Assembly-CSharp$/i, '').replace(/\+/g, '.')
}

function shortTypeName(raw) {
  const stripped = raw.replace(/, Assembly-CSharp$/i, '')
  const parts = stripped.split(/[.+]/)
  return parts[parts.length - 1] ?? raw
}

// ═══════════════════════════════════════════════════════════════════════
// 0b. Re-implement sanitiseForNew / sanitiseNestedObject
// ═══════════════════════════════════════════════════════════════════════

function sanitiseNestedObject(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (Array.isArray(v)) {
      obj[k] = []
    } else if (v && typeof v === 'object') {
      sanitiseNestedObject(v)
    }
  }
}

function sanitiseForNew(node) {
  for (const k of Object.keys(node)) {
    if (k === '$type') continue

    if (GRAPH_TREE_KEYS.has(k)) {
      node[k] = k === '_conditionsNode' ? [] : null
      continue
    }

    if (OPAQUE_TREE_KEYS.has(k)) {
      node[k] = null
      continue
    }

    if (k === '_isAnd') continue

    const v = node[k]
    if (Array.isArray(v)) {
      node[k] = []
      continue
    }

    if (v && typeof v === 'object') {
      sanitiseNestedObject(v)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 0c. Re-implement treeToGraph + graphToTree logic (simplified)
//     We only need the data-flow, not the visual layout.
// ═══════════════════════════════════════════════════════════════════════

let nodeIdCounter = 0
function nextId(prefix) { return `${prefix}_${nodeIdCounter++}` }

/** Walk action tree, producing nodes + edges (the treeToGraph path). */
function treeToGraphSimple(template) {
  nodeIdCounter = 0
  const nodes = []
  const edges = []

  for (const eventType of Object.keys(template.eventToActions)) {
    const actions = template.eventToActions[eventType]
    const triggerId = nextId('trigger')

    nodes.push({
      id: triggerId,
      data: {
        nodeType: 'event_trigger',
        eventType,
        isEventTrigger: true,
        actionNode: undefined,
      },
    })

    const results = walkActions(actions ?? [], eventType)
    if (results.length > 0) {
      edges.push({ source: triggerId, target: results[0].id, sourceHandle: 'next' })
      for (let i = 0; i < results.length - 1; i++) {
        edges.push({ source: results[i].id, target: results[i + 1].id, sourceHandle: 'next' })
      }
      for (const r of results) {
        nodes.push(...r.nodes)
        edges.push(...r.edges)
      }
    }
  }

  return { nodes, edges }
}

function walkActions(actions, pathPrefix) {
  const results = []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (!action || typeof action !== 'object') continue
    const path = `${pathPrefix}.${i}`
    const nodeId = nextId('action')

    const resultNodes = []
    const resultEdges = []

    // Determine schema flags from data (replicating what loadGameData does)
    const hasSingleCondition = action._conditionNode != null
    const hasMultiCondition = Array.isArray(action._conditionsNode) && action._conditionsNode.length > 0
    const hasBranches = !!(action._succeedNodes || action._failNodes)

    resultNodes.push({
      id: nodeId,
      data: {
        nodeType: action.$type,
        actionNode: action,   // store ref to original
        isEventTrigger: false,
        isCondition: false,
        treePath: path,
      },
    })

    // _conditionNode
    if (hasSingleCondition && action._conditionNode) {
      const condNode = action._conditionNode
      const condId = nextId('cond')
      resultNodes.push({
        id: condId,
        data: {
          nodeType: condNode.$type,
          actionNode: condNode,
          isCondition: true,
          treePath: `${path}.condition`,
        },
      })
      resultEdges.push({
        source: condId, target: nodeId,
        sourceHandle: 'bool_out', targetHandle: 'condition',
      })
    }

    // _conditionsNode
    if (hasMultiCondition) {
      const conds = action._conditionsNode
      for (let ci = 0; ci < conds.length; ci++) {
        const cn = conds[ci]
        if (!cn || typeof cn !== 'object') continue
        const condId = nextId('cond')
        resultNodes.push({
          id: condId,
          data: {
            nodeType: cn.$type,
            actionNode: cn,
            isCondition: true,
            treePath: `${path}.conditions.${ci}`,
          },
        })
        resultEdges.push({
          source: condId, target: nodeId,
          sourceHandle: 'bool_out', targetHandle: `condition_${ci}`,
        })
      }
    }

    // _succeedNodes
    if (action._succeedNodes && action._succeedNodes.length > 0) {
      const sr = walkActions(action._succeedNodes, `${path}.succeed`)
      if (sr.length > 0) {
        resultEdges.push({ source: nodeId, target: sr[0].id, sourceHandle: 'true' })
        connectSeq(sr, resultEdges)
        for (const r of sr) { resultNodes.push(...r.nodes); resultEdges.push(...r.edges) }
      }
    }

    // _failNodes
    if (action._failNodes && action._failNodes.length > 0) {
      const fr = walkActions(action._failNodes, `${path}.fail`)
      if (fr.length > 0) {
        resultEdges.push({ source: nodeId, target: fr[0].id, sourceHandle: 'false' })
        connectSeq(fr, resultEdges)
        for (const r of fr) { resultNodes.push(...r.nodes); resultEdges.push(...r.edges) }
      }
    }

    results.push({ id: nodeId, nodes: resultNodes, edges: resultEdges })
  }
  return results
}

function connectSeq(results, edges) {
  for (let j = 0; j < results.length - 1; j++) {
    edges.push({ source: results[j].id, target: results[j + 1].id, sourceHandle: 'next' })
  }
}

/** Re-implement graphToTree (the reverse path). */
function graphToTreeSimple(nodes, edges) {
  const outEdges = new Map()
  const inEdges = new Map()
  for (const e of edges) {
    const ol = outEdges.get(e.source) ?? []; ol.push(e); outEdges.set(e.source, ol)
    const il = inEdges.get(e.target) ?? []; il.push(e); inEdges.set(e.target, il)
  }
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const eventToActions = {}
  const triggers = nodes.filter(n => n.data?.isEventTrigger)

  for (const trigger of triggers) {
    const eventType = trigger.data?.eventType
    if (!eventType) continue
    const nextE = (outEdges.get(trigger.id) ?? []).find(e => e.sourceHandle === 'next')
    if (!nextE) { eventToActions[eventType] = []; continue }
    eventToActions[eventType] = reconstructChain(nextE.target, outEdges, inEdges, nodeMap)
  }

  return { eventToActions }
}

function reconstructChain(startId, outEdges, inEdges, nodeMap) {
  const result = []
  const visited = new Set()
  let currentId = startId
  while (currentId) {
    if (visited.has(currentId)) break
    visited.add(currentId)
    const node = nodeMap.get(currentId)
    if (!node || node.data?.isEventTrigger) break
    result.push(rebuildActionNode(node, outEdges, inEdges, nodeMap))
    const ne = (outEdges.get(currentId) ?? []).find(e => e.sourceHandle === 'next')
    currentId = ne?.target ?? null
  }
  return result
}

function rebuildActionNode(node, outEdges, inEdges, nodeMap) {
  const data = node.data
  const original = data.actionNode
  const result = original ? JSON.parse(JSON.stringify(original)) : { $type: data.nodeType }

  const nexts = outEdges.get(node.id) ?? []
  const ins = inEdges.get(node.id) ?? []

  // _conditionNode
  const condEdge = ins.find(e => e.targetHandle === 'condition')
  if (condEdge) {
    const cn = nodeMap.get(condEdge.source)
    if (cn?.data?.actionNode) result._conditionNode = JSON.parse(JSON.stringify(cn.data.actionNode))
  } else if ('_conditionNode' in result) {
    result._conditionNode = null
  }

  // _conditionsNode
  const conditionEdges = ins
    .filter(e => e.targetHandle && e.targetHandle.startsWith('condition_'))
    .sort((a, b) => parseInt(a.targetHandle.replace('condition_', '')) - parseInt(b.targetHandle.replace('condition_', '')))
  if (conditionEdges.length > 0) {
    result._conditionsNode = conditionEdges.map(ce => {
      const cn = nodeMap.get(ce.source)
      return cn?.data?.actionNode ? JSON.parse(JSON.stringify(cn.data.actionNode)) : { $type: 'unknown' }
    })
  } else if ('_conditionsNode' in result) {
    result._conditionsNode = original?._conditionsNode ?? []
  }

  // _isAnd
  if ('_isAnd' in result || original?._isAnd !== undefined) {
    result._isAnd = original?._isAnd ?? true
  }

  // _succeedNodes
  const trueEdge = nexts.find(e => e.sourceHandle === 'true')
  if (trueEdge) {
    result._succeedNodes = reconstructChain(trueEdge.target, outEdges, inEdges, nodeMap)
  } else if ('_succeedNodes' in result) {
    result._succeedNodes = original?._succeedNodes ?? null
  }

  // _failNodes
  const falseEdge = nexts.find(e => e.sourceHandle === 'false')
  if (falseEdge) {
    result._failNodes = reconstructChain(falseEdge.target, outEdges, inEdges, nodeMap)
  } else if ('_failNodes' in result) {
    result._failNodes = original?._failNodes ?? null
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Load data
// ═══════════════════════════════════════════════════════════════════════

console.log('Loading game data from', DATA_PATH)
const raw = readFileSync(DATA_PATH, 'utf-8')
const parsed = JSON.parse(raw)
const templateKeys = Object.keys(parsed)
console.log(`Loaded ${templateKeys.length} templates\n`)

// ═══════════════════════════════════════════════════════════════════════
// Helpers for deep comparison
// ═══════════════════════════════════════════════════════════════════════

function typeTag(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const k of ka) {
      if (!Object.hasOwn(b, k)) return false
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

/** Deep diff two objects. Returns list of { path, type, detail }. */
function deepDiff(a, b, path = '') {
  const diffs = []
  if (a === b) return diffs

  const ta = typeTag(a)
  const tb = typeTag(b)
  if (ta !== tb) {
    diffs.push({ path: path || '(root)', type: 'type_change', detail: `${ta} -> ${tb}`, valueA: a, valueB: b })
    return diffs
  }

  if (ta === 'array') {
    if (a.length !== b.length) {
      diffs.push({ path: path || '(root)', type: 'array_length', detail: `${a.length} -> ${b.length}` })
    }
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) {
        diffs.push({ path: `${path}[${i}]`, type: 'extra_in_output', detail: `value=${JSON.stringify(b[i])?.slice(0,80)}` })
      } else if (i >= b.length) {
        diffs.push({ path: `${path}[${i}]`, type: 'missing_in_output', detail: `value=${JSON.stringify(a[i])?.slice(0,80)}` })
      } else {
        diffs.push(...deepDiff(a[i], b[i], `${path}[${i}]`))
      }
    }
    return diffs
  }

  if (ta === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    const allKeys = new Set([...ka, ...kb])

    // Key order check
    const commonKeys = ka.filter(k => kb.includes(k))
    const commonInB = kb.filter(k => ka.includes(k))
    if (commonKeys.join(',') !== commonInB.join(',')) {
      diffs.push({ path: path || '(root)', type: 'key_order_change', detail: `input=[${commonKeys.slice(0,5).join(',')}...] output=[${commonInB.slice(0,5).join(',')}...]` })
    }

    for (const k of allKeys) {
      const kpath = path ? `${path}.${k}` : k
      if (!Object.hasOwn(a, k)) {
        diffs.push({ path: kpath, type: 'extra_key_in_output', detail: `value=${JSON.stringify(b[k])?.slice(0,80)}` })
      } else if (!Object.hasOwn(b, k)) {
        diffs.push({ path: kpath, type: 'missing_key_in_output', detail: `value=${JSON.stringify(a[k])?.slice(0,80)}` })
      } else {
        diffs.push(...deepDiff(a[k], b[k], kpath))
      }
    }
    return diffs
  }

  // Primitives
  if (a !== b) {
    diffs.push({ path: path || '(root)', type: 'value_change', detail: `${JSON.stringify(a)} -> ${JSON.stringify(b)}` })
  }
  return diffs
}

// ═══════════════════════════════════════════════════════════════════════
// Collect all nodes by walking every template
// ═══════════════════════════════════════════════════════════════════════

/** allNodesByType: Map<normalizedType, ActionNode[]> */
const allNodesByType = new Map()
/** canonicalByType: first instance of each type */
const canonicalByType = new Map()

function collectNode(node) {
  if (!node || typeof node !== 'object' || !node.$type) return
  const key = normalizeType(node.$type)
  if (!allNodesByType.has(key)) allNodesByType.set(key, [])
  allNodesByType.get(key).push(node)
  if (!canonicalByType.has(key)) canonicalByType.set(key, JSON.parse(JSON.stringify(node)))

  // Recurse into tree keys
  for (const tk of [...GRAPH_TREE_KEYS, ...OPAQUE_TREE_KEYS]) {
    const child = node[tk]
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      collectNode(child)
    } else if (Array.isArray(child)) {
      for (const item of child) collectNode(item)
    }
  }
}

for (const [, tmpl] of Object.entries(parsed)) {
  if (!tmpl?.eventToActions) continue
  for (const actions of Object.values(tmpl.eventToActions)) {
    if (Array.isArray(actions)) {
      for (const a of actions) collectNode(a)
    }
  }
}

console.log(`Collected ${allNodesByType.size} distinct node types\n`)

// ═══════════════════════════════════════════════════════════════════════
// PART 1: buildDefaultNode comparison
// ═══════════════════════════════════════════════════════════════════════

console.log('='.repeat(80))
console.log('PART 1: buildDefaultNode comparison')
console.log('='.repeat(80))

let part1_keySetInconsistencies = 0
let part1_missingKeys = 0
let part1_extraKeys = 0
let part1_typeMismatches = 0

const part1Issues = []

for (const [normalizedType, instances] of allNodesByType) {
  // 1a. Check: do all instances of this type have the EXACT same set of keys?
  const keySets = instances.map(inst => Object.keys(inst).sort().join('|'))
  const uniqueKeySets = [...new Set(keySets)]

  if (uniqueKeySets.length > 1) {
    part1_keySetInconsistencies++
    // Count each variant
    const freq = {}
    for (const ks of keySets) { freq[ks] = (freq[ks] || 0) + 1 }
    const variants = Object.entries(freq).sort((a, b) => b[1] - a[1])
    const shortName = shortTypeName(normalizedType)

    part1Issues.push({
      type: 'key_set_inconsistency',
      nodeType: shortName,
      fullType: normalizedType,
      instanceCount: instances.length,
      variantCount: uniqueKeySets.length,
      variants: variants.map(([ks, count]) => ({ keys: ks.split('|'), count })),
    })
  }

  // 1b. Simulate buildDefaultNode
  const canonical = canonicalByType.get(normalizedType)
  if (!canonical) continue
  const defaultNode = JSON.parse(JSON.stringify(canonical))
  defaultNode.$type = canonical.$type
  sanitiseForNew(defaultNode)

  const defaultKeys = new Set(Object.keys(defaultNode))

  // Collect the union of all keys across all real instances
  const allRealKeys = new Set()
  for (const inst of instances) {
    for (const k of Object.keys(inst)) allRealKeys.add(k)
  }

  // Missing: keys in real data but not in default
  for (const k of allRealKeys) {
    if (!defaultKeys.has(k)) {
      part1_missingKeys++
      part1Issues.push({
        type: 'missing_key_in_default',
        nodeType: shortTypeName(normalizedType),
        fullType: normalizedType,
        key: k,
        instancesWithKey: instances.filter(inst => k in inst).length,
        totalInstances: instances.length,
      })
    }
  }

  // Extra: keys in default but not in any real data
  for (const k of defaultKeys) {
    if (!allRealKeys.has(k)) {
      part1_extraKeys++
      part1Issues.push({
        type: 'extra_key_in_default',
        nodeType: shortTypeName(normalizedType),
        fullType: normalizedType,
        key: k,
      })
    }
  }

  // 1c. Type comparison: for each key in default, compare the type of the default value
  //     vs the types seen in real data
  for (const k of defaultKeys) {
    if (!allRealKeys.has(k)) continue
    const defaultType = typeTag(defaultNode[k])
    const realTypes = new Set()
    for (const inst of instances) {
      if (k in inst) realTypes.add(typeTag(inst[k]))
    }
    // The default type should match at least one real type
    if (!realTypes.has(defaultType) && realTypes.size > 0) {
      // Exception: sanitised tree keys are expected to be null/[]
      if (TREE_KEYS.has(k)) continue
      // sanitised arrays become []
      if (defaultType === 'array' && realTypes.has('array')) continue
      part1_typeMismatches++
      part1Issues.push({
        type: 'type_mismatch',
        nodeType: shortTypeName(normalizedType),
        fullType: normalizedType,
        key: k,
        defaultType,
        realTypes: [...realTypes],
      })
    }
  }
}

console.log(`\n--- Summary ---`)
console.log(`Node types with inconsistent key sets across instances: ${part1_keySetInconsistencies}`)
console.log(`Keys missing from buildDefaultNode output: ${part1_missingKeys}`)
console.log(`Extra keys in buildDefaultNode output: ${part1_extraKeys}`)
console.log(`Type mismatches between default and real data: ${part1_typeMismatches}`)

if (part1Issues.length > 0) {
  console.log(`\n--- Part 1 Detailed Issues (${part1Issues.length} total) ---`)
  // Group by issue type
  const byType = {}
  for (const issue of part1Issues) {
    if (!byType[issue.type]) byType[issue.type] = []
    byType[issue.type].push(issue)
  }

  for (const [issueType, issues] of Object.entries(byType)) {
    console.log(`\n  [${issueType}] (${issues.length} issues)`)
    // Show first 15 of each type
    for (const iss of issues.slice(0, 15)) {
      if (issueType === 'key_set_inconsistency') {
        console.log(`    ${iss.nodeType} (${iss.instanceCount} instances, ${iss.variantCount} key-set variants)`)
        for (const v of iss.variants.slice(0, 3)) {
          console.log(`      ${v.count}x: [${v.keys.join(', ')}]`)
        }
        if (iss.variants.length > 3) console.log(`      ... and ${iss.variants.length - 3} more variants`)
      } else if (issueType === 'missing_key_in_default') {
        console.log(`    ${iss.nodeType}.${iss.key}  (in ${iss.instancesWithKey}/${iss.totalInstances} instances)`)
      } else if (issueType === 'extra_key_in_default') {
        console.log(`    ${iss.nodeType}.${iss.key}`)
      } else if (issueType === 'type_mismatch') {
        console.log(`    ${iss.nodeType}.${iss.key}  default=${iss.defaultType}  real=${iss.realTypes.join(',')}`)
      }
    }
    if (issues.length > 15) console.log(`    ... and ${issues.length - 15} more`)
  }
} else {
  console.log(`  No issues found in Part 1.`)
}

// ═══════════════════════════════════════════════════════════════════════
// PART 2: Round-trip comparison (treeToGraph -> graphToTree)
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(80)}`)
console.log('PART 2: Round-trip comparison (treeToGraph -> graphToTree)')
console.log('='.repeat(80))

let part2_perfect = 0
let part2_withDiffs = 0
let part2_totalDiffs = 0

// Categorize diffs
const diffCategoryCounts = {}
// Track unique diff patterns (type + key path pattern) to avoid excessive noise
const uniqueDiffPatterns = new Map()
// Per-template diff details (keep first N templates' full diffs)
const MAX_DETAIL_TEMPLATES = 20
const detailedTemplateDiffs = []

// Track diffs by whether they're in tree-structure keys or data properties
let treeKeyDiffs = 0
let dataPropertyDiffs = 0

let templatesProcessed = 0

for (const [templateKey, tmpl] of Object.entries(parsed)) {
  if (!tmpl?.eventToActions) continue
  templatesProcessed++

  const inputETA = tmpl.eventToActions

  // treeToGraph
  const { nodes, edges } = treeToGraphSimple({
    templateKey: tmpl.templateKey,
    effectKey: tmpl.effectKey,
    onEventPriority: tmpl.onEventPriority,
    eventToActions: inputETA,
  })

  // graphToTree
  const output = graphToTreeSimple(nodes, edges)
  const outputETA = output.eventToActions

  // Compare input vs output eventToActions
  const diffs = deepDiff(inputETA, outputETA)

  if (diffs.length === 0) {
    part2_perfect++
  } else {
    part2_withDiffs++
    part2_totalDiffs += diffs.length

    if (detailedTemplateDiffs.length < MAX_DETAIL_TEMPLATES) {
      detailedTemplateDiffs.push({ templateKey, diffCount: diffs.length, diffs: diffs.slice(0, 20) })
    }

    for (const d of diffs) {
      diffCategoryCounts[d.type] = (diffCategoryCounts[d.type] || 0) + 1

      // Classify: tree-structure key diff or data property diff?
      // Extract the deepest key name from the path
      const pathParts = d.path.replace(/\[\d+\]/g, '[]').split('.')
      const isTreeRelated = pathParts.some(p => TREE_KEYS.has(p) || GRAPH_TREE_KEYS.has(p) || OPAQUE_TREE_KEYS.has(p))
      if (isTreeRelated) treeKeyDiffs++
      else dataPropertyDiffs++

      // Track unique patterns: normalise array indices
      const patternKey = `${d.type}||${d.path.replace(/\[\d+\]/g, '[N]').replace(/\.\d+\./g, '.N.')}`
      const existing = uniqueDiffPatterns.get(patternKey) || { count: 0, examples: [] }
      existing.count++
      if (existing.examples.length < 3) existing.examples.push({ template: templateKey, detail: d.detail })
      uniqueDiffPatterns.set(patternKey, existing)
    }
  }
}

console.log(`\n--- Summary ---`)
console.log(`Templates processed: ${templatesProcessed}`)
console.log(`Perfect round-trips: ${part2_perfect}`)
console.log(`Templates with diffs: ${part2_withDiffs}`)
console.log(`Total individual diffs: ${part2_totalDiffs}`)
console.log(`  Tree-structure key diffs: ${treeKeyDiffs}`)
console.log(`  Data property diffs:      ${dataPropertyDiffs}`)

console.log(`\n--- Diff category breakdown ---`)
for (const [cat, count] of Object.entries(diffCategoryCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`)
}

console.log(`\n--- Unique diff patterns (${uniqueDiffPatterns.size} patterns) ---`)
const sortedPatterns = [...uniqueDiffPatterns.entries()].sort((a, b) => b[1].count - a[1].count)
for (const [pattern, info] of sortedPatterns.slice(0, 40)) {
  const [type, path] = pattern.split('||')
  console.log(`  [${type}] path="${path}" (${info.count} occurrences)`)
  for (const ex of info.examples.slice(0, 2)) {
    console.log(`    example: template=${ex.template} detail=${ex.detail}`)
  }
}
if (sortedPatterns.length > 40) console.log(`  ... and ${sortedPatterns.length - 40} more patterns`)

if (detailedTemplateDiffs.length > 0) {
  console.log(`\n--- Detailed diffs for first ${detailedTemplateDiffs.length} affected templates ---`)
  for (const td of detailedTemplateDiffs.slice(0, 10)) {
    console.log(`\n  Template: ${td.templateKey} (${td.diffCount} diffs)`)
    for (const d of td.diffs.slice(0, 10)) {
      console.log(`    ${d.type} at ${d.path}: ${d.detail}`)
    }
    if (td.diffs.length > 10) console.log(`    ... and ${td.diffCount - 10} more`)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PART 3: Node type classification
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(80)}`)
console.log('PART 3: Node type classification')
console.log('='.repeat(80))

// For each node type, determine:
// - Is it ever used as a condition node?
// - Does it have branches (_succeedNodes/_failNodes)?
// - Does it have conditions (_conditionNode/_conditionsNode)?
// - Does it have opaque tree keys?
// - Which tree keys does it actually use?

const classificationMap = new Map()

function classifyNode(node, isConditionRole) {
  if (!node || typeof node !== 'object' || !node.$type) return
  const key = normalizeType(node.$type)

  if (!classificationMap.has(key)) {
    classificationMap.set(key, {
      shortName: shortTypeName(node.$type),
      fullType: node.$type,
      usedAsCondition: false,
      hasBranches: false,
      hasCondition: false,
      hasMultiCondition: false,
      opaqueKeys: new Set(),
      allTreeKeys: new Set(),
      allDataKeys: new Set(),
      instanceCount: 0,
    })
  }

  const info = classificationMap.get(key)
  info.instanceCount++

  if (isConditionRole) info.usedAsCondition = true

  for (const k of Object.keys(node)) {
    if (k === '$type') continue
    if (GRAPH_TREE_KEYS.has(k) || OPAQUE_TREE_KEYS.has(k) || k === '_isAnd') {
      info.allTreeKeys.add(k)
    } else {
      info.allDataKeys.add(k)
    }
  }

  if (node._succeedNodes !== undefined || node._failNodes !== undefined) info.hasBranches = true
  if (node._conditionNode !== undefined) info.hasCondition = true
  if (node._conditionsNode !== undefined) info.hasMultiCondition = true

  for (const ok of OPAQUE_TREE_KEYS) {
    if (node[ok] !== undefined && node[ok] !== null) {
      info.opaqueKeys.add(ok)
    }
  }

  // Recurse
  if (node._conditionNode && typeof node._conditionNode === 'object') {
    classifyNode(node._conditionNode, true)
  }
  if (Array.isArray(node._conditionsNode)) {
    for (const c of node._conditionsNode) classifyNode(c, true)
  }
  if (Array.isArray(node._succeedNodes)) {
    for (const c of node._succeedNodes) classifyNode(c, false)
  }
  if (Array.isArray(node._failNodes)) {
    for (const c of node._failNodes) classifyNode(c, false)
  }
  for (const ok of OPAQUE_TREE_KEYS) {
    const child = node[ok]
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      classifyNode(child, false)
    } else if (Array.isArray(child)) {
      for (const item of child) classifyNode(item, false)
    }
  }
}

for (const [, tmpl] of Object.entries(parsed)) {
  if (!tmpl?.eventToActions) continue
  for (const actions of Object.values(tmpl.eventToActions)) {
    if (Array.isArray(actions)) {
      for (const a of actions) classifyNode(a, false)
    }
  }
}

// Now check which types would be INCORRECTLY classified by the current schema system
// The current schema system detects:
// - hasBranches: if ANY instance has _succeedNodes or _failNodes
// - hasCondition: if ANY instance has _conditionNode (non-null)
// - hasMultiCondition: if ANY instance has _conditionsNode (as array)
// - usedAsCondition: if ANY instance appears inside _conditionNode or _conditionsNode

console.log(`\n--- Node types with opaque tree keys ---`)
let opaqueCount = 0
for (const [type, info] of classificationMap) {
  if (info.opaqueKeys.size > 0) {
    opaqueCount++
    console.log(`  ${info.shortName}: ${[...info.opaqueKeys].join(', ')}  (${info.instanceCount} instances)`)
  }
}
console.log(`Total: ${opaqueCount} types have opaque tree keys`)

console.log(`\n--- Node types used as conditions ---`)
let condTypeCount = 0
for (const [type, info] of classificationMap) {
  if (info.usedAsCondition) {
    condTypeCount++
    // Also flag if it has branches (unusual for conditions)
    const flags = []
    if (info.hasBranches) flags.push('HAS_BRANCHES')
    if (info.hasCondition) flags.push('HAS_CONDITION')
    if (info.hasMultiCondition) flags.push('HAS_MULTI_CONDITION')
    if (info.opaqueKeys.size > 0) flags.push(`OPAQUE[${[...info.opaqueKeys].join(',')}]`)
    console.log(`  ${info.shortName}  (${info.instanceCount} instances)  ${flags.length > 0 ? flags.join(' ') : ''}`)
  }
}
console.log(`Total: ${condTypeCount} types used as conditions`)

console.log(`\n--- Node types with branches ---`)
let branchCount = 0
for (const [type, info] of classificationMap) {
  if (info.hasBranches) {
    branchCount++
    const flags = []
    if (info.hasCondition) flags.push('single_condition')
    if (info.hasMultiCondition) flags.push('multi_condition')
    if (!info.hasCondition && !info.hasMultiCondition) flags.push('NO_CONDITION (branches without condition?)')
    console.log(`  ${info.shortName}  (${info.instanceCount} instances)  ${flags.join(' ')}`)
  }
}
console.log(`Total: ${branchCount} types with branches`)

// Look for UNKNOWN tree keys — keys starting with _ that aren't in our TREE_KEYS set
// but contain nested ActionNodes
console.log(`\n--- Potential UNKNOWN tree keys ---`)
const knownTreeKeys = new Set([...TREE_KEYS])
const unknownTreeKeyCandidates = new Map()  // key -> { nodeTypes, count }

function scanForUnknownTreeKeys(node, parentType) {
  if (!node || typeof node !== 'object' || !node.$type) return
  for (const [k, v] of Object.entries(node)) {
    if (knownTreeKeys.has(k)) continue
    // Check if value is an ActionNode or array of ActionNodes
    if (v && typeof v === 'object' && !Array.isArray(v) && v.$type) {
      if (!unknownTreeKeyCandidates.has(k)) unknownTreeKeyCandidates.set(k, { nodeTypes: new Set(), count: 0 })
      const info = unknownTreeKeyCandidates.get(k)
      info.nodeTypes.add(shortTypeName(node.$type))
      info.count++
    }
    if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === 'object' && v[0].$type) {
      if (!unknownTreeKeyCandidates.has(k)) unknownTreeKeyCandidates.set(k, { nodeTypes: new Set(), count: 0 })
      const info = unknownTreeKeyCandidates.get(k)
      info.nodeTypes.add(shortTypeName(node.$type))
      info.count++
    }
  }
  // Recurse
  for (const tk of [...GRAPH_TREE_KEYS, ...OPAQUE_TREE_KEYS]) {
    const child = node[tk]
    if (child && typeof child === 'object' && !Array.isArray(child)) scanForUnknownTreeKeys(child)
    else if (Array.isArray(child)) { for (const item of child) scanForUnknownTreeKeys(item) }
  }
}

for (const [, tmpl] of Object.entries(parsed)) {
  if (!tmpl?.eventToActions) continue
  for (const actions of Object.values(tmpl.eventToActions)) {
    if (Array.isArray(actions)) {
      for (const a of actions) scanForUnknownTreeKeys(a)
    }
  }
}

if (unknownTreeKeyCandidates.size > 0) {
  for (const [key, info] of unknownTreeKeyCandidates) {
    console.log(`  Key "${key}" contains ActionNode(s) but is NOT in TREE_KEYS`)
    console.log(`    Found in ${info.count} instances across types: ${[...info.nodeTypes].join(', ')}`)
  }
} else {
  console.log(`  None found — all keys containing ActionNodes are in TREE_KEYS.`)
}

// Check for misclassification: types that sometimes have tree keys and sometimes don't
console.log(`\n--- Potential misclassification issues ---`)
let misclassCount = 0

for (const [type, info] of classificationMap) {
  const issues = []

  // Type has branches in SOME instances but canonical might not
  if (info.hasBranches) {
    const canonical = canonicalByType.get(type)
    if (canonical && !('_succeedNodes' in canonical) && !('_failNodes' in canonical)) {
      issues.push(`Schema says hasBranches but canonical instance lacks _succeedNodes/_failNodes`)
    }
  }

  // Type has condition in SOME instances but canonical might not
  if (info.hasCondition) {
    const canonical = canonicalByType.get(type)
    if (canonical && !('_conditionNode' in canonical)) {
      issues.push(`Schema says hasCondition but canonical instance lacks _conditionNode`)
    }
  }

  if (info.hasMultiCondition) {
    const canonical = canonicalByType.get(type)
    if (canonical && !('_conditionsNode' in canonical)) {
      issues.push(`Schema says hasMultiCondition but canonical instance lacks _conditionsNode`)
    }
  }

  if (issues.length > 0) {
    misclassCount++
    console.log(`  ${info.shortName}:`)
    for (const iss of issues) console.log(`    - ${iss}`)
  }
}

if (misclassCount === 0) {
  console.log(`  No misclassification issues found.`)
} else {
  console.log(`\nTotal types with potential misclassification: ${misclassCount}`)
}

// ═══════════════════════════════════════════════════════════════════════
// PART 4: Quick summary
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${'='.repeat(80)}`)
console.log('OVERALL SUMMARY')
console.log('='.repeat(80))
console.log(`
Part 1 (buildDefaultNode):
  Node types with inconsistent key sets: ${part1_keySetInconsistencies}
  Keys missing from defaults:            ${part1_missingKeys}
  Extra keys in defaults:                ${part1_extraKeys}
  Type mismatches:                       ${part1_typeMismatches}

Part 2 (Round-trip):
  Templates processed:     ${templatesProcessed}
  Perfect round-trips:     ${part2_perfect} (${(100*part2_perfect/templatesProcessed).toFixed(1)}%)
  Templates with diffs:    ${part2_withDiffs} (${(100*part2_withDiffs/templatesProcessed).toFixed(1)}%)
  Total diffs:             ${part2_totalDiffs}
  Tree-structure diffs:    ${treeKeyDiffs}
  Data property diffs:     ${dataPropertyDiffs}

Part 3 (Classification):
  Types with opaque keys:       ${opaqueCount}
  Types used as conditions:     ${condTypeCount}
  Types with branches:          ${branchCount}
  Unknown tree-key candidates:  ${unknownTreeKeyCandidates.size}
  Misclassified types:          ${misclassCount}
`)
