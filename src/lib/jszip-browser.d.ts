// Browser-only JSZip declarations avoid importing Node globals into Vue timers.
// The pinned JSZip version exposes internalStream but omits it from its published types.
declare module 'jszip/dist/jszip.min.js' {
  interface Stream {
    on(event: 'data', callback: (chunk: Uint8Array, metadata: { percent: number }) => void): Stream
    on(event: 'error', callback: (error: Error) => void): Stream
    on(event: 'end', callback: () => void): Stream
    pause(): Stream
    resume(): Stream
  }
  export interface JSZipObject {
    name: string
    dir: boolean
    _data: { uncompressedSize: number; crc32: number }
    internalStream(type: 'uint8array'): Stream
  }
  const JSZip: {
    loadAsync(bytes: Uint8Array, options: { decodeFileName: (bytes: Uint8Array) => string; checkCRC32: boolean; createFolders: boolean }): Promise<{ files: Record<string, JSZipObject> }>
  }
  export default JSZip
}
