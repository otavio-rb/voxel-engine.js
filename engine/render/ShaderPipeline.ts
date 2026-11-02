import { Color, PerspectiveCamera, Vector3 } from 'three';
import { PostProcessor } from './PostProcessor';
import { CinematicPass, type CinematicPassOptions } from './CinematicPass';
import { BloomPass, type BloomPassOptions } from './post/BloomPass';
import { SsaoPass, type SsaoPassOptions } from './post/SsaoPass';
import { VolumetricPass, type VolumetricPassOptions } from './post/VolumetricPass';
import { FxaaPass } from './post/FxaaPass';

/**
 * Presets de custo. Cada nivel liga mais passes e mais amostras, e a escolha e sobre
 * quanto de GPU o jogo quer gastar com imagem:
 *
 * - `off`: nada de post, a cena vai direto para a tela.
 * - `low`: so tonemapping e grading (um passe).
 * - `medium`: + bloom e FXAA.
 * - `high`: + raios de sol e nevoa aerea (passa a usar depth).
 * - `ultra`: + oclusao de ambiente em espaco de tela, com mais amostras em tudo.
 */
export type ShaderQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';

export interface ShaderPipelineOptions {
  quality?: ShaderQuality;
  /** Voxels por bloco: raios e distancias escritos em blocos sao convertidos por ele. */
  worldScale?: number;
  cinematic?: CinematicPassOptions;
  bloom?: BloomPassOptions;
  ssao?: SsaoPassOptions;
  volumetric?: VolumetricPassOptions;
}

/** Estado da cena que o pipeline precisa a cada quadro. */
export interface ShaderFrameState {
  camera?: PerspectiveCamera;
  /** Direcao da camera para o sol (nao precisa estar normalizada). */
  sunDirection?: Vector3;
  sunColor?: Color;
  skyColor?: Color;
  /** 0 = noite, 1 = meio-dia. */
  daylight?: number;
  underwater?: boolean;
  /** 0 a 1; chuva deixa as superficies molhadas e especulares. */
  wetness?: number;
  deltaSeconds?: number;
}

/**
 * Monta e governa a pilha de post-processing.
 *
 * Os passes existem como objetos independentes porque cada um e util sozinho — um jogo
 * pode querer so o bloom, ou trocar o grading pelo seu. O que esta classe adiciona e a
 * ordem correta (AO antes do bloom, para que o canto escurecido nao floresca; grading
 * depois de tudo; FXAA no fim, sobre a imagem final) e os presets de qualidade, que e a
 * parte que um jogo nao deveria ter que redescobrir.
 */
export class ShaderPipeline {
  public readonly ssao: SsaoPass;
  public readonly volumetric: VolumetricPass;
  public readonly bloom: BloomPass;
  public readonly cinematic: CinematicPass;
  public readonly fxaa: FxaaPass;

  private currentQuality: ShaderQuality;
  private readonly sunDirection = new Vector3(0, 1, 0);

  constructor(
    private readonly postProcessor: PostProcessor,
    options: ShaderPipelineOptions = {}
  ) {
    this.ssao = new SsaoPass(options.ssao);
    this.volumetric = new VolumetricPass(options.volumetric);
    this.bloom = new BloomPass(options.bloom);
    this.cinematic = new CinematicPass(options.cinematic);
    this.fxaa = new FxaaPass();

    // `setBloom` do passe cinematico encaminha para ca.
    this.cinematic.bloom = this.bloom;
    if (options.cinematic?.bloomStrength !== undefined) {
      this.bloom.setStrength(options.cinematic.bloomStrength);
    }

    for (const pass of [this.ssao, this.volumetric, this.bloom, this.cinematic, this.fxaa]) {
      this.postProcessor.add(pass);
    }

    this.postProcessor.frame.worldScale = options.worldScale ?? 1;
    this.currentQuality = options.quality ?? 'high';
    this.setQuality(this.currentQuality);
  }

  public get quality(): ShaderQuality {
    return this.currentQuality;
  }

  public setQuality(quality: ShaderQuality): void {
    this.currentQuality = quality;
    const level = quality === 'off' ? 0 : quality === 'low' ? 1 : quality === 'medium' ? 2 : quality === 'high' ? 3 : 4;

    this.postProcessor.enabled = level > 0;
    this.cinematic.enabled = level >= 1;
    this.bloom.enabled = level >= 2;
    this.fxaa.enabled = level >= 2;
    this.volumetric.enabled = level >= 3;
    this.ssao.enabled = level >= 4;

    // Em `ultra` o AO fica mais forte e a volumetria mais densa: o custo ja foi pago.
    // A intensidade nunca vai a zero, para que `/ssao on` em um preset menor funcione.
    this.ssao.setIntensity(level >= 4 ? 0.9 : 0.7);
    this.volumetric.setShaftStrength(level >= 4 ? 0.65 : 0.5);
  }

  /** Liga/desliga a pilha inteira sem perder a qualidade escolhida (`/shaders on|off`). */
  public setEnabled(enabled: boolean): void {
    this.postProcessor.enabled = enabled && this.currentQuality !== 'off';
  }

  /** Alimenta o estado do quadro. Chame uma vez por quadro, antes de desenhar. */
  public update(state: ShaderFrameState): void {
    const frame = this.postProcessor.frame;
    const dt = state.deltaSeconds ?? 1 / 60;

    frame.time += dt;
    frame.deltaSeconds = dt;
    if (state.camera) frame.camera = state.camera;
    if (state.sunDirection) {
      frame.sunDirection.copy(this.sunDirection.copy(state.sunDirection).normalize());
    }
    if (state.sunColor) frame.sunColor.copy(state.sunColor);
    if (state.skyColor) frame.skyColor.copy(state.skyColor);
    if (state.daylight !== undefined) frame.daylight = state.daylight;
    if (state.underwater !== undefined) frame.underwater = state.underwater;
    if (state.wetness !== undefined) frame.wetness = state.wetness;

    // O passe cinematico tem o seu proprio relogio para quem o usa fora do pipeline;
    // aqui ele e sincronizado com o do quadro.
    this.cinematic.material.uniforms.uTime.value = frame.time;
  }

  public dispose(): void {
    for (const pass of [this.ssao, this.volumetric, this.bloom, this.cinematic, this.fxaa]) {
      this.postProcessor.remove(pass);
      pass.dispose();
    }
  }
}
