/**
 * fsStore.ts — Web File System Access API 封装
 *
 * 目录结构：
 *   <dir>/
 *     project.json           ← { label, version, savedAt, constFields: {...} }
 *     modeDataDict/          ← 每条记录一个 .json 文件
 *     bondInfoDict/
 *     charChessDataDict/
 *     charShopChessDatas/
 *     trapChessDataDict/
 *     effectInfoDataDict/
 *     effectBuffInfoDataDict/
 *     bossInfoDict/
 *     shopCharChessInfoData/
 *     garrisonDataDict/
 *     bandDataListDict/
 *     stageDatasDict/
 *     shopLevelDisplayDataDict/
 *     specialEnemyInfoDict/
 *     effectChoiceInfoDict/
 */

import type { AutoChessSeasonData } from '../autochess-season-data'

/** 所有以独立文件存储的 dict 字段名 */
const DICT_FIELDS: (keyof AutoChessSeasonData)[] = [
  'modeDataDict',
  'bondInfoDict',
  'charChessDataDict',
  'charShopChessDatas',
  'trapChessDataDict',
  'effectInfoDataDict',
  'effectBuffInfoDataDict',
  'bossInfoDict',
  'shopCharChessInfoData',
  'garrisonDataDict',
  'bandDataListDict',
  'stageDatasDict',
  'shopLevelDisplayDataDict',
  'specialEnemyInfoDict',
  'effectChoiceInfoDict',
]

/** project.json 里的扁平字段 */
const CONST_FIELDS: (keyof AutoChessSeasonData)[] = [
  'baseRewardDataList',
  'diyChessDict',
  'shopLevelDataDict',
  'battleDataDict',
  'chessNormalIdLookupDict',
  'enemyInfoDict',
  'specialEnemyRandomTypeDict',
  'trainingNpcList',
  'milestoneList',
  'modeFactorInfo',
  'difficultyFactorInfo',
  'playerTitleDataDict',
  'constData',
]

// ── helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateDir(root: FileSystemDirectoryHandle, name: string) {
  return root.getDirectoryHandle(name, { create: true })
}

