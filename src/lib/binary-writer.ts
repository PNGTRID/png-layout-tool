/**
 * Big-endian binary writer for PSD file construction.
 *
 * Uses Uint8Array with capacity-doubling strategy — ~8× more memory-efficient
 * than the previous number[] approach for large files.
 *
 * @see https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
 */

export class BinaryWriter {
  private buf: Uint8Array;
  private len = 0;

  constructor(initialCapacity = 4096) {
    this.buf = new Uint8Array(initialCapacity);
  }

  /** Current write position (number of bytes written) */
  get pos(): number { return this.len; }

  /** Ensure at least `n` more bytes are available */
  private ensure(n: number): void {
    const needed = this.len + n;
    if (needed <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < needed) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  /** Write an unsigned 8-bit integer */
  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  /** Write an unsigned 16-bit big-endian integer */
  u16(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  /** Write an unsigned 32-bit big-endian integer */
  u32(v: number): void {
    this.ensure(4);
    this.buf[this.len++] = (v >> 24) & 0xff;
    this.buf[this.len++] = (v >> 16) & 0xff;
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  /** Write a signed 16-bit big-endian integer */
  i16(v: number): void {
    if (v < -32768 || v > 32767) {
      throw new RangeError(`[binary-writer] i16 overflow: ${v} (range -32768..32767)`);
    }
    this.u16(v < 0 ? v + 0x10000 : v);
  }

  /** Write a signed 32-bit big-endian integer */
  i32(v: number): void {
    if (v < -2147483648 || v > 2147483647) {
      throw new RangeError(`[binary-writer] i32 overflow: ${v}`);
    }
    this.u32(v < 0 ? v + 0x100000000 : v);
  }

  /** Write a raw byte array */
  bytes(arr: Uint8Array): void {
    this.ensure(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
  }

  /**
   * Write an ASCII string (one byte per character, no encoding).
   * Non-ASCII characters (code > 0x7F) are replaced with '?' to prevent
   * producing invalid binary format output.
   */
  str(s: string): void {
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      this.buf[this.len++] = code <= 0x7F ? code : 0x3F; // '?' = 0x3F
    }
  }

  /** Pad to the next `m`-byte boundary */
  pad(m: number): void {
    const rem = this.len % m;
    if (rem === 0) return;
    const n = m - rem;
    this.ensure(n);
    this.len += n;
  }

  /** Patch a previously written u32 at the given offset */
  patch32(off: number, v: number): void {
    this.buf[off]     = (v >> 24) & 0xff;
    this.buf[off + 1] = (v >> 16) & 0xff;
    this.buf[off + 2] = (v >> 8) & 0xff;
    this.buf[off + 3] = v & 0xff;
  }

  /** Return the written bytes as a new Uint8Array */
  toUint8Array(): Uint8Array {
    return this.buf.subarray(0, this.len).slice();
  }
}
