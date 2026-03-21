import { characterNameMap } from '../misc-game-data'
import type { AutoChessSeasonData, CharShopChessData } from '../autochess-season-data'

const sortCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

const IDENTIFIER_DICT_FIELDS = new Set<keyof AutoChessSeasonData>([
  'bondInfoDict',
  'charChessDataDict',
  'trapChessDataDict',
])

function sortKeys(keys: string[]): string[] {
  const getSuffixRank = (key: string) => {
    if (key.endsWith('_a')) return 1
    if (key.endsWith('_b')) return 2
    return 0
  }

  const getBaseKey = (key: string) => key.replace(/_[ab]$/, '')

  return [...keys].sort((a, b) => {
    const suffixRankDiff = getSuffixRank(a) - getSuffixRank(b)
    if (suffixRankDiff !== 0) return suffixRankDiff

    const baseDiff = sortCollator.compare(getBaseKey(a), getBaseKey(b))
    if (baseDiff !== 0) return baseDiff

    return sortCollator.compare(a, b)
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepSortValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => deepSortValue(item)) as T
  if (!isPlainObject(value)) return value

  const result: Record<string, unknown> = {}
  for (const key of sortKeys(Object.keys(value))) {
    result[key] = deepSortValue(value[key])
  }
  return result as T
}

function normalizeIdentifierDict<T extends Record<string, unknown>>(
  dict: Record<string, T>,
  includeIdentifier: boolean
): Record<string, T> {
  const result: Record<string, T> = {}
  let identifier = 0

  for (const key of sortKeys(Object.keys(dict))) {
    const { identifier: _ignored, ...rest } = dict[key] as T & { identifier?: number }
    const normalized = includeIdentifier
      ? { ...rest, identifier }
      : rest
    result[key] = deepSortValue(normalized as T)
    identifier += 1
  }

  return result
}

function normalizeChessIdentifierDict<T extends Record<string, unknown>>(
  dict: Record<string, T>,
  identifiersByKey: Record<string, number>,
  includeIdentifier: boolean
): Record<string, T> {
  const result: Record<string, T> = {}

  for (const key of sortKeys(Object.keys(dict))) {
    const { identifier: _ignored, ...rest } = dict[key] as T & { identifier?: number }
    const normalized = includeIdentifier
      ? { ...rest, identifier: identifiersByKey[key] }
      : rest
    result[key] = deepSortValue(normalized as T)
  }

  return result
}

export function normalizeIdentifierDictForRuntime<T extends Record<string, unknown>>(
  dict: Record<string, T>
): Record<string, T> {
  return normalizeIdentifierDict(dict, true)
}

export function normalizeIdentifierDictForDirectory<T extends Record<string, unknown>>(
  dict: Record<string, T>
): Record<string, T> {
  return normalizeIdentifierDict(dict, false)
}

function normalizeSeasonData(
  data: AutoChessSeasonData,
  includeIdentifiers: boolean
): AutoChessSeasonData {
  const normalized: Partial<AutoChessSeasonData> = {}
  const chessIdentifierKeys = sortKeys([
    ...Object.keys(data.charChessDataDict ?? {}),
    ...Object.keys(data.trapChessDataDict ?? {}),
  ])
  const chessIdentifiersByKey = Object.fromEntries(
    chessIdentifierKeys.map((key, index) => [key, index])
  ) as Record<string, number>

  for (const key of Object.keys(data) as (keyof AutoChessSeasonData)[]) {
    const value = data[key]
    ;(normalized as Record<string, unknown>)[key] =
      key === 'charChessDataDict' && isPlainObject(value)
        ? normalizeChessIdentifierDict(value as Record<string, Record<string, unknown>>, chessIdentifiersByKey, includeIdentifiers)
        : key === 'trapChessDataDict' && isPlainObject(value)
          ? normalizeChessIdentifierDict(value as Record<string, Record<string, unknown>>, chessIdentifiersByKey, includeIdentifiers)
          : IDENTIFIER_DICT_FIELDS.has(key) && isPlainObject(value)
            ? normalizeIdentifierDict(value as Record<string, Record<string, unknown>>, includeIdentifiers)
            : deepSortValue(value)
  }

  return normalized as AutoChessSeasonData
}

/** 通过 charId 获取中文名 */
export function getCharName(charId: string | null | undefined): string {
  if (!charId) return '（未知）'
  return (characterNameMap as Record<string, string>)[charId] ?? charId
}

/** 通过 chessId 获取干员中文名（需要 charShopChessDatas + chessNormalIdLookupDict）
 *  _b 金棋子没有 charShopChessDatas 条目，通过 chessNormalIdLookupDict 找回对应 _a
 */
export function getChessName(
  chessId: string,
  charShopChessDatas: Record<string, CharShopChessData>,
  chessNormalIdLookupDict?: Record<string, string>
): string {
  // 先直接查
  const shopData = charShopChessDatas[chessId]
  if (shopData) return getCharName(shopData.charId)
  // 查不到时尝试通过 lookup 找到对应普通棋子
  const normalId = chessNormalIdLookupDict?.[chessId]
  if (normalId) {
    const normalShop = charShopChessDatas[normalId]
    if (normalShop) return getCharName(normalShop.charId)
  }
  return chessId
}

/**
 * 判断一个 chessId 是否为金棋子（_b）
 * 规则：在 charShopChessDatas 中不存在，但在 chessNormalIdLookupDict 中存在
 */
export function isGoldenChess(
  chessId: string,
  charShopChessDatas: Record<string, CharShopChessData>,
  chessNormalIdLookupDict: Record<string, string>
): boolean {
  return !(chessId in charShopChessDatas) && chessId in chessNormalIdLookupDict
}

/** 重新分配 identifier（按当前 Object.values 顺序从 0 开始） */
export function reassignIdentifiers<T extends { identifier: number }>(
  dict: Record<string, T>
): Record<string, T> {
  let i = 0
  const result: Record<string, T> = {}
  for (const [k, v] of Object.entries(dict)) {
    result[k] = { ...v, identifier: i++ }
  }
  return result
}

/** 运行时使用：按稳定顺序重建 identifier，并保证对象键顺序稳定 */
export function normalizeSeasonDataForRuntime(data: AutoChessSeasonData): AutoChessSeasonData {
  return normalizeSeasonData(data, true)
}

/** 导出单文件 JSON：按稳定顺序重建 identifier */
export function normalizeSeasonDataForJson(data: AutoChessSeasonData): AutoChessSeasonData {
  return normalizeSeasonData(data, true)
}

/** 保存到目录：移除落盘 identifier，并保证对象键顺序稳定 */
export function normalizeSeasonDataForDirectory(data: AutoChessSeasonData): AutoChessSeasonData {
  return normalizeSeasonData(data, false)
}

/** 清理富文本标签，仅保留纯文本 */
export function stripRichText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .trim()
}

