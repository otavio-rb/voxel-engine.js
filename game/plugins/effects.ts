import { Color, Vector3 } from 'three';
import { raycastVoxel, type EnginePlugin, type FixedUpdateEvent, type RenderEvent } from '@voxel/engine/worker';
import { BlackHoleManager } from '../effects/BlackHoleManager';
import { ExplosionManager } from '../effects/ExplosionManager';
import { BeamManager } from '../effects/BeamManager';
import { CelestialManager } from '../celestial/CelestialManager';
import { StarType } from '../celestial/Star';
import { PlanetType } from '../celestial/Planet';
import { ScreenEffects } from '../effects/ScreenEffects';
import { applyShaderQuality } from '../effects/ShaderQuality';
import { Star } from '../celestial/Star';
import { chat } from './chat';

/** Black holes, explosions, beams and celestial bodies, plus their commands. */
export const effectsPlugin: EnginePlugin = {
  name: 'effects',
  setup(ctx) {
    const { scene, camera, world, player, commands } = ctx;

    const blackHoleManager = new BlackHoleManager(scene);
    blackHoleManager.onChatMessage = (text) => chat(ctx, text);
    blackHoleManager.onMerger = (pos, newRadius) => {
      ctx.emitToMain('blackhole:merger', { x: pos.x, y: pos.y, z: pos.z, radius: newRadius });
    };

    const explosionManager = new ExplosionManager(scene);
    explosionManager.onExplosion = (info) => ctx.emitToMain('explosion:occurred', info);

    const beamManager = new BeamManager(scene);
    beamManager.onBeamFired = (info) => ctx.emitToMain('beam:fired', info);
    beamManager.onChatMessage = (text) => chat(ctx, text);

    const celestialManager = new CelestialManager(scene);
    celestialManager.onChatMessage = (text) => chat(ctx, text);

    // ── Shaders off: every effect falls back to plain materials, including ones spawned later ──
    const effectRoots = () => scene.children.filter(child => child !== world);
    ctx.on<boolean>('shaders', (enabled) => {
      for (const root of effectRoots()) applyShaderQuality(root, enabled);
    });

    // Star occlusion by terrain, sampled a few times per second and smoothed per frame
    const starVisibility = new Map<Star, { target: number; value: number }>();
    const toStar = new Vector3();
    let tick = 0;

    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      blackHoleManager.update(deltaMs, player, world);
      celestialManager.update(deltaMs, blackHoleManager);
      explosionManager.update(deltaMs);
      beamManager.update(deltaMs);

      if (++tick % 6 !== 0) return;
      for (const root of effectRoots()) applyShaderQuality(root, ctx.shadersEnabled);
      if (!ctx.shadersEnabled) return;
      for (const star of starVisibility.keys()) {
        if (star.isDisposed) starVisibility.delete(star);
      }
      for (const star of celestialManager.getStars()) {
        if (star.isDisposed) continue;
        toStar.subVectors(star.position, camera.position);
        const dist = toStar.length();
        const hit = raycastVoxel(world, camera.position, toStar.normalize(), Math.min(160, dist - star.radius));
        const state = starVisibility.get(star) ?? { target: 1, value: hit ? 0 : 1 };
        state.target = hit ? 0 : 1;
        starVisibility.set(star, state);
      }
    });

    // ── Screen effects: black hole lensing, star glare, explosion shockwaves and flashes ──
    const screenFx = new ScreenEffects();
    ctx.postProcessor.add(screenFx);
    const nukeFlash = new Color(1.0, 0.95, 0.85);
    const blastFlash = new Color(1.0, 0.78, 0.45);
    const glareColor = new Color();
    const forward = new Vector3();
    const toFx = new Vector3();
    const center = new Vector3();
    let frameDt = 0;
    ctx.on<RenderEvent>('render', ({ frameDeltaMs }) => { frameDt = frameDeltaMs / 1000; });

    /** How much of a flash reaches the eye: facing it and being close make it brighter. */
    const exposure = (pos: Vector3, falloff: number): number => {
      toFx.subVectors(pos, camera.position);
      const dist = toFx.length();
      const facing = Math.max(0, forward.dot(toFx.divideScalar(Math.max(dist, 1e-3))));
      return (0.35 + 0.65 * facing) / (1 + (dist / falloff) ** 2);
    };
    const byDistance = <T extends { position: Vector3 }>(items: Iterable<T>): T[] =>
      Array.from(items).sort((a, b) =>
        a.position.distanceToSquared(camera.position) - b.position.distanceToSquared(camera.position));

    ctx.on('predraw', () => {
      if (!ctx.shadersEnabled) { screenFx.enabled = false; return; }
      screenFx.begin(camera, frameDt);
      camera.getWorldDirection(forward);

      for (const bh of byDistance(blackHoleManager.getBlackHoles())) {
        if (!bh.isDisposed) screenFx.addLens(bh.position, bh.coreRadius * bh.currentScale);
      }

      const smoothing = 1 - Math.exp(-frameDt * 8);
      for (const star of byDistance(celestialManager.getStars())) {
        if (star.isDisposed) continue;
        const vis = starVisibility.get(star);
        if (vis) vis.value += (vis.target - vis.value) * smoothing;
        const { hot, mid } = star.getColors();
        glareColor.copy(mid).lerp(hot, 0.5);
        screenFx.addGlare(star.position, star.radius, glareColor, 1.1 * (vis?.value ?? 1));
      }

      for (const nuke of byDistance(explosionManager.getNuclearExplosions())) {
        if (nuke.isDisposed) continue;
        const t = nuke.elapsed;
        const r = nuke.craterRadius;
        center.copy(nuke.position).y += r;
        const flash = (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 2.2)) * exposure(center, r * 12);
        screenFx.addFlash(nukeFlash, flash);

        const ring = Math.min(t * r * 4.5, r * 16);
        const strength = t < nuke.duration * 0.6 ? Math.exp(-t * 0.5) : 0;
        screenFx.addShock(center, ring, r * 0.7, strength, r * 2.2, Math.max(0, 1 - t / nuke.duration));
        // The blast front sweeping past the player shakes the colors apart
        const front = camera.position.distanceTo(center) - ring;
        screenFx.addAberration(Math.exp(-((front / (r * 1.2)) ** 2)) * 0.04 * strength);
      }

      for (const blast of byDistance(explosionManager.getExplosions())) {
        if (blast.isDisposed) continue;
        const p = blast.progress;
        const fade = 1 - p;
        screenFx.addFlash(blastFlash, fade ** 3 * Math.min(1, blast.radius / 8) * 0.5 * exposure(blast.position, blast.radius * 8));
        screenFx.addShock(blast.position, p * blast.radius * 5, blast.radius * 0.5, fade * 0.9, blast.radius * 1.6, fade * 0.7);
      }

      screenFx.end();
    });

    // Atalho: 'r' solta um raio divino onde o jogador estiver olhando
    ctx.on<string>('keydown', (key) => {
      if (key?.toLowerCase() === 'r' && ctx.started) {
        beamManager.fireFromPlayer(player, world, explosionManager, 'lightning', 5.0);
      }
    });

    const pointAhead = (distance: number): Vector3 => {
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      return camera.position.clone().add(dir.multiplyScalar(distance));
    };

    const raycastAhead = (maxDistance: number, fallbackDistance: number): Vector3 => {
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const hit = raycastVoxel(world, camera.position, dir, maxDistance);
      return hit ? hit.point : camera.position.clone().add(dir.multiplyScalar(fallbackDistance));
    };

    commands.register(['/blackhole', '/buraconegro', '/bh'], (args) => {
      if (args[0] === 'clear' || args[0] === 'remove' || args[0] === 'limpar') {
        blackHoleManager.clear();
        return;
      }

      // Posição padrão: 16 blocos à frente do olhar do jogador
      const spawnPos = pointAhead(16);
      let radius = 3.0;
      let lifetime = 45;

      if (args[0] === 'spawn' && args.length >= 4) {
        spawnPos.set(parseFloat(args[1]), parseFloat(args[2]), parseFloat(args[3]));
        if (args[4]) radius = parseFloat(args[4]);
        if (args[5]) lifetime = parseFloat(args[5]);
      } else {
        if (args[0] && !isNaN(parseFloat(args[0]))) radius = parseFloat(args[0]);
        if (args[1] && !isNaN(parseFloat(args[1]))) lifetime = parseFloat(args[1]);
      }

      blackHoleManager.spawn({ position: spawnPos, radius, lifetime });
    });

    const beamCommand = (type: 'lightning' | 'laser' | 'orbital', defaultRadius: number) => (args: string[]) => {
      const radius = args[0] ? parseFloat(args[0]) : defaultRadius;
      beamManager.fireFromPlayer(player, world, explosionManager, type, isNaN(radius) ? defaultRadius : radius);
    };
    commands.register(['/raio', '/lightning', '/beam'], beamCommand('lightning', 5.5));
    commands.register('/laser', beamCommand('laser', 4.5));
    commands.register('/orbital', beamCommand('orbital', 11.0));

    commands.register(['/explode', '/boom'], (args) => {
      const radius = args[0] ? parseFloat(args[0]) : 6.0;
      const targetPos = raycastAhead(120, 25);
      explosionManager.createExplosion({ position: targetPos, radius: isNaN(radius) ? 6.0 : radius }, world, player);
    });

    commands.register(['/nuke', '/nuclear', '/cogumelo'], (args) => {
      const radius = args[0] ? parseFloat(args[0]) : 18.0;
      const height = args[1] ? parseFloat(args[1]) : 75.0;
      const targetPos = raycastAhead(160, 40);

      explosionManager.createNuclearExplosion({
        position: targetPos,
        radius: isNaN(radius) ? 18.0 : radius,
        cloudHeight: isNaN(height) ? 75.0 : height
      }, world, player);

      chat(ctx, `☢️ DETONAÇÃO NUCLEAR! Cogumelo atômico se erguendo em [${Math.round(targetPos.x)}, ${Math.round(targetPos.y)}, ${Math.round(targetPos.z)}]!`);
    });

    commands.register(['/star', '/estrela'], (args) => {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager.clear();
        return;
      }

      let type: StarType = 'sol';
      let radius: number | undefined = undefined;

      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (['sol', 'sun', 'amarela', 'yellow'].includes(lower)) type = 'sol';
        else if (['blue', 'azul', 'rigel'].includes(lower)) type = 'blue';
        else if (['red', 'vermelha', 'betelgeuse', 'giant'].includes(lower)) type = 'red';
        else if (['neutron', 'neutrons', 'pulsar'].includes(lower)) type = 'neutron';
        else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0) radius = num;
        }
      }

      celestialManager.spawnStar({ position: pointAhead(30), type, radius }, blackHoleManager.getBlackHoles());
    });

    commands.register(['/planet', '/planeta'], (args) => {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager.clear();
        return;
      }

      let type: PlanetType = 'earth';
      let radius: number | undefined = undefined;

      for (const arg of args) {
        const lower = arg.toLowerCase();
        if (['earth', 'terra', 'mundo'].includes(lower)) type = 'earth';
        else if (['gas', 'gas_giant', 'gasoso', 'saturno', 'jupiter'].includes(lower)) type = 'gas_giant';
        else if (['lava', 'magma', 'fogo'].includes(lower)) type = 'lava';
        else if (['ice', 'gelo', 'neve'].includes(lower)) type = 'ice';
        else {
          const num = parseFloat(arg);
          if (!isNaN(num) && num > 0) radius = num;
        }
      }

      celestialManager.spawnPlanet({ position: pointAhead(24), type, radius }, undefined, blackHoleManager.getBlackHoles());
    });

    commands.register('/celestial', (args) => {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        celestialManager.clear();
      }
    });
  }
};
