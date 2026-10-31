/** Minimal uncompressed UTF-8 ZIP for synthetic demonstration project exports. */
export function demoZip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const [name, value] of Object.entries({ 'DEMO-README.txt': '产品演示资料，不是真实学生作品。\n', ...files })) {
    const filename = enc.encode(name.replace(/\.\./g, '_'))
    const bytes = enc.encode(value)
    let crc = 0xffffffff
    for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
    crc = (crc ^ 0xffffffff) >>> 0
    const header = new Uint8Array(30 + filename.length)
    const h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true)
    h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, filename.length, true)
    header.set(filename, 30)
    const central = new Uint8Array(46 + filename.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true)
    c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, filename.length, true); c.setUint32(42, offset, true)
    central.set(filename, 46)
    chunks.push(header, bytes); directory.push(central); offset += header.length + bytes.length
  }
  const length = directory.reduce((sum, b) => sum + b.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, directory.length, true); e.setUint16(10, directory.length, true); e.setUint32(12, length, true); e.setUint32(16, offset, true)
  const result = new Uint8Array(offset + length + end.length)
  let pos = 0
  for (const b of [...chunks, ...directory, end]) { result.set(b, pos); pos += b.length }
  return result
}
