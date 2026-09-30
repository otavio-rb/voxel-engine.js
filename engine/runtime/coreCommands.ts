import type { EngineContext } from './EngineRuntime';

/** Commands every engine instance understands. Games may override any of them. */
export function registerCoreCommands(ctx: EngineContext): void {
  const { commands } = ctx;

  // The `start` hook fires once per session, even if `/start` is sent again on world re-creation.
  let startEmitted = false;
  commands.register('/start', (_args, ctx) => {
    ctx.started = true;
    if (startEmitted) return;
    startEmitted = true;
    ctx.emit('start');
  });

  commands.register('/time', (args, { world }) => {
    world.setTime(args[0] || 'noon');
  });

  commands.register('/creative', (_args, { player }) => player.setMode('debug'));
  commands.register('/survival', (_args, { player }) => player.setMode('normal'));

  commands.register('/shaders', (args, ctx) => {
    ctx.setShadersEnabled(args[0]?.toLowerCase() === 'on');
  });

  commands.register('/wireframe', (args, { world }) => {
    world.toggleWireframe(args[0] === 'on' ? true : args[0] === 'off' ? false : undefined);
  });

  commands.register(['/bobbing', '/balanco'], (args, { player }) => {
    player.viewBobbing = args[0] === 'on' ? true : args[0] === 'off' ? false : !player.viewBobbing;
  });

  commands.register('/tp', (args, { player }) => {
    if (args.length === 3) player.teleport(parseFloat(args[0]), parseFloat(args[1]), parseFloat(args[2]));
  });

  commands.register('/spawn', (_args, ctx) => ctx.teleportToSpawn());

  commands.register('/regen', (args, ctx) => {
    ctx.started = true;
    const worldType = args[0];
    ctx.world.reset(worldType ? { worldType } : undefined);
    ctx.teleportToSpawn();
  });

  commands.register('/set', (args, { world, player }) => {
    if (args[0] === 'chunk' && args[1] === 'height' && args[2]) {
      const h = parseInt(args[2]);
      world.setChunkHeight(h);
      world.reset();
      player.teleport(0, Math.max(40, h + 5), 0);
    } else if (args[0] === 'render' && args[1] === 'distance' && args[2]) {
      world.setRenderDistance(parseInt(args[2]));
    } else if (args[0] === 'player' && args[1] === 'gravity' && args[2]) {
      player.setGravity(parseFloat(args[2]));
    }
  });
}