async function writeJsonFile(dir: FileSystemDirectoryHandle, filename: string, data: unknown) {
  const fh = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

/** 只在内容真正变化时才写入，返回是否写了 */
async function writeJsonFileIfChanged(dir: FileSystemDirectoryHandle, filename: string, data: unknown): Promise<boolean> {
  const newContent = JSON.stringify(data, null, 2)
  try {
    const fh = await dir.getFileHandle(filename)
    const file = await fh.getFile()
    const oldContent = await file.text()
    if (oldContent === newContent) return false
  } catch {
    // 文件不存在，继续写
  }
  const fh = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(newContent)
  await writable.close()
  return true
}

async function readJsonFile<T>(dir: FileSystemDirectoryHandle, filename: string): Promise<T | null> {
  try {
    const fh = await dir.getFileHandle(filename)
    const file = await fh.getFile()
    return JSON.parse(await file.text()) as T
  } catch {
    return null
  }
}

async function listJsonKeys(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const keys: string[] = []
  for await (const [name] of dir.entries()) {
    if (typeof name === 'string' && name.endsWith('.json')) keys.push(name.slice(0, -5))
  }
  return keys
}

// ── public types ─────────────────────────────────────────────────────────────

export interface ProjectMeta {
  label: string
  version: number
  constFields: Partial<AutoChessSeasonData>
}

// ── public API ────────────────────────────────────────────────────────────────

export async function openDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    // @ts-expect-error showDirectoryPicker is in modern browsers
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' }) as FileSystemDirectoryHandle
    return handle
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

export async function loadFromDirectory(
  dir: FileSystemDirectoryHandle
): Promise<{ data: AutoChessSeasonData; meta: ProjectMeta }> {
  const meta = await readJsonFile<ProjectMeta>(dir, 'project.json')
  if (!meta) throw new Error('目录中不存在 project.json，请先保存一次或选择正确的目录')

  const data: Partial<AutoChessSeasonData> = { ...meta.constFields }
  for (const field of DICT_FIELDS) {
    try {
      const subDir = await dir.getDirectoryHandle(field as string)
      const keys = await listJsonKeys(subDir)
      const dict: Record<string, unknown> = {}
      for (const key of keys) {
        const value = await readJsonFile(subDir, `${key}.json`)
        if (value !== null) dict[key] = value
      }
      ;(data as unknown as Record<string, unknown>)[field] = dict
    } catch {
      ;(data as unknown as Record<string, unknown>)[field] = {}
    }
  }
  return { data: data as AutoChessSeasonData, meta }
}

export async function saveToDirectory(
  dir: FileSystemDirectoryHandle,
  data: AutoChessSeasonData,
  label: string,
  /** 第一个文件实际写入前调用，用于提前更新 lastOwnWrite，避免 watchDirectory 误判 */
  onFirstWrite?: () => void
): Promise<number> {
  let firstWriteCalled = false
  const notifyFirst = () => {
    if (!firstWriteCalled) {
      firstWriteCalled = true
      onFirstWrite?.()
    }
  }

  const constFields: Partial<AutoChessSeasonData> = {}
  for (const field of CONST_FIELDS) {
    ;(constFields as unknown as Record<string, unknown>)[field] =
      (data as unknown as Record<string, unknown>)[field]
  }
  const projectChanged = await writeJsonFileIfChanged(dir, 'project.json', { label, version: 1, constFields })
  if (projectChanged) notifyFirst()

  for (const field of DICT_FIELDS) {
    const dict = (data as unknown as Record<string, unknown>)[field] as Record<string, unknown> | null
    if (!dict) continue
    const subDir = await getOrCreateDir(dir, field as string)
    for (const [key, value] of Object.entries(dict)) {
      const changed = await writeJsonFileIfChanged(subDir, `${key}.json`, value)
      if (changed) notifyFirst()
    }
  }
  return Date.now()
}

// ── FileSystemObserver with poll fallback ────────────────────────────────────

/**
 * 观察目录变更。
 * 优先使用 FileSystemObserver（Chrome 129+）；不支持时降级为 3s poll。
 *
 * @param dir              目录句柄
 * @param getLastOwnWrite  返回我们自己最近一次完成写入的时间戳（ms），0 表示从未写过
 * @param onExternal       确认是外部变更时的回调
 * @returns                取消观察的函数
 *
 * 过滤策略：
 *   收到通知时，若距离 getLastOwnWrite() 不足 COOLDOWN_MS，则认为是我们自己写的，忽略。
 *   Observer 模式额外加 debounce，避免批量写入触发多次。
 */
const COOLDOWN_MS = 5000 // 自己写完后 5s 内的通知一律忽略

export function watchDirectory(
  dir: FileSystemDirectoryHandle,
  getLastOwnWrite: () => number,
  onExternal: () => void
): () => void {
  const isRecent = () => Date.now() - getLastOwnWrite() < COOLDOWN_MS

  // ── 优先：FileSystemObserver ─────────────────────────────────────────────
  // @ts-expect-error FileSystemObserver is experimental
  if (typeof FileSystemObserver !== 'undefined') {
    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    // @ts-expect-error
    const observer = new FileSystemObserver((records: unknown[]) => {
      // @ts-expect-error
      if (cancelled || !records.find(v => v.changedHandle.name.endsWith('.json'))) return
      // debounce：等 1s 内无新通知再判断
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!cancelled && !isRecent()) onExternal()
      }, 1000)
    })

    observer.observe(dir, { recursive: true }).catch(() => {
      alert('FileSystemObserver 初始化失败')
    })

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      observer.disconnect()
    }
  } else {
    alert('当前浏览器太老，请使用 Chrome 129+')
  }
}
