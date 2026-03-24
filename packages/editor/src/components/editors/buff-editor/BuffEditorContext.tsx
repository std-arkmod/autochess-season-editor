import { createContext, useContext } from 'react'
import type { BuffTemplate } from '@autochess-editor/shared'
import type { BuffReferenceIndex } from './buffReferenceIndex'

export interface BuffEditorContextValue {
  goToDefinition: (templateKey: string) => void
  refIndex: BuffReferenceIndex | null
  refTemplates: Record<string, BuffTemplate> | null
  activeKey: string | null
  selectedNodeType: string | null
  showEnumLabels: boolean
}

export const BuffEditorContext = createContext<BuffEditorContextValue>({
  goToDefinition: () => {},
  refIndex: null,
  refTemplates: null,
  activeKey: null,
  selectedNodeType: null,
  showEnumLabels: true,
})

export function useBuffEditor() {
  return useContext(BuffEditorContext)
}
