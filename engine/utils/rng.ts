export default class RNG {
  private m_w: number;
  private m_z: number;
  private readonly mask = 0xffffffff;

  constructor(seed: number) {
    this.m_w = (123456789 + seed) & this.mask;
    this.m_z = (987654321 - seed) & this.mask;
  }

  /** Returns a float in [0, 1) — same contract as Math.random(). */
  random(): number {
    this.m_z = (36969 * (this.m_z & 65535) + (this.m_z >> 16)) & this.mask;
    this.m_w = (18000 * (this.m_w & 65535) + (this.m_w >> 16)) & this.mask;
    let result = ((this.m_z << 16) + (this.m_w & 65535)) >>> 0;
    result /= 4294967296;
    return result;
  }
}
