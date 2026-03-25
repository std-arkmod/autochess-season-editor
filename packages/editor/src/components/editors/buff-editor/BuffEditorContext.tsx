import { createContext, useContext } from 'react'
import type { BuffTemplate } from '@autochess-editor/shared'
import type { BuffReferenceIndex } from './buffReferenceIndex'
import type { LabelMode } from './enumRegistry'

export interface BuffEditorContextValue {
  goToDefinition: (templateKey: string) => void
  refIndex: BuffReferenceIndex | null
  refTemplates: Record<string, BuffTemplate> | null
  labelMode: LabelMode
  isReadOnly: boolean
  /** Update a property on a node's actionNode (with undo support) */
  onPropertyEdit: (nodeId: string, key: string, value: unknown) => void
}

export const BuffEditorContext = createContext<BuffEditorContextValue>({
  goToDefinition: () => {},
  refIndex: null,
  refTemplates: null,
  labelMode: 'cn',
  isReadOnly: false,
  onPropertyEdit: () => {},
})

export function useBuffEditor() {
  return useContext(BuffEditorContext)
}
