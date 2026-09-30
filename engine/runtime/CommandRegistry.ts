import type { EngineContext } from './EngineRuntime';

export type CommandHandler = (args: string[], ctx: EngineContext) => void;

/**
 * Chat-style commands (`/tp 0 40 0`) executed inside the engine worker.
 * Registering an existing name replaces its handler, so games can override core commands.
 */
export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  public register(names: string | string[], handler: CommandHandler): void {
    for (const name of Array.isArray(names) ? names : [names]) {
      this.handlers.set(normalize(name), handler);
    }
  }

  public has(name: string): boolean {
    return this.handlers.has(normalize(name));
  }

  /** Returns false when no handler is registered for the command. */
  public execute(name: string, args: string[], ctx: EngineContext): boolean {
    const handler = this.handlers.get(normalize(name));
    if (!handler) return false;
    handler(args, ctx);
    return true;
  }

  public list(): string[] {
    return Array.from(this.handlers.keys());
  }
}

function normalize(name: string): string {
  const lower = name.trim().toLowerCase();
  return lower.startsWith('/') ? lower : `/${lower}`;
}
