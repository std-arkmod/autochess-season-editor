/**
 * Tree-structure keys — keys whose values are child ActionNode(s),
 * not user-editable data properties.
 *
 * Split into two sets:
 *  - GRAPH_TREE_KEYS: represented as edges in the visual graph (editable)
 *  - OPAQUE_TREE_KEYS: preserved as-is in actionNode (not shown as edges)
 *  - TREE_KEYS: union of both (used to filter property display)
 */

/** Keys that the graph editor converts to edges / handles */
export const GRAPH_TREE_KEYS = new Set([
  '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode',
])

/** Keys that contain child ActionNode arrays but are NOT visualised as edges.
 *  They are stored opaquely inside actionNode and round-tripped verbatim. */
export const OPAQUE_TREE_KEYS = new Set([
  '_actions',            // EmitProjectile, EmitProjectileUseAbilitySelector
  '_actionsToTarget',    // RunActionsToWdslmAbilityTarget
  '_loopBody',           // Loop
  '_rightNodes',         // SwitchDirection, SwitchSourceDirection
  '_leftNodes',          // SwitchDirection, SwitchSourceDirection
  '_upNodes',            // SwitchDirection, SwitchSourceDirection
  '_downNodes',          // SwitchDirection, SwitchSourceDirection
  '_otherwiseActions',   // RandomAction
  '_attackTriggerNodes', // CheckCanTriggerLikeAttack
])

/** All structural keys — union of graph + opaque + meta ($type, _isAnd) */
export const TREE_KEYS = new Set([
  '$type', '_isAnd',
  ...GRAPH_TREE_KEYS,
  ...OPAQUE_TREE_KEYS,
])