/** 难度显示名 */
export const difficultyLabel: Record<string, string> = {
  TRAINING: '训练',
  FUNNY: '标准',
  NORMAL: '普通',
  HARD: '困难',
  ABYSS: '深渊',
}

/** 模式类型显示名 */
export const modeTypeLabel: Record<string, string> = {
  LOCAL: '本地',
  SINGLE: '单人',
  MULTI: '多人',
}

/** 棋子类型显示名 */
export const chessTypeLabel: Record<string, string> = {
  PRESET: '预置',
  NORMAL: '常规',
  DIY: '自选',
}

/** 事件类型显示名 */
export const eventTypeLabel: Record<string, string> = {
  IN_BATTLE: '战斗中',
  SERVER_PRICE: '影响价格',
  SERVER_CHESS_SOLD: '售出时',
  SERVER_GAIN: '获得时',
  SERVER_PREP_FIN: '休整结束时',
  SERVER_PREP_START: '进入休整时',
  SERVER_REFRESH_SHOP: '刷新商店时',
}

/** 效果类型显示名 */
export const effectTypeLabel: Record<string, string> = {
  EQUIP: '装备',
  ENEMY_GAIN: '敌人增益',
  BUFF_GAIN: '增益',
  BAND_INITIAL: '策略',
  CHAR_MAP: '干员属性',
  ENEMY: '敌人',
  BOND: '盟约',
}

/** 激活条件显示名 */
export const activeConditionLabel: Record<string, string> = {
  BOARD_ALL_CHESS: '全棋子',
  BOARD: '场上',
  BOARD_AND_DECK: '场上+整备区',
}

/** 阶段显示名 */
export const evolvePhaseLabel: Record<string, string> = {
  PHASE_0: '未精英',
  PHASE_1: '精英一',
  PHASE_2: '精英二',
}

/** 下载 JSON 文件 */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 从 season 中构建 chessId → 中文名映射 */
export function buildChessNameMap(data: AutoChessSeasonData): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [chessId, shopData] of Object.entries(data.charShopChessDatas)) {
    map[chessId] = getCharName(shopData.charId)
  }
  return map
}

/** 从 season 中构建 trapId → 中文名映射 */
export function buildTrapNameMap(data: AutoChessSeasonData): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [chessId, trapData] of Object.entries(data.trapChessDataDict)) {
    map[chessId] = getCharName(trapData.charId)
  }
  return map
}

/** 颜色等级阶显示 */
export const chessLevelColor: Record<number, string> = {
  1: '#9e9e9e',
  2: '#4caf50',
  3: '#2196f3',
  4: '#9c27b0',
  5: '#ff9800',
  6: '#f44336',
}

export const chessLevelLabel: Record<number, string> = {
  1: '一阶',
  2: '二阶',
  3: '三阶',
  4: '四阶',
  5: '五阶',
  6: '六阶',
}
