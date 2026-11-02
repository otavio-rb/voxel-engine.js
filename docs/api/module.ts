/**
 * Entrada de uma página de módulo (`/docs/api/<id>/`).
 *
 * Renderiza o cartão do módulo a partir do `registry` e monta o playground: editor,
 * palco (canvas) e console. O código do exemplo é compilado com `new Function` e recebe
 * os módulos reais de `engine/` como parâmetros — mais os sandboxes de `sandbox.ts`,
 * que sobem um `ProceduralWorld` ou a engine inteira dentro da própria página.
 */
import * as THREE from 'three';

import { EventEmitter } from '../../engine/core/EventEmitter';
import { GameLoop } from '../../engine/core/GameLoop';
import { FrameProfiler } from '../../engine/core/FrameProfiler';
import { AIR, blockRegistry } from '../../engine/blocks/BlockRegistry';
import { CommandRegistry } from '../../engine/runtime/CommandRegistry';
import ChunkData from '../../engine/chunk/ChunkData';
import ChunkGeometry from '../../engine/chunk/ChunkGeometry';
import { worldGeneratorRegistry } from '../../engine/world/WorldGeneratorRegistry';
import { dimensionRegistry } from '../../engine/dimension/DimensionRegistry';
import { DEFAULT_DIMENSION } from '../../engine/dimension/Dimension';
import { KinematicBody } from '../../engine/physics/AABBPhysics';
import { raycastVoxel } from '../../engine/physics/VoxelRaycaster';
import FluidCellularAutomata, { packCoord, unpackCoord } from '../../engine/physics/FluidCellularAutomata';
import { VoxelParticles } from '../../engine/effects/VoxelParticles';
import { MOVEMENT, scaleMovement } from '../../engine/player/Player';
import RNG from '../../engine/utils/rng';
import { PostProcessor, FULLSCREEN_VERTEX, bindSceneUniforms } from '../../engine/render/PostProcessor';
import { ShaderPipeline } from '../../engine/render/ShaderPipeline';
import { CinematicPass } from '../../engine/render/CinematicPass';
import { ShadowMap, SHADOW_LAYER } from '../../engine/render/ShadowMap';
import { BloomPass } from '../../engine/render/post/BloomPass';
import { SsaoPass } from '../../engine/render/post/SsaoPass';
import { VolumetricPass } from '../../engine/render/post/VolumetricPass';
import { FxaaPass } from '../../engine/render/post/FxaaPass';
import { Entity } from '../../engine/entities/Entity';
import { EntityManager } from '../../engine/entities/EntityManager';
import { entityRegistry } from '../../engine/entities/EntityRegistry';
import { VoxelEngine } from '../../engine/core/VoxelEngine';

import { registerDocsContent, DOCS_BLOCKS } from './content';
import {
  createChunkWorkerHandle,
  createEngine,
  createViewer,
  createVoxelScene,
  createWorld,
  voxelMesh,
  voxelObject,
  voxelVolume,
  type RunHandle,
  type Stage
} from './sandbox';
import { GROUPS, findModule, type ApiModule, type ApiMember } from './registry';
import { isEn, GROUP_TRANSLATIONS_EN, MODULE_TRANSLATIONS_EN, translateDesc, translateNote } from './i18n';
import { highlight } from './highlight';
import './playground.css';

registerDocsContent();

const KIND_LABEL: Record<ApiModule['kind'], string> = {
  class: 'class',
  singleton: 'singleton',
  function: 'function',
  interface: 'interface',
  const: 'const',
  guide: 'guide'
};

// ─── Playground ─────────────────────────────────────────────────────────────
class Playground {
  private readonly editor: HTMLTextAreaElement;
  private readonly overlay: HTMLElement;
  private readonly output: HTMLElement;
  private readonly status: HTMLElement;
  private readonly stage: Stage;
  private current: RunHandle | null = null;

