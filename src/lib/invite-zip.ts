import JSZip, { type JSZipObject } from 'jszip/dist/jszip.min.js'

export const ZIP_LIMITS = { archive: 100 * 1024 ** 2, expanded: 500 * 1024 ** 2, entries: 500, depth: 3 } as const
export type ZipRow = { id: string; path: string; name: string; size: number; depth: number; crc: number; zip: boolean; entry: JSZipObject; expanded: boolean }
export type ZipBudget = { entries: number; declared: number; actual: number }
export const newZipBudget = (): ZipBudget => ({ entries: 0, declared: 0, actual: 0 })
const fail = (message: string): never => { throw new Error(message) }
const gbk = (bytes: Uint8Array) => new TextDecoder('gbk').decode(bytes)
const hidden = (name: string) => name.split('/').some(p => p === '__MACOSX' || p.startsWith('.'))

// Read central directory sizes before JSZip creates its lazy entries. No entry is inflated here.
export function inspectZip(bytes: Uint8Array, budget: ZipBudget) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  const first = Math.max(0, bytes.length - 65557)
  for (; end >= first; end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break
  }
  if (end < first) fail('不是有效 ZIP 或压缩包已损坏')
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail('不支持分卷 ZIP，请先解压后上传')
  const count = view.getUint16(end + 10, true)
  if (count === 65535) fail('不支持 ZIP64，请先解压后上传')
  if (budget.entries + count > ZIP_LIMITS.entries) fail('压缩包条目数量超过 500 个，已停止')
  let offset = view.getUint32(end + 16, true)
  const directorySize = view.getUint32(end + 12, true)
  if (offset + directorySize > end) fail('ZIP 目录损坏')
  let total = 0
  const sizes: number[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail('ZIP 目录损坏')
    if (view.getUint16(offset + 8, true) & 0x41) fail('不支持加密压缩包，请先解压后上传')
    const size = view.getUint32(offset + 24, true)
    if (size === 0xffffffff) fail('不支持 ZIP64，请先解压后上传')
    total += size
    sizes.push(size)
    if (budget.declared + total > ZIP_LIMITS.expanded) fail('解压总量超过 500MB，已停止')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    if (offset > end) fail('ZIP 条目损坏')
  }
  if (offset !== view.getUint32(end + 16, true) + directorySize) fail('ZIP 目录大小不一致')
  return { count, total, sizes }
}

export async function listZip(bytes: Uint8Array, prefix: string, depth: number, budget: ZipBudget): Promise<ZipRow[]> {
  if (bytes.length > ZIP_LIMITS.archive) fail('压缩包超过 100MB，请先解压后上传')
  const info = inspectZip(bytes, budget)
  const archive = await JSZip.loadAsync(bytes, { decodeFileName: raw => gbk(Uint8Array.from(raw)), checkCRC32: false, createFolders: false })
  const rows: ZipRow[] = []
  let index = 0
  for (const entry of Object.values(archive.files)) {
    const size = info.sizes[index++] ?? 0
    if (entry.dir || hidden(entry.name)) continue
    // Match central-directory metadata, even when JSZip sanitizes paths or omits duplicate names.
    const rawSize = entry._data.uncompressedSize ?? size
    const name = entry.name.split('/').pop() || entry.name
    rows.push({ id: `${prefix} / ${entry.name}`, path: `${prefix} / ${entry.name}`, name, size: rawSize, depth, crc: entry._data.crc32, zip: /\.zip$/i.test(name), entry, expanded: false })
  }
  budget.entries += info.count
  budget.declared += info.total
  return rows
}

export function readZipEntry(row: ZipRow, budget: ZipBudget, progress: (percent: number) => void, cancelled: () => boolean = () => false): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let size = 0
    let crc = 0xffffffff
    let stopped = false
    const stream = row.entry.internalStream('uint8array')
    stream.on('data', (chunk: Uint8Array, metadata: { percent: number }) => {
      if (stopped) return
      size += chunk.length
      if (cancelled() || budget.actual + chunk.length > ZIP_LIMITS.expanded || size > row.size) {
        stopped = true
        stream.pause()
        chunks.length = 0
        reject(new Error(cancelled() ? '已取消压缩包读取' : '解压总量超过 500MB 或文件大小异常，已停止'))
        return
      }
      for (const byte of chunk) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
      }
      budget.actual += chunk.length
      chunks.push(chunk)
      progress(metadata.percent)
      stream.pause()
      setTimeout(() => { if (!stopped) stream.resume() }, 0)
    }).on('error', () => { if (!stopped) { stopped = true; reject(new Error('压缩包内容损坏，请先解压后上传')) } })
      .on('end', () => {
        if (stopped) return
        if (((crc ^ 0xffffffff) >>> 0) !== (row.crc >>> 0)) { reject(new Error('压缩包内容损坏（CRC 校验失败），请先解压后上传')); return }
        if (size !== row.size) { reject(new Error('压缩包内容大小不一致，文件可能损坏')); return }
        const result = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
        resolve(result)
      }).resume()
  })
}
