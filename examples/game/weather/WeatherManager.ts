import { Color, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three';
import type { EngineContext, Player, ProceduralWorld } from '@voxel/engine/worker';
import { WeatherPass } from './WeatherPass';
import { WeatherParticles } from './WeatherParticles';
import { Tornado } from './Tornado';
import { WeatherPreset, WEATHER_PRESETS, WeatherType } from './WeatherTypes';
import { chat } from '../plugins/chat';

export class WeatherManager {
  private currentWeather: WeatherType = 'clear';
  private targetWeather: WeatherType = 'clear';
  private transitionTimer = 0;
  private readonly transitionDuration = 5.0; // 5 seconds smooth blending

  // Interpolated properties
  private curCloudDensity = 0.0;
  private curCloudColor = new Color(0xffffff);
  private curSkyColor = new Color(0x87ceeb);
  private curFogNear = 128.0;
  private curFogFar = 256.0;
  private curFogColor = new Color(0x87ceeb);
  private curDaylightMult = 1.0;
  private curWindSpeed = 2.0;
  private curWindDir = new Vector2(1, 0);
  private curRainIntensity = 0.0;
  private curSandIntensity = 0.0;
  private curStormIntensity = 0.0;

  private weatherPass: WeatherPass;
  private particles: WeatherParticles;
  private tornadoes: Tornado[] = [];

  private lightningTimer = 0;
  private lightningDecay = 0;
  private autoCycle = true;
  private cycleTimer = 0;
  private cycleInterval = 180; // Changes naturally every 3 minutes

  private fancyShaders = true;

  constructor(
    private readonly ctx: EngineContext,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly world: ProceduralWorld,
    private readonly player: Player
  ) {
    this.weatherPass = new WeatherPass();
    this.ctx.postProcessor.add(this.weatherPass);

    this.particles = new WeatherParticles();
    this.scene.add(this.particles.group);

    this.fancyShaders = this.ctx.shadersEnabled;
    this.particles.setShaderQuality(this.fancyShaders);
  }

  public setShadersEnabled(enabled: boolean): void {
    this.fancyShaders = enabled;
    this.particles.setShaderQuality(enabled);
    for (const t of this.tornadoes) t.setShaderQuality(enabled);
    if (!enabled) {
      this.weatherPass.enabled = false;
    }
  }

  public getWeather(): WeatherType {
    return this.targetWeather;
  }

  public setWeather(type: WeatherType, immediate = false): void {
    if (!WEATHER_PRESETS[type]) return;

    const pPos = this.player.camera.position;
    const isDesert = this.checkIfDesert(pPos);
    const isCold = this.checkIfCold(pPos);

    // Rule 1: Tempestades de areia só acontecem no deserto
    if (type === 'sandstorm' && !isDesert) {
      chat(this.ctx, '⚠️ Tempestades de areia só acontecem no bioma de deserto! Encontre um deserto para experienciá-la.');
      return;
    }

    // Rule 2: Chuvas não devem aparecer no deserto
    if ((type === 'rain' || type === 'storm') && isDesert) {
      chat(this.ctx, '☀️ O ar seco do deserto impede a chuva. Não chove no deserto!');
      // Desert storm becomes a dry sandstorm if severe, or clear
      if (type === 'storm') {
        type = 'sandstorm';
      } else {
        return;
      }
    }

    // Rule 3: Em biomas de gelo, chuva vira neve
    if ((type === 'rain' || type === 'storm') && isCold) {
      chat(this.ctx, '❄️ Em biomas de gelo, a chuva precipita como neve!');
    }

    this.targetWeather = type;

    if (immediate) {
      this.currentWeather = type;
      this.transitionTimer = this.transitionDuration;
      this.applyPreset(WEATHER_PRESETS[type], 1.0);
    } else {
      this.transitionTimer = 0;
    }

    const preset = WEATHER_PRESETS[type];
    chat(this.ctx, `🌦️ Clima alterado para: ${preset.label}`);
    this.ctx.emitToMain('weather:changed', { weather: type, label: preset.label });

    // Auto-spawn tornadoes during severe tornado weather
    if (type === 'tornado' && this.tornadoes.length === 0) {
      this.spawnTornadoAhead(36);
    }
  }

  public update(dtSeconds: number): void {
    const pPos = this.player.camera.position;
    const isDesert = this.checkIfDesert(pPos);
    const isCold = this.checkIfCold(pPos);

    // If player leaves desert while a sandstorm is active, clear it naturally
    if (this.targetWeather === 'sandstorm' && !isDesert) {
      chat(this.ctx, '💨 A tempestade de areia cessou ao sair do deserto.');
      this.setWeather('clear');
    }

    // ── 1. Smooth Weather Blending ──
    const fromPreset = WEATHER_PRESETS[this.currentWeather];
    const toPreset = WEATHER_PRESETS[this.targetWeather];

    if (this.transitionTimer < this.transitionDuration) {
      this.transitionTimer += dtSeconds;
      const t = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      const smoothT = t * t * (3 - 2 * t);
      this.lerpPresets(fromPreset, toPreset, smoothT);
      if (t >= 1.0) {
        this.currentWeather = this.targetWeather;
      }
    } else {
      this.applyPreset(toPreset, 1.0);
    }

    // ── 2. Natural Weather Cycle ──
    if (this.autoCycle) {
      this.cycleTimer += dtSeconds;
      if (this.cycleTimer >= this.cycleInterval) {
        this.cycleTimer = 0;
        this.advanceNaturalWeather(isDesert, isCold);
      }
    }

    // ── 3. Biome Restrictions ──
    let effectiveRain = this.curRainIntensity;
    let effectiveSand = this.curSandIntensity;

    // Chuvas NUNCA aparecem no deserto
    if (isDesert) {
      effectiveRain = 0.0;
    }

    // Tempestades de areia NUNCA acontecem fora do deserto
    if (!isDesert) {
      effectiveSand = 0.0;
    }

    // Em biomas de gelo, nevoeiro e nuvens adaptam para clima gélido
    if (isCold && effectiveRain > 0) {
      this.curFogColor.lerp(new Color(0xd5e2f0), 0.7);
      this.curCloudColor.lerp(new Color(0xc5d4e4), 0.6);
      this.curDaylightMult = Math.max(0.4, this.curDaylightMult * 1.15); // Reflexo da neve
    }

    // ── 4. Atmospheric Sky & World Updates ──
    const sky = this.world.getSky();
    if (sky) {
      sky.weatherCloudDensity = this.curCloudDensity;
      sky.weatherCloudColor = this.curCloudColor;
      sky.weatherSkyColor = this.curSkyColor;
      sky.weatherDaylightFactor = this.curDaylightMult;
      sky.weatherLightningFlash = this.lightningDecay;
    }

    this.world.setWeatherFog(this.curFogNear, this.curFogFar, this.curFogColor);
    this.world.setStormChoppiness(this.curStormIntensity);

    // ── 5. Particles (Rain, Snow in cold biomes, Sand in desert) ──
    this.particles.update(
      dtSeconds,
      this.camera,
      effectiveRain,
      effectiveSand,
      this.curWindDir,
      this.curWindSpeed,
      isCold // When in ice biome, rain precipitates as snow!
    );

    // ── 6. Lightning Strikes ──
    const interval = toPreset.lightningInterval;
    if (interval > 0) {
      this.lightningTimer += dtSeconds;
      if (this.lightningTimer >= interval + (Math.random() - 0.5) * 4.0) {
        this.lightningTimer = 0;
        this.triggerLightningStrike();
      }
    }
    if (this.lightningDecay > 0) {
      this.lightningDecay = Math.max(0, this.lightningDecay - 4.5 * dtSeconds);
    }

    // ── 7. Update Active Tornadoes ──
    for (let i = this.tornadoes.length - 1; i >= 0; i--) {
      const tornado = this.tornadoes[i];
      tornado.setLightningFlash(this.lightningDecay);
      tornado.update(dtSeconds, this.player);
      if (tornado.isDisposed) {
        tornado.dispose();
        this.tornadoes.splice(i, 1);
      }
    }

    // ── 8. Update Atmospheric Lightning Flash ──
    if (this.fancyShaders && this.ctx.shadersEnabled) {
      this.weatherPass.decayFlash(3.2, dtSeconds);
      this.weatherPass.end();
    } else {
      this.weatherPass.enabled = false;
    }
  }

  private lerpPresets(a: WeatherPreset, b: WeatherPreset, t: number): void {
    this.curCloudDensity = a.cloudDensity + (b.cloudDensity - a.cloudDensity) * t;
    this.curCloudColor.set(a.cloudColor).lerp(new Color(b.cloudColor), t);
    this.curSkyColor.set(a.skyColor).lerp(new Color(b.skyColor), t);
    this.curFogNear = a.fogNear + (b.fogNear - a.fogNear) * t;
    this.curFogFar = a.fogFar + (b.fogFar - a.fogFar) * t;
    this.curFogColor.set(a.fogColor).lerp(new Color(b.fogColor), t);
    this.curDaylightMult = a.daylightMultiplier + (b.daylightMultiplier - a.daylightMultiplier) * t;
    this.curWindSpeed = a.windSpeed + (b.windSpeed - a.windSpeed) * t;
    this.curWindDir.copy(a.windDir).lerp(b.windDir, t).normalize();
    this.curRainIntensity = a.rainIntensity + (b.rainIntensity - a.rainIntensity) * t;
    this.curSandIntensity = a.sandIntensity + (b.sandIntensity - a.sandIntensity) * t;
    this.curStormIntensity = a.stormIntensity + (b.stormIntensity - a.stormIntensity) * t;
  }

  private applyPreset(p: WeatherPreset, intensity: number): void {
    this.curCloudDensity = p.cloudDensity * intensity;
    this.curCloudColor.set(p.cloudColor);
    this.curSkyColor.set(p.skyColor);
    this.curFogNear = p.fogNear;
    this.curFogFar = p.fogFar;
    this.curFogColor.set(p.fogColor);
    this.curDaylightMult = p.daylightMultiplier;
    this.curWindSpeed = p.windSpeed;
    this.curWindDir.copy(p.windDir);
    this.curRainIntensity = p.rainIntensity * intensity;
    this.curSandIntensity = p.sandIntensity * intensity;
    this.curStormIntensity = p.stormIntensity * intensity;
  }

  public triggerLightningStrike(targetPosition?: Vector3): void {
    this.lightningDecay = 1.0;

    const pPos = this.player.camera.position;
    const strikePos = targetPosition ?? new Vector3(
      pPos.x + (Math.random() - 0.5) * 60,
      pPos.y,
      pPos.z + (Math.random() - 0.5) * 60
    );

    this.weatherPass.addFlash(new Color(0.85, 0.95, 1.0), 0.95);

    this.ctx.emitToMain('weather:lightning', {
      x: strikePos.x,
      y: strikePos.y,
      z: strikePos.z
    });
  }

  public spawnTornado(position: Vector3, radius = 4.0, height = 180.0): Tornado {
    const tornado = new Tornado({ position, radius, height });
    tornado.setShaderQuality(this.fancyShaders && this.ctx.shadersEnabled);
    this.tornadoes.push(tornado);
    this.scene.add(tornado.group);
    chat(this.ctx, `🌪️ Tornado formado em [${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}]!`);
    return tornado;
  }

  public spawnTornadoAhead(distance = 35): Tornado {
    const dir = new Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.player.camera.position.clone().add(dir.multiplyScalar(distance));
    pos.y = Math.max(10, this.player.camera.position.y - 2);
    return this.spawnTornado(pos);
  }

  public clearTornadoes(): void {
    for (const t of this.tornadoes) t.dispose();
    this.tornadoes.length = 0;
    chat(this.ctx, '🌪️ Tornados dissipados.');
  }

  private advanceNaturalWeather(isDesert: boolean, isCold: boolean): void {
    if (isDesert) {
      // In desert, cycle between clear and sandstorm
      const desertCycle: WeatherType[] = ['clear', 'sandstorm', 'clear'];
      const next = desertCycle[Math.floor(Math.random() * desertCycle.length)];
      this.setWeather(next);
      return;
    }

    // Outside desert: clear, rain (which becomes snow in cold biomes), or storm
    const normalCycle: WeatherType[] = ['clear', 'rain', 'clear', 'storm', 'clear'];
    const next = normalCycle[Math.floor(Math.random() * normalCycle.length)];
    this.setWeather(next);
  }

  public checkIfDesert(pos: Vector3): boolean {
    if (this.world.activeDimension?.id === 'mercury') return true;
    const px = Math.floor(pos.x);
    const pz = Math.floor(pos.z);
    const py = Math.floor(pos.y);

    let sandCount = 0;
    for (let dx = -4; dx <= 4; dx += 4) {
      for (let dz = -4; dz <= 4; dz += 4) {
        const bx = px + dx;
        const bz = pz + dz;
        for (let y = Math.min(120, py + 3); y >= Math.max(2, py - 12); y--) {
          const b = this.world.getBlock(bx, y, bz);
          if (b > 0 && b !== 5) {
            // Sand = 3, Cactus = 39, Basalt = 11
            if (b === 3 || b === 39) {
              sandCount++;
            }
            break;
          }
        }
      }
    }
    return sandCount >= 2;
  }

  public checkIfCold(pos: Vector3): boolean {
    if (this.world.activeDimension?.id === 'lunar') return true;
    const px = Math.floor(pos.x);
    const pz = Math.floor(pos.z);
    const py = Math.floor(pos.y);

    // High mountain elevation (Y >= 70) in standard terrain is freezing snow peaks
    if (py >= 70) return true;

    let snowCount = 0;
    for (let dx = -4; dx <= 4; dx += 4) {
      for (let dz = -4; dz <= 4; dz += 4) {
        const bx = px + dx;
        const bz = pz + dz;
        for (let y = Math.min(120, py + 3); y >= Math.max(2, py - 12); y--) {
          const b = this.world.getBlock(bx, y, bz);
          if (b > 0 && b !== 5) {
            // Snow = 4
            if (b === 4) {
              snowCount++;
            }
            break;
          }
        }
      }
    }
    return snowCount >= 2;
  }

  public dispose(): void {
    this.clearTornadoes();
    this.particles.dispose();
    this.scene.remove(this.particles.group);
    this.weatherPass.dispose();
    this.ctx.postProcessor.remove(this.weatherPass);
  }
}
