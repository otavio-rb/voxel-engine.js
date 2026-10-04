/**
 * Medidor de fases do quadro, dentro do engine worker.
 *
 * Existe porque o indicador de FPS que o jogo mostrava estava na MAIN THREAD, e a main thread
 * nao renderiza nada: ela so repassa input para o worker, que e quem tem o OffscreenCanvas.
 * Ou seja, o numero ficava em 60 enquanto a thread que de fato desenha engasgava. Diagnosticar
 * "trava mas o FPS esta bom" sem instrumento e adivinhar.
 *
 * Mede o pior caso, nao a media: travamento e justamente o pior caso. Uma fase que custa 0.5 ms
 * em media e 180 ms uma vez por segundo da uma media otima e uma experiencia terrivel.
 */

export interface PhaseStats {
  /** Pior duracao de uma unica execucao, em ms, na janela. */
  maxMs: number;
  /** Soma das duracoes na janela, em ms. */
  totalMs: number;
  /** Quantas vezes a fase rodou na janela. */
  calls: number;
}

export interface ProfilerSnapshot {
  /** Quadros por segundo reais da thread que renderiza. */
  fps: number;
  /** Pior tempo entre quadros na janela, em ms. E isto que se sente como travada. */
  worstFrameMs: number;
  /** Duracao da janela, em ms. */
  windowMs: number;
  phases: Record<string, PhaseStats>;
}

export class FrameProfiler {
  private readonly phases = new Map<string, PhaseStats>();
  private frames = 0;
  private worstFrameMs = 0;
  private windowStart = 0;
  private lastSnapshot: ProfilerSnapshot | null = null;

  constructor(private readonly windowMs = 1000) {
    this.windowStart = performance.now();
  }

  /** Envolve uma fase e acumula o custo dela. */
  public measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.add(name, performance.now() - start);
    }
  }

  public add(name: string, ms: number): void {
    let stats = this.phases.get(name);
    if (!stats) {
      stats = { maxMs: 0, totalMs: 0, calls: 0 };
      this.phases.set(name, stats);
    }
    stats.totalMs += ms;
    stats.calls++;
    if (ms > stats.maxMs) stats.maxMs = ms;
  }

  /**
   * Registra um quadro. Devolve o resumo quando a janela fecha, senao null — assim o worker
   * manda estatistica uma vez por segundo em vez de uma por quadro.
   */
  public frame(frameMs: number): ProfilerSnapshot | null {
    this.frames++;
    if (frameMs > this.worstFrameMs) this.worstFrameMs = frameMs;

    const now = performance.now();
    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return null;

    const phases: Record<string, PhaseStats> = {};
    for (const [name, stats] of this.phases) {
      phases[name] = { ...stats };
      stats.maxMs = 0;
      stats.totalMs = 0;
      stats.calls = 0;
    }

    const snapshot: ProfilerSnapshot = {
      fps: Math.round((this.frames * 1000) / elapsed),
      worstFrameMs: Math.round(this.worstFrameMs * 10) / 10,
      windowMs: Math.round(elapsed),
      phases
    };

    this.frames = 0;
    this.worstFrameMs = 0;
    this.windowStart = now;
    this.lastSnapshot = snapshot;
    return snapshot;
  }

  public get latest(): ProfilerSnapshot | null {
    return this.lastSnapshot;
  }

  /** Uma linha por fase, da mais caro para a mais barata. Para log de console. */
  public static format(snapshot: ProfilerSnapshot): string {
    const rows = Object.entries(snapshot.phases)
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .map(([name, s]) =>
        `    ${name.padEnd(16)} pior ${s.maxMs.toFixed(1).padStart(7)} ms   total ${s.totalMs.toFixed(1).padStart(7)} ms   ${String(s.calls).padStart(5)}x`
      );
    return [
      `thread que renderiza: ${snapshot.fps} fps, pior quadro ${snapshot.worstFrameMs} ms`,
      ...rows
    ].join('\n');
  }
}