  constructor(private readonly module: ApiModule, root: HTMLElement) {
    this.editor = root.querySelector('.pg-editor') as HTMLTextAreaElement;
    this.overlay = root.querySelector('.pg-highlight') as HTMLElement;
    this.output = root.querySelector('.pg-output') as HTMLElement;
    this.status = root.querySelector('.pg-status') as HTMLElement;

    const stageEl = root.querySelector('.pg-stage') as HTMLElement;
    const canvas = root.querySelector('.pg-canvas') as HTMLCanvasElement;
    const hud = root.querySelector('.pg-hud') as HTMLElement;

    this.stage = {
      element: stageEl,
      canvas,
      hud,
      show: () => stageEl.classList.remove('hidden'),
      resize: (aspect?: number) => {
        const width = Math.max(320, stageEl.clientWidth - 20);
        const height = Math.round(aspect ? width / aspect : Math.min(460, Math.max(280, width * 0.58)));
        canvas.style.height = `${height}px`;
        canvas.width = Math.floor(width * Math.min(devicePixelRatio, 2));
        canvas.height = Math.floor(height * Math.min(devicePixelRatio, 2));
        return { width, height };
      }
    };

    this.editor.value = this.stored() ?? module.example.code;
    this.sync();

    this.editor.addEventListener('input', () => {
      this.sync();
      this.persist();
    });
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const { selectionStart: a, selectionEnd: b, value } = this.editor;
        this.editor.value = `${value.slice(0, a)}  ${value.slice(b)}`;
        this.editor.selectionStart = this.editor.selectionEnd = a + 2;
        this.sync();
        this.persist();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.run();
      }
    });

    root.querySelector('.pg-run')?.addEventListener('click', () => void this.run());
    root.querySelector('.pg-stop')?.addEventListener('click', () => this.stopCurrent(true));
    root.querySelector('.pg-reset')?.addEventListener('click', () => this.reset());
    root.querySelector('.pg-copy')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      void navigator.clipboard.writeText(this.editor.value).then(() => {
        btn.textContent = 'copiado';
        setTimeout(() => (btn.textContent = 'copiar'), 1600);
      });
    });

    // A demo morre junto com a página: nada de worker órfão ao navegar.
    window.addEventListener('pagehide', () => this.stopCurrent(false));
  }

  private storageKey(): string {
    return `voxel-docs-api:v2:${this.module.id}`;
  }

  private stored(): string | null {
    try {
      localStorage.removeItem(`voxel-docs-api:${this.module.id}`);
      return localStorage.getItem(this.storageKey());
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      if (this.editor.value === this.module.example.code) localStorage.removeItem(this.storageKey());
      else localStorage.setItem(this.storageKey(), this.editor.value);
    } catch {
      /* navegação privada: a edição vale só para esta aba */
    }
    document.querySelector('.pg-edited')?.classList.toggle('hidden', this.editor.value === this.module.example.code);
  }

  private sync(): void {
    this.overlay.innerHTML = `${highlight(this.editor.value)}\n`;
    this.editor.style.height = 'auto';
    const measured = this.editor.scrollHeight;
    const fallback = Math.max(this.editor.value.split('\n').length, 4) * 20 + 24;
    this.editor.style.height = `${measured > 0 ? measured : fallback}px`;
  }

  private reset(): void {
    this.editor.value = this.module.example.code;
    this.sync();
    this.persist();
    void this.run();
  }

  private line(text: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = `pg-line ${cls}`;
    el.textContent = text;
    this.output.appendChild(el);
    this.output.scrollTop = this.output.scrollHeight;
  }

  private format(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
    if (value instanceof THREE.Vector3) return `Vector3(${value.x}, ${value.y}, ${value.z})`;
    if (ArrayBuffer.isView(value)) {
      const arr = value as unknown as ArrayLike<number>;
      const head = Array.from({ length: Math.min(arr.length, 10) }, (_, i) => arr[i]).join(', ');
      return `${(value as object).constructor.name}(${arr.length}) [${head}${arr.length > 10 ? ', …' : ''}]`;
    }
    try {
      const json = JSON.stringify(value, null, 1);
      return json ? json.replace(/\n\s*/g, ' ') : String(value);
    } catch {
      return String(value);
    }
  }

  private stopCurrent(announce: boolean): void {
    if (!this.current) return;
    this.current.cancelled = true;
    for (const stop of this.current.stops) {
      try {
        stop();
      } catch (err) {
        console.warn('[playground] falha ao parar', err);
      }
    }
    this.current = null;
    document.querySelector('.pg-stop')?.classList.add('hidden');
    if (announce) {
      this.status.textContent = 'parado';
      this.status.className = 'pg-status idle';
      this.stage.hud.textContent = 'demo parada';
    }
  }

  async run(): Promise<void> {
    this.stopCurrent(false);
    this.output.innerHTML = '';
    this.stage.hud.textContent = '';

    const handle: RunHandle = { stops: [], cancelled: false };
    this.current = handle;
    document.querySelector('.pg-stop')?.classList.remove('hidden');

    if (this.module.example.visual === '2d') {
      this.stage.show();
      this.stage.resize(2);
      this.stage.canvas.getContext('2d')?.clearRect(0, 0, this.stage.canvas.width, this.stage.canvas.height);
    }

    const print = (...args: unknown[]) => {
      if (handle.cancelled) return;
      this.line(args.map((a) => this.format(a)).join(' '));
    };

    const scope: Record<string, unknown> = {
      // sandboxes e utilidades da página
      print,
      sleep: (ms: number) =>
        new Promise((resolve) => {
          const id = setTimeout(resolve, ms);
          handle.stops.push(() => clearTimeout(id));
        }),
      onStop: (fn: () => void) => handle.stops.push(fn),
      canvas: this.stage.canvas,
      hud: (text: string) => {
        this.stage.hud.textContent = text;
      },
      view3D: (options?: Parameters<typeof createViewer>[2]) => createViewer(this.stage, handle, options),
      voxelScene: (options?: Parameters<typeof createVoxelScene>[2]) => createVoxelScene(this.stage, handle, options),
      worldSandbox: (options?: Parameters<typeof createWorld>[2]) => createWorld(this.stage, handle, options),
      engineSandbox: (options?: Parameters<typeof createEngine>[2]) => createEngine(this.stage, handle, options),
      chunkWorker: () => createChunkWorkerHandle(handle),
      voxelMesh,
      voxelObject,
      voxelVolume,
      THREE,
      BLOCKS: DOCS_BLOCKS,
      // engine
      VoxelEngine,
      EventEmitter,
      GameLoop,
      FrameProfiler,
      CommandRegistry,
      blockRegistry,
      AIR,
      ChunkData,
      ChunkGeometry,
      worldGeneratorRegistry,
      dimensionRegistry,
      DEFAULT_DIMENSION,
      KinematicBody,
      raycastVoxel,
      FluidCellularAutomata,
      packCoord,
      unpackCoord,
      VoxelParticles,
      MOVEMENT,
      scaleMovement,
      RNG,
      PostProcessor,
      FULLSCREEN_VERTEX,
      bindSceneUniforms,
      ShaderPipeline,
      CinematicPass,
      ShadowMap,
      SHADOW_LAYER,
      BloomPass,
      SsaoPass,
      VolumetricPass,
      FxaaPass,
      Entity,
      EntityManager,
      entityRegistry
    };

    const names = Object.keys(scope);
    const t0 = performance.now();
    this.status.textContent = 'rodando…';
    this.status.className = 'pg-status running';

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...names, `"use strict";\nreturn (async () => {\n${this.editor.value}\n})();`);
      await fn(...names.map((n) => scope[n]));
      if (handle.cancelled) return;
      this.status.textContent = `ok · ${(performance.now() - t0).toFixed(0)} ms`;
      this.status.className = 'pg-status ok';
    } catch (err) {
      if (handle.cancelled) return;
      const error = err as Error;
      this.line(`${error.name ?? 'Erro'}: ${error.message ?? String(err)}`, 'error');
      this.status.textContent = 'erro';
      this.status.className = 'pg-status error';
      console.error(`[playground:${this.module.id}]`, err);
    }
  }
}

