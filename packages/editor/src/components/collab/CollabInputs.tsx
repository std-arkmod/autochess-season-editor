/**
 * Collab-aware input wrappers.
 *
 * Usage:
 *   <CollabEditingProvider itemId={editingId}>
 *     <CTextInput label="名称" value={...} onChange={...} />
 *   </CollabEditingProvider>
 *
 * Each wrapper automatically:
 *  - Uses `label` as the field identifier for presence tracking
 *  - Shows a FieldLockIndicator when another user is editing the same field
 *  - Sets readOnly when locked
 *  - Supports follow-mode auto-focus via ref
 */
import { createContext, useContext, type ReactNode, forwardRef, type ComponentPropsWithoutRef } from 'react'
import {
  TextInput, NumberInput, Textarea, Select, MultiSelect,
  Switch, ColorInput, SegmentedControl,
} from '@mantine/core'
import { useCollabField } from '../../hooks/useCollabField'
import { FieldLockIndicator } from './FieldLockIndicator'

// ---- Editing context: provides the current itemId ----

const CollabEditingContext = createContext<string | null>(null)

export function CollabEditingProvider({ itemId, children }: { itemId: string | null; children: ReactNode }) {
  return (
    <CollabEditingContext.Provider value={itemId}>
      {children}
    </CollabEditingContext.Provider>
  )
}

function useEditingId() {
  return useContext(CollabEditingContext)
}

// ---- Helper: extract field name from label ----
function fieldNameFromLabel(label: unknown): string {
  if (typeof label === 'string') return label
  return ''
}

/** Extra prop to explicitly specify the collab field name (overrides label) */
interface CollabFieldProp {
  /** Explicit collab field name, e.g. "effectDescList[0]". Overrides label-derived name. */
  collabField?: string
}

// ---- Wrapped components ----

type TextInputProps = ComponentPropsWithoutRef<typeof TextInput> & CollabFieldProp
export const CTextInput = forwardRef<HTMLInputElement, TextInputProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <TextInput
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
      rightSection={cf.lockedBy ? <FieldLockIndicator user={cf.lockedBy} /> : props.rightSection}
    />
  )
})
CTextInput.displayName = 'CTextInput'

type NumberInputProps = ComponentPropsWithoutRef<typeof NumberInput> & CollabFieldProp
export const CNumberInput = forwardRef<HTMLInputElement, NumberInputProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <NumberInput
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
      rightSection={cf.lockedBy ? <FieldLockIndicator user={cf.lockedBy} /> : props.rightSection}
    />
  )
})
CNumberInput.displayName = 'CNumberInput'

type TextareaProps = ComponentPropsWithoutRef<typeof Textarea> & CollabFieldProp
export const CTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <Textarea
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLTextAreaElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
    />
  )
})
CTextarea.displayName = 'CTextarea'

type SelectProps = ComponentPropsWithoutRef<typeof Select> & CollabFieldProp
export const CSelect = forwardRef<HTMLInputElement, SelectProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <Select
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
      rightSection={cf.lockedBy ? <FieldLockIndicator user={cf.lockedBy} /> : props.rightSection}
    />
  )
})
CSelect.displayName = 'CSelect'

type MultiSelectProps = ComponentPropsWithoutRef<typeof MultiSelect> & CollabFieldProp
export const CMultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <MultiSelect
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
    />
  )
})
CMultiSelect.displayName = 'CMultiSelect'

type SwitchProps = ComponentPropsWithoutRef<typeof Switch> & CollabFieldProp
export const CSwitch = forwardRef<HTMLInputElement, SwitchProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <Switch
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      disabled={cf.readOnly || props.disabled}
    />
  )
})
CSwitch.displayName = 'CSwitch'

type ColorInputProps = ComponentPropsWithoutRef<typeof ColorInput> & CollabFieldProp
export const CColorInput = forwardRef<HTMLInputElement, ColorInputProps>((props, _ref) => {
  const { collabField, ...rest } = props
  const itemId = useEditingId()
  const fieldName = collabField ?? fieldNameFromLabel(rest.label)
  const cf = useCollabField(itemId, fieldName)

  return (
    <ColorInput
      {...rest}
      ref={cf.followRef as React.RefObject<HTMLInputElement>}
      onFocus={e => { cf.onFocus(); props.onFocus?.(e) }}
      onBlur={e => { cf.onBlur(); props.onBlur?.(e) }}
      readOnly={cf.readOnly || props.readOnly}
    />
  )
})
CColorInput.displayName = 'CColorInput'

// SegmentedControl doesn't have label/ref/focus in the same way, wrap minimally
type SegmentedControlProps = ComponentPropsWithoutRef<typeof SegmentedControl>
export const CSegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>((props, ref) => {
  const itemId = useEditingId()
  const cf = useCollabField(itemId, (props as { 'data-field'?: string })['data-field'] ?? 'segment')

  return (
    <SegmentedControl
      {...props}
      ref={ref}
      disabled={cf.readOnly || props.disabled}
    />
  )
})
CSegmentedControl.displayName = 'CSegmentedControl'
