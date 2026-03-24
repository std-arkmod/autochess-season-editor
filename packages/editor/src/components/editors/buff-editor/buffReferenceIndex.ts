/**
 * Buff 引用索引 — 构建 buff 模板之间的引用关系和游戏实体归属
 */

import type { BuffTemplate, ActionNode } from '@autochess-editor/shared'

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])

export interface EntityOwner {
  type: 'skill' | 'talent' | 'equip' | 'enemy' | 'token' | 'other'
  entityId: string
  entityName: string
  detail: string
}

export interface UsageExample {
  templateKey: string
  eventType: string
  props: Record<string, unknown>
}

export interface BuffReferenceIndex {
  /** templateKey → set of other templateKeys that reference it */
  referencedBy: Map<string, Set<string>>
  /** templateKey → set of other templateKeys it references */
  dependsOn: Map<string, Set<string>>
  /** templateKey → list of game entities (character skill/talent/equip/enemy) */
  entityOwners: Map<string, EntityOwner[]>
  /** shortName (node $type) → usage examples across game data */
  nodeTypeUsage: Map<string, UsageExample[]>
  /** All known templateKeys (for quick membership test) */
  allTemplateKeys: Set<string>
}

const MAX_USAGE_EXAMPLES = 8

/** Build the buff-to-buff reference index from loaded templates */
export function buildBuffIndex(
  templates: Record<string, BuffTemplate>,
): BuffReferenceIndex {
  const referencedBy = new Map<string, Set<string>>()
  const dependsOn = new Map<string, Set<string>>()
  const nodeTypeUsage = new Map<string, UsageExample[]>()
  const allTemplateKeys = new Set(Object.keys(templates))

  for (const [sourceKey, template] of Object.entries(templates)) {
    if (!template.eventToActions) continue
    for (const [eventType, actions] of Object.entries(template.eventToActions)) {
      if (!Array.isArray(actions)) continue
      for (const action of actions) {
        walkForRefs(action as ActionNode, sourceKey, eventType, allTemplateKeys, referencedBy, dependsOn, nodeTypeUsage)
      }
    }
  }

  return { referencedBy, dependsOn, entityOwners: new Map(), nodeTypeUsage, allTemplateKeys }
}

function walkForRefs(
  node: ActionNode,
  sourceKey: string,
  eventType: string,
  allKeys: Set<string>,
  referencedBy: Map<string, Set<string>>,
  dependsOn: Map<string, Set<string>>,
  nodeTypeUsage: Map<string, UsageExample[]>,
) {
  if (!node || typeof node !== 'object') return
  const $type = node.$type as string
  if (!$type) return

  // Collect node type usage
  const shortName = $type.replace(/, Assembly-CSharp$/i, '').split(/[.+]/).pop() ?? $type
  const examples = nodeTypeUsage.get(shortName)
  if (!examples) {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (!TREE_KEYS.has(k) && (v === null || typeof v !== 'object')) props[k] = v
    }
    nodeTypeUsage.set(shortName, [{ templateKey: sourceKey, eventType, props }])
  } else if (examples.length < MAX_USAGE_EXAMPLES) {
    // Only add if from a different template
    if (!examples.some(e => e.templateKey === sourceKey)) {
      const props: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node)) {
        if (!TREE_KEYS.has(k) && (v === null || typeof v !== 'object')) props[k] = v
      }
      examples.push({ templateKey: sourceKey, eventType, props })
    }
  }

  // Detect buff references via _buff.templateKey
  const buff = node._buff as Record<string, unknown> | undefined
  if (buff && typeof buff === 'object') {
    const targetKey = buff.templateKey as string
    if (targetKey && typeof targetKey === 'string' && targetKey !== sourceKey) {
      addRef(referencedBy, targetKey, sourceKey)
      addDep(dependsOn, sourceKey, targetKey)
    }
  }

  // Detect _buffKeys array
  const buffKeys = node._buffKeys
  if (Array.isArray(buffKeys)) {
    for (const bk of buffKeys) {
      if (typeof bk === 'string' && bk !== sourceKey) {
        addRef(referencedBy, bk, sourceKey)
        addDep(dependsOn, sourceKey, bk)
      }
    }
  }

  // Detect buff reference string props
  // _buffKey/_templateKey/_targetBuffKey are always buff references
  for (const prop of ['_buffKey', '_templateKey', '_targetBuffKey']) {
    const v = node[prop]
    if (typeof v === 'string' && v && v !== sourceKey) {
      addRef(referencedBy, v, sourceKey)
      addDep(dependsOn, sourceKey, v)
    }
  }
  // _key is only a buff reference if it matches a known template key
  const keyVal = node._key
  if (typeof keyVal === 'string' && keyVal && allKeys.has(keyVal) && keyVal !== sourceKey) {
    addRef(referencedBy, keyVal, sourceKey)
    addDep(dependsOn, sourceKey, keyVal)
  }

  // Recurse tree
  if (node._conditionNode && typeof node._conditionNode === 'object') {
    walkForRefs(node._conditionNode as ActionNode, sourceKey, eventType, allKeys, referencedBy, dependsOn, nodeTypeUsage)
  }
  if (Array.isArray(node._conditionsNode)) {
    for (const c of node._conditionsNode) walkForRefs(c as ActionNode, sourceKey, eventType, allKeys, referencedBy, dependsOn, nodeTypeUsage)
  }
  if (Array.isArray(node._succeedNodes)) {
    for (const n of node._succeedNodes) walkForRefs(n as ActionNode, sourceKey, eventType, allKeys, referencedBy, dependsOn, nodeTypeUsage)
  }
  if (Array.isArray(node._failNodes)) {
    for (const n of node._failNodes) walkForRefs(n as ActionNode, sourceKey, eventType, allKeys, referencedBy, dependsOn, nodeTypeUsage)
  }
}

