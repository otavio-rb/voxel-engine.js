import { Vector3 } from 'three';
import { raycastVoxel, type EnginePlugin, type FixedUpdateEvent } from '@voxel/engine/worker';
import { BlackHoleManager } from '../effects/BlackHoleManager';
import { ExplosionManager } from '../effects/ExplosionManager';
import { BeamManager } from '../effects/BeamManager';
import { CelestialManager } from '../celestial/CelestialManager';
import { StarType } from '../celestial/Star';
import { PlanetType } from '../celestial/Planet';
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

    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      blackHoleManager.update(deltaMs, player, world);
      celestialManager.update(deltaMs, blackHoleManager);
      explosionManager.update(deltaMs);
      beamManager.update(deltaMs);
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
