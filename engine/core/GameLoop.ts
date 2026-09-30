export interface GameLoopOptions {
  /** Taxa de atualização física em Hertz (padrão: 60 ticks por segundo) */
  targetTps?: number;
  /** Limite máximo de tempo acumulado para evitar "spiral of death" (padrão: 250ms) */
  maxAccumulatedTime?: number;
  /** Callback executado em cada passo de física fixa (com delta fixo em ms e dtScale normalizado) */
  onFixedUpdate: (fixedDeltaMs: number, dtScale: number) => void;
  /** Callbac k executado em cada quadro de renderização (com interpolação alpha e delta do frame) */
  onRender: (alpha: number, frameDeltaMs: number) => void;
}

/**
 * Loop de jogo desacoplado com Fixed Timestep (padrão clássico de game engines).
 * Garante passos de física e simulação determinísticos e constantes (ex: 60Hz),
 * independentemente da taxa de atualização do monitor ou flutuações de FPS gráfico.
 */
export class GameLoop {
  private readonly fixedStepMs: number;
  private readonly maxAccumulatedTime: number;
  private readonly onFixedUpdate: (fixedDeltaMs: number, dtScale: number) => void;
  private readonly onRender: (alpha: number, frameDeltaMs: number) => void;

  private accumulator = 0;
  private lastTime = 0;
  private isRunning = false;
  private rafId: number | null = null;

  constructor(options: GameLoopOptions) {
    const tps = options.targetTps ?? 60;
    this.fixedStepMs = 1000 / tps;
    this.maxAccumulatedTime = options.maxAccumulatedTime ?? 250;
    this.onFixedUpdate = options.onFixedUpdate;
    this.onRender = options.onRender;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.scheduleFrame();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public getFixedStepMs(): number {
    return this.fixedStepMs;
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame((currentTime) => this.tick(currentTime));
  }

  private tick(currentTime: number): void {
    if (!this.isRunning) return;

    let frameTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Previne saltos temporais gigantes quando a aba perde o foco
    if (frameTime > this.maxAccumulatedTime) {
      frameTime = this.maxAccumulatedTime;
    }
    if (frameTime <= 0) {
      frameTime = this.fixedStepMs;
    }

    this.accumulator += frameTime;

    // Executa passos discretos e constantes de simulação física (máx 2 para evitar spiral of death)
    let maxSubSteps = 2;
    while (this.accumulator >= this.fixedStepMs && maxSubSteps > 0) {
      this.onFixedUpdate(this.fixedStepMs, 1.0);
      this.accumulator -= this.fixedStepMs;
      maxSubSteps--;
    }
    if (maxSubSteps === 0) {
      this.accumulator = 0; // Descarta tempo acumulado excedente para não congelar
    }

    // Alpha de interpolação entre o passo anterior e o atual (0.0 a 1.0)
    const alpha = this.accumulator / this.fixedStepMs;
    this.onRender(alpha, frameTime);

    this.scheduleFrame();
  }
}