function addRef(map: Map<string, Set<string>>, target: string, source: string) {
  let s = map.get(target)
  if (!s) { s = new Set(); map.set(target, s) }
  s.add(source)
}

function addDep(map: Map<string, Set<string>>, source: string, target: string) {
  let s = map.get(source)
  if (!s) { s = new Set(); map.set(source, s) }
  s.add(target)
}

/**
 * Build entity owner index from character/skill/enemy tables.
 * This is called lazily when the user opens the references panel.
 */
export async function buildEntityOwnerIndex(
  index: BuffReferenceIndex,
  onProgress?: (detail: string) => void,
): Promise<void> {
  if (index.entityOwners.size > 0) return // already built

  try {
    onProgress?.('下载角色数据...')
    const [charRes, enemyRes] = await Promise.all([
      fetch('/character_table.json').catch(() => null),
      fetch('/enemy_handbook_table.json').catch(() => null),
    ])

    if (charRes?.ok) {
      onProgress?.('解析角色数据...')
      const chars = await charRes.json() as Record<string, any>
      for (const [charId, char] of Object.entries(chars)) {
        if (!char?.name) continue
        const name = char.name as string

        // Extract key prefix from charId: char_NNN_xxx → xxx
        const m = charId.match(/^char_\d+_(\w+)$/)
        if (!m) continue
        const prefix = m[1]

        // Skills: prefix_s_N
        const skills = char.skills as { skillId: string; overrideTokenKey?: string }[] | undefined
        if (Array.isArray(skills)) {
          skills.forEach((sk, i) => {
            const pattern = `${prefix}_s_${i}`
            for (const tKey of index.allTemplateKeys) {
              if (tKey.startsWith(pattern)) {
                addOwner(index.entityOwners, tKey, {
                  type: 'skill',
                  entityId: charId,
                  entityName: name,
                  detail: `技能${i + 1}: ${sk.skillId}`,
                })
              }
            }
          })
        }

        // Talents: prefix_t_N
        const talents = char.talents as { candidates: { prefabKey: string; name: string }[] }[] | undefined
        if (Array.isArray(talents)) {
          talents.forEach((talent, i) => {
            const pattern = `${prefix}_t_${i}`
            const tName = talent.candidates?.[talent.candidates.length - 1]?.name ?? `天赋${i + 1}`
            for (const tKey of index.allTemplateKeys) {
              if (tKey.startsWith(pattern)) {
                addOwner(index.entityOwners, tKey, {
                  type: 'talent',
                  entityId: charId,
                  entityName: name,
                  detail: `天赋${i + 1}: ${tName}`,
                })
              }
            }
          })
        }
      }
    }

    if (enemyRes?.ok) {
      onProgress?.('解析敌人数据...')
      const enemies = await enemyRes.json() as Record<string, any>
      // enemy_handbook_table has enemyData
      const enemyData = enemies.enemyData ?? enemies
      for (const [enemyId, info] of Object.entries(enemyData as Record<string, any>)) {
        const eName = info?.name as string
        if (!eName) continue
        const em = enemyId.match(/^enemy_\d+_(\w+)$/)
        if (!em) continue
        const prefix = `enemy_${em[1]}`
        for (const tKey of index.allTemplateKeys) {
          if (tKey.startsWith(prefix)) {
            addOwner(index.entityOwners, tKey, {
              type: 'enemy',
              entityId: enemyId,
              entityName: eName,
              detail: `敌人: ${eName}`,
            })
          }
        }
      }
    }

    onProgress?.('')
  } catch (e) {
    console.error('Failed to build entity owner index:', e)
  }
}

function addOwner(map: Map<string, EntityOwner[]>, key: string, owner: EntityOwner) {
  let list = map.get(key)
  if (!list) { list = []; map.set(key, list) }
  // Deduplicate
  if (!list.some(o => o.entityId === owner.entityId && o.type === owner.type && o.detail === owner.detail)) {
    list.push(owner)
  }
}
