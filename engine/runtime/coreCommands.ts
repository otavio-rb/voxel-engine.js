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

  commands.register('/fly', (_args, { player }) => player?.setMode('debug'));
  commands.register('/walk', (_args, { player }) => player?.setMode('normal'));

  // `/shaders on|off` liga o conjunto; `/shaders <preset>` escolhe quanto custa.
  commands.register('/shaders', (args, ctx) => {
    const arg = args[0]?.toLowerCase();
    if (arg === 'on' || arg === 'off' || arg === undefined) {
      ctx.setShadersEnabled(arg === 'on');
      return;
    }
    if (arg === 'low' || arg === 'medium' || arg === 'high' || arg === 'ultra') {
      ctx.setShaderQuality(arg);
      ctx.setShadersEnabled(true);
      return;
    }
    ctx.setShadersEnabled(false);
  });

  commands.register(['/tonemap'], (args, ctx) => {
    const curve = args[0]?.toLowerCase();
    if (curve === 'aces' || curve === 'agx' || curve === 'hable' || curve === 'reinhard') {
      ctx.cinematicPass.setTonemap(curve);
    }
  });

  // Granulado de filme: desligado por padrao, `/grain 0.015` e um acabamento discreto.
  // Balanco de branco global: -1 frio, 0 neutro, 1 quente. Atinge a cena toda,
  // inclusive as sombras, ao contrario da cor do sol (que e luz direta).
  // Sombras direcionais: `/shadows off`, `/shadows on`, ou `/shadows 4096` para a resolucao.
  commands.register('/shadows', (args, ctx) => {
    const arg = args[0]?.toLowerCase();
    if (arg === 'off') {
      ctx.world.setShadows(false);
      return;
    }
    if (arg === 'on' || arg === undefined) {
      ctx.world.setShadows(true);
      return;
    }
    const res = parseInt(arg, 10);
    if (!isNaN(res)) ctx.world.setShadows(true, { resolution: res });
  });

  // Passo de quantizacao da direcao da luz, em graus. 0 = segue o sol continuamente (default).
  commands.register('/shadowstep', (args, ctx) => {
    const val = parseFloat(args[0]);
    if (!isNaN(val)) ctx.world.setShadows(true, { angleStepDegrees: val });
  });

  // Quantizacao da posicao da camera de sombra na grade de texels (default off).
  commands.register('/shadowsnap', (args, ctx) => {
    const val = args[0]?.toLowerCase();
    ctx.world.setShadows(true, { snapToTexel: val === 'on' || val === '1' || val === 'true' });
  });

  // Largura da penumbra. 0 = sombra dura, 0.06 = default, 0.2 = bem difusa.
  commands.register('/shadowsoft', (args, ctx) => {
    const val = parseFloat(args[0]);
    if (!isNaN(val)) ctx.world.setShadows(true, { softness: val });
  });

  commands.register(['/temperature', '/temp'], (args, ctx) => {
    const val = parseFloat(args[0]);
    if (!isNaN(val)) ctx.cinematicPass.setTemperature(val);
  });

  commands.register('/grain', (args, ctx) => {
    const arg = args[0]?.toLowerCase();
    if (arg === 'off' || arg === undefined) {
      ctx.cinematicPass.setGrain(0);
      return;
    }
    if (arg === 'on') {
      ctx.cinematicPass.setGrain(0.015);
      return;
    }
    const val = parseFloat(arg);
    if (!isNaN(val)) ctx.cinematicPass.setGrain(val);
  });

  commands.register('/exposure', (args, ctx) => {
    const day = parseFloat(args[0]);
    const night = parseFloat(args[1]);
    if (!isNaN(day)) ctx.cinematicPass.setExposure(day, isNaN(night) ? undefined : night);
  });

  commands.register('/ssao', (args, ctx) => {
    const arg = args[0]?.toLowerCase();
    if (arg === 'off') ctx.shaders.ssao.enabled = false;
    else if (arg === 'on' || arg === undefined) ctx.shaders.ssao.enabled = true;
    else {
      const val = parseFloat(arg);
      if (!isNaN(val)) {
        ctx.shaders.ssao.setIntensity(val);
        ctx.shaders.ssao.enabled = val > 0;
      }
    }
  });

  commands.register(['/godrays', '/volumetric'], (args, ctx) => {
    const arg = args[0]?.toLowerCase();
    if (arg === 'off') ctx.shaders.volumetric.enabled = false;
    else if (arg === 'on' || arg === undefined) ctx.shaders.volumetric.enabled = true;
    else {
      const val = parseFloat(arg);
      if (!isNaN(val)) {
        ctx.shaders.volumetric.setShaftStrength(val);
        ctx.shaders.volumetric.enabled = val > 0;
      }
    }
  });

  commands.register(['/postfx', '/cinematic'], (args, ctx) => {
    if (args.length === 0) {
      ctx.cinematicPass.enabled = !ctx.cinematicPass.enabled;
    } else {
      ctx.cinematicPass.enabled = args[0].toLowerCase() === 'on';
    }
  });

  commands.register('/bloom', (args, ctx) => {
    if (args.length === 0) return;
    const val = parseFloat(args[0]);
    if (!isNaN(val)) {
      ctx.cinematicPass.setBloom(val);
      ctx.cinematicPass.enabled = true;
    } else if (args[0].toLowerCase() === 'off') {
      ctx.cinematicPass.setBloom(0.0);
    } else if (args[0].toLowerCase() === 'on') {
      ctx.cinematicPass.setBloom(0.085);
      ctx.shaders.bloom.enabled = true;
    }
  });

  commands.register('/vignette', (args, ctx) => {
    if (args.length === 0) return;
    const val = parseFloat(args[0]);
    if (!isNaN(val)) {
      ctx.cinematicPass.setVignette(val);
    } else if (args[0].toLowerCase() === 'off') {
      ctx.cinematicPass.setVignette(0.0);
    } else if (args[0].toLowerCase() === 'on') {
      ctx.cinematicPass.setVignette(0.26);
    }
  });

  /**
   * Estado do brickmap: quanto do atlas esta em uso, por anel.
   *
   * O sintoma de atlas cheio -- manchas de pedra uniforme no lugar de terreno -- e dificil
   * de distinguir de um problema de geracao so olhando. `allocFailures` diferente de zero
   * responde isso em um comando.
   */
  commands.register('/brickmap', (_args, { world }) => {
    const st = world.brickMapStats();
    if (!st) {
      console.warn('[brickmap] o mundo nao esta no caminho de raymarch');
      return;
    }
    const pct = (a: number, b: number) => b > 0 ? `${((100 * a) / b).toFixed(1)}%` : 'n/a';
    console.warn(
      `[brickmap] proximo ${st.slotsUsed}/${st.totalSlots} (${pct(st.slotsUsed, st.totalSlots)}), ` +
      `pico ${st.peakSlotsUsed}, falhas ${st.allocFailures} | ` +
      `distante ${st.farSlotsUsed}/${st.farTotalSlots} (${pct(st.farSlotsUsed, st.farTotalSlots)}), ` +
      `${st.farChunks} chunks | luzes ${st.activeLights} | ` +
      `VRAM ${(st.gpuBytes / 1048576).toFixed(0)} MB`
    );
  });

  commands.register('/wireframe', (args, { world }) => {
    world.toggleWireframe(args[0] === 'on' ? true : args[0] === 'off' ? false : undefined);
  });

  commands.register(['/bobbing', '/balanco'], (args, { player }) => {
    if (!player) return;
    player.viewBobbing = args[0] === 'on' ? true : args[0] === 'off' ? false : !player.viewBobbing;
  });

  commands.register('/tp', (args, { player }) => {
    if (!player) return;
    if (args.length >= 3) {
      player.teleport(
        parseFloat(args[0]),
        parseFloat(args[1]),
        parseFloat(args[2]),
        args[3] !== undefined ? parseFloat(args[3]) : undefined,
        args[4] !== undefined ? parseFloat(args[4]) : undefined
      );
    }
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
      player?.teleport(0, Math.max(40, h + 5), 0);
    } else if (args[0] === 'render' && args[1] === 'distance' && args[2]) {
      world.setRenderDistance(parseInt(args[2]));
    } else if (args[0] === 'player' && args[1] === 'gravity' && args[2]) {
      player?.setGravity(parseFloat(args[2]));
    }
  });

  commands.register('/fluid', (args, ctx) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'off') {
      ctx.world.fluidMode = 'none';
      ctx.world.fluidCA.enabled = false;
      ctx.emitToMain('chat:message', { text: '💧 Simulação de fluidos desativada.' });
    } else if (sub === 'ca' || sub === 'on') {
      ctx.world.fluidMode = 'cellular_automata';
      ctx.world.fluidCA.enabled = true;
      ctx.emitToMain('chat:message', { text: '💧 Simulação de fluidos ativa: Autômato Celular (CA).' });
    } else if (sub === 'scalar') {
      ctx.world.fluidMode = 'scalar';
      ctx.world.fluidCA.enabled = false;
      ctx.emitToMain('chat:message', { text: '💧 Simulação de fluidos ativa: Escalar (Minecraft clássico).' });
    } else if (sub === 'clear') {
      ctx.world.fluidCA.clear();
      ctx.emitToMain('chat:message', { text: '💧 Fluidos ativos limpos/adormecidos.' });
    } else if (sub === 'wake') {
      const r = args[1] ? parseFloat(args[1]) : 16;
      ctx.world.fluidCA.wakeRadius(
        Math.floor(ctx.camera.position.x),
        Math.floor(ctx.camera.position.y),
        Math.floor(ctx.camera.position.z),
        r * ctx.voxelsPerBlock
      );
      ctx.emitToMain('chat:message', {
        text: `💧 Fluidos acordados em raio de ${r}b! Células ativas: ${ctx.world.fluidCA.activeCount}`
      });
    } else {
      ctx.emitToMain('chat:message', {
        text: `💧 Fluidos: modo=${ctx.world.fluidMode} | células ativas=${ctx.world.fluidCA.activeCount}`
      });
    }
  });
}

