import { createContext, useContext } from 'react'
import type { BuffTemplate } from '@autochess-editor/shared'
import type { BuffReferenceIndex } from './buffReferenceIndex'
import type { LabelMode } from './enumRegistry'

export interface BuffEditorContextValue {
  goToDefinition: (templateKey: string) => void
  refIndex: BuffReferenceIndex | null
  refTemplates: Record<string, BuffTemplate> | null
  activeKey: string | null
  selectedNodeType: string | null
  labelMode: LabelMode
  isReadOnly: boolean
}

export const BuffEditorContext = createContext<BuffEditorContextValue>({
  goToDefinition: () => {},
  refIndex: null,
  refTemplates: null,
  activeKey: null,
  selectedNodeType: null,
  labelMode: 'cn',
  isReadOnly: false,
})

export function useBuffEditor() {
  return useContext(BuffEditorContext)
}