// ─── Render da página ───────────────────────────────────────────────────────
const SECTION_ORDER: { kind: ApiMember['kind']; pt: string; en: string }[] = [
  { kind: 'constructor', pt: 'Construtor', en: 'Constructor' },
  { kind: 'property', pt: 'Propriedades', en: 'Properties' },
  { kind: 'method', pt: 'Métodos', en: 'Methods' },
  { kind: 'event', pt: 'Eventos', en: 'Events' }
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&lt;|&gt;|&amp;/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function memberSections(module: ApiModule, en: boolean): string {
  return SECTION_ORDER.map(({ kind, pt, en: enLabel }) => {
    const members = module.members.filter((m) => m.kind === kind);
    if (!members.length) return '';
    const rows = members
      .map((m) => {
        const desc = translateDesc(m.desc, en);
        const anchor = `m-${kind}-${slug(m.signature)}`;
        return `
      <div class="api-member" id="${anchor}">
        <a class="api-member-anchor" href="#${anchor}"><code>${m.signature}</code></a>
        <p>${desc}</p>
      </div>`;
      })
      .join('');
    return `
    <h2 class="api-section-title">${en ? enLabel : pt}</h2>
    <div class="api-members api-members-${kind}">${rows}
    </div>`;
  }).join('');
}

function moduleBody(module: ApiModule): string {
  const en = isEn();
  const t = en ? MODULE_TRANSLATIONS_EN[module.id] : undefined;
  const summary = t?.summary ?? module.summary;
  const exampleTitle = t?.exampleTitle ?? module.example.title;
  const note = translateNote(module.id, module.example.note, en);
  const related = en ? (t?.related ?? module.related) : module.related;

  const demoNote = note ? `<p class="pg-hint note">${note}</p>` : '';
  const relatedBlock = related
    ? `<div class="api-related"><strong>${en ? 'See also' : 'Veja também'}</strong><span>${related}</span></div>`
    : '';

  return `
    <header class="api-module-head">
      <div class="api-module-title">
        <h1>${module.name}</h1>
        <span class="kind">${KIND_LABEL[module.kind]}</span>
      </div>
      <a class="api-module-file" href="https://github.com/voxel/engine/blob/main/${module.file}" target="_blank" rel="noreferrer">
        <span class="material-symbols-outlined">code</span>${module.file}
      </a>
    </header>

    <p class="api-module-summary">${summary}</p>

    ${relatedBlock}

    <div class="api-import"><code>${module.entry.replace(/</g, '&lt;')}</code></div>

    ${memberSections(module, en)}

    <h2 class="api-section-title">${en ? 'Proof of Concept' : 'Prova de conceito'}</h2>
    <section class="playground">
      <header class="pg-head">
        <div class="pg-head-left">
          <span class="material-symbols-outlined">play_circle</span>
          <span>${exampleTitle}</span>
          <span class="pg-edited hidden">${en ? 'edited' : 'editado'}</span>
        </div>
        <div class="pg-actions">
          <span class="pg-status idle">${en ? 'ready' : 'pronto'}</span>
          <button class="pg-copy" type="button">${en ? 'copy' : 'copiar'}</button>
          <button class="pg-reset" type="button">${en ? 'reset' : 'restaurar'}</button>
          <button class="pg-stop hidden" type="button">${en ? 'stop' : 'parar'}</button>
          <button class="pg-run" type="button"><span class="material-symbols-outlined">play_arrow</span>${en ? 'Run' : 'Executar'}</button>
        </div>
      </header>

      <p class="pg-hint">${en ? 'Edit and run (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Runs against real engine modules; edits persist in this browser.' : 'Edite e execute (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>). Roda contra os módulos reais da engine; as edições ficam salvas neste navegador.'}</p>
      ${demoNote}

      <div class="pg-stage hidden">
        <canvas class="pg-canvas"></canvas>
        <div class="pg-hud"></div>
      </div>

      <div class="pg-code">
        <pre class="pg-highlight" aria-hidden="true"></pre>
        <textarea class="pg-editor" spellcheck="false"></textarea>
      </div>

      <div class="pg-output"></div>
    </section>`;
}

function sidebarNav(currentId: string, en: boolean): string {
  return GROUPS.map(
    (group) => {
      const title = en ? (GROUP_TRANSLATIONS_EN[group.id]?.title ?? group.title) : group.title;
      return `
    <div class="nav-group">
      <span class="nav-group-title">${title}</span>
      ${group.modules
        .map(
          (m) =>
            `<a class="nav-link ${m.id === currentId ? 'active' : ''}" href="/docs/api/${m.id}/${en ? '?lang=en' : ''}">${m.name}</a>`
        )
        .join('')}
    </div>`;
    }
  ).join('');
}

function render(): void {
  const id = document.body.dataset.module ?? '';
  const found = findModule(id);
  const root = document.getElementById('api-module');
  if (!found || !root) return;

  const { module, group, previous, next } = found;

  document.title = `${module.name} · API @voxel/engine`;
  root.innerHTML = moduleBody(module);

  const en = isEn();

  const nav = document.getElementById('api-nav');
  if (nav) nav.innerHTML = sidebarNav(module.id, en);

  const crumb = document.getElementById('api-crumb');
  if (crumb) crumb.textContent = en ? (GROUP_TRANSLATIONS_EN[group.id]?.title ?? group.title) : group.title;

  const prevEl = document.getElementById('api-prev') as HTMLAnchorElement | null;
  if (prevEl) {
    if (previous) {
      prevEl.href = `/docs/api/${previous.id}/${en ? '?lang=en' : ''}`;
      prevEl.querySelector('span.name')!.textContent = previous.name;
      const small = prevEl.querySelector('small');
      if (small) small.textContent = en ? 'previous' : 'anterior';
    } else {
      prevEl.classList.add('hidden');
    }
  }

  const nextEl = document.getElementById('api-next') as HTMLAnchorElement | null;
  if (nextEl) {
    if (next) {
      nextEl.href = `/docs/api/${next.id}/${en ? '?lang=en' : ''}`;
      nextEl.querySelector('span.name')!.textContent = next.name;
      const small = nextEl.querySelector('small');
      if (small) small.textContent = en ? 'next' : 'próximo';
    } else {
      nextEl.classList.add('hidden');
    }
  }

  // Header/sidebar já saem bilíngues da casca estática (scripts/docs-shell.mjs, via
  // [data-lang]) e os hrefs internos ganham `?lang=en` genericamente em
  // docs/src/lang-switcher.js — nada para corrigir aqui em runtime.

  // A página existe para a demo: ela começa sozinha.
  void new Playground(module, root).run();

  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('docs-sidebar')?.classList.toggle('-translate-x-full');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
