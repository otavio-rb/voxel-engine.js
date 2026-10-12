import { type EnginePlugin, type FixedUpdateEvent } from '@voxel/engine/worker';
import { WeatherManager } from '../weather/WeatherManager';
import { WeatherType } from '../weather/WeatherTypes';
import { chat } from './chat';

export const weatherPlugin: EnginePlugin = {
  name: 'weather',
  setup(ctx) {
    const { scene, camera, world, player, commands } = ctx;

    const weatherManager = new WeatherManager(ctx, scene, camera, world, player);

    // Update simulation and climate transitions
    ctx.on<FixedUpdateEvent>('fixedUpdate', ({ deltaMs }) => {
      weatherManager.update(deltaMs / 1000);
    });

    // Handle shader quality changes (/shaders on|off)
    ctx.on<boolean>('shaders', (enabled) => {
      weatherManager.setShadersEnabled(enabled);
    });

    // ── Command Handlers ──
    const parseWeather = (arg: string): WeatherType | null => {
      const lower = arg.toLowerCase();
      if (['clear', 'limpo', 'sol', 'ensolarado', 'bom'].includes(lower)) return 'clear';
      if (['rain', 'chuva', 'chover'].includes(lower)) return 'rain';
      if (['storm', 'tempestade', 'trovoada', 'raios'].includes(lower)) return 'storm';
      if (['tornado', 'furacao', 'cyclone', 'redemoinho'].includes(lower)) return 'tornado';
      if (['sandstorm', 'areia', 'deserto', 'poeira', 'dust'].includes(lower)) return 'sandstorm';
      return null;
    };

    commands.register(['/weather', '/clima'], (args) => {
      if (args.length === 0) {
        chat(ctx, `Clima atual: ${weatherManager.getWeather()} | Opções: clear, rain, storm, tornado, sandstorm`);
        return;
      }
      const type = parseWeather(args[0]);
      if (type) {
        weatherManager.setWeather(type);
      } else {
        chat(ctx, 'Climas válidos: /clima [limpo | chuva | tempestade | tornado | areia]');
      }
    });

    commands.register(['/rain', '/chuva'], () => weatherManager.setWeather('rain'));
    commands.register(['/storm', '/tempestade'], () => weatherManager.setWeather('storm'));
    commands.register(['/sandstorm', '/areia'], () => weatherManager.setWeather('sandstorm'));
    commands.register(['/clear', '/limpo'], () => weatherManager.setWeather('clear'));

    commands.register(['/tornado', '/redemoinho'], (args) => {
      if (args[0] === 'clear' || args[0] === 'limpar') {
        weatherManager.clearTornadoes();
        return;
      }
      weatherManager.setWeather('tornado');
      weatherManager.spawnTornadoAhead(32);
    });

    commands.register('/thunder', () => {
      weatherManager.triggerLightningStrike();
    });
  }
};
