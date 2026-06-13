/**
 * 流式大端二进制写入器（写入到 WritableFileHandle，不持有整文件内存）。
 *
 * 与 binary-writer.ts（单内存缓冲）并列：本写入器把所有字节顺序追加到文件流，
 * 支持 patchU32（seek 回偏移覆盖 4 字节后再 seek 回末尾），用于 PSD/TIF 流式编码
 * 中"先占位段长度、写完段内容、回填实际长度"的需求。
 */
import type { WritableFileHandle } from '../shared/ipc';

/** 2/4 字节小缓冲复用（u16/u32 构造；流式编码顺序 await，无并发竞争） */
const U16_BUF = new Uint8Array(2);
const U32_BUF = new Uint8Array(4);

/** 大端序工具：把 u32 拆成 4 字节写入目标缓冲 */
function writeU32Be(buf: Uint8Array, value: number): void {
  buf[0] = (value >>> 24) & 0xff;
  buf[1] = (value >>> 16) & 0xff;
  buf[2] = (value >>> 8) & 0xff;
  buf[3] = value & 0xff;
}

export class StreamBinaryWriter {
  /** 当前写入位置（文件偏移，字节）——编码器读取此值记录需回填的偏移 */
  pos = 0;
  private readonly handle: WritableFileHandle;

  constructor(handle: WritableFileHandle) {
    this.handle = handle;
  }

  /** 写入原始字节，pos 前移 */
  async bytes(data: Uint8Array): Promise<void> {
    await this.handle.write(data);
    this.pos += data.length;
  }

  /** 大端 u8 */
  async u8(v: number): Promise<void> {
    await this.bytes(new Uint8Array([v & 0xff]));
  }

  /** 大端 u16 */
  async u16(v: number): Promise<void> {
    U16_BUF[0] = (v >>> 8) & 0xff;
    U16_BUF[1] = v & 0xff;
    await this.bytes(U16_BUF);
  }

  /** 大端 u32 */
  async u32(v: number): Promise<void> {
    writeU32Be(U32_BUF, v);
    await this.bytes(U32_BUF);
  }

  /** ASCII 字符串（不写长度前缀） */
  async str(s: string): Promise<void> {
    const data = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i) & 0xff;
    await this.bytes(data);
  }

  /**
   * 在指定偏移回填一个大端 u32（覆盖该位置 4 字节），写完后回到当前 pos。
   * 用于先占位段长度、写完段内容、再回填实际长度的场景。pos 不变（覆盖已占位字节）。
   *
   * @param offset 要回填的偏移（先前 u32(0) 占位时记录的 pos）
   * @param value 实际长度值
   */
  async patchU32(offset: number, value: number): Promise<void> {
    const resumePos = this.pos;
    await this.handle.seek(offset);
    const buf = new Uint8Array(4);
    writeU32Be(buf, value);
    await this.handle.write(buf);
    await this.handle.seek(resumePos);
  }

  /** 关闭底层句柄 */
  async close(): Promise<void> {
    await this.handle.close();
  }
}
