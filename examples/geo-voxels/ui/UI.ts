import { blockRegistry, BlockConfig, type EngineStats } from '@voxel/engine';

export type UIStats = EngineStats;

const BLOCK_NAMES: Record<number, string> = {
  0: 'Pedra',
  1: 'Terra',
  2: 'Grama',
  3: 'Areia',
  4: 'Neve',
  6: 'Água',
  7: 'Carvão',
  8: 'Ferro',
  9: 'Madeira',
  10: 'Folhas',
  11: 'Basalto',
  12: 'Magma',
  13: 'Lava',
  14: 'Cinzas',
  15: 'Obsidiana',
  16: 'Portal',
  17: 'Grama do Aether',
  18: 'Terra do Aether',
  19: 'Holystone',
  20: 'Holystone Musgoso',
  21: 'Nuvem Fria',
  22: 'Nuvem Azul',
  23: 'Nuvem Dourada',
  24: 'Minério Zanite',
  25: 'Minério Gravitite',
  26: 'Minério Ambrosium',
  27: 'Tronco Skyroot',
  28: 'Folhas Skyroot',
  29: 'Carvalho Dourado',
  30: 'Holystone Esculpido',
  31: 'Altar do Sol',
  32: 'Bétula',
  33: 'Folhas de Bétula',
  34: 'Pinheiro',
  35: 'Folhas de Pinheiro',
  36: 'Cerejeira',
  37: 'Tronco da Selva',
  38: 'Folhas da Selva',
  39: 'Cacto',
  40: 'Argila',
  41: 'Ardósia Profunda',
  42: 'Tufo',
  43: 'Espeleotema',
  44: 'Cascalho',
  45: 'Musgo',
  46: 'Líquen Luminoso',
  47: 'Vinha de Caverna',
  48: 'Bagas Luminosas',
  49: 'Micélio',
  50: 'Caule de Cogumelo',
  51: 'Chapéu Verm. Gigante',
  52: 'Chapéu Marrom Gigante',
  53: 'Fungo Ciano',
  54: 'Ametista',
  55: 'Cristal de Ametista',
  56: 'Calcita',
  57: 'Basalto Polido',
  58: 'Grama Alta',
  59: 'Flor Vermelha',
  60: 'Flor Amarela',
  61: 'Cogumelo Verm.',
  62: 'Cogumelo Marrom',
  63: 'Fungo Violeta',
  64: 'Fungo Carmesim',
  65: 'Fungo Distorcido',
  66: 'Cogumelo Ouro',
  67: 'Orelha-de-Pau',
  68: 'Vitória-Régia',
  69: 'Flor de Esporos',
  70: 'Flor da Caverna',
  71: 'Raízes Suspensas',
  72: 'Folha-Gota',
  73: 'Preto Profundo',
  74: 'Asfalto / Solo Escuro',
  75: 'Grafite Urbano',
  76: 'Concreto Escuro',
  77: 'Concreto Estrutural',
  78: 'Concreto Médio',
  79: 'Concreto Claro',
  80: 'Pedra / Pavimento',
  81: 'Mármore Claro',
  82: 'Reboco Alvo',
  83: 'Branco Aparente',
  84: 'Branco Puro',
  85: 'Terracota Escura',
  86: 'Cerâmica Clara',
  87: 'Vermelho Nobre',
  88: 'Cobre / Bronze',
  89: 'Ocre / Areia',
  90: 'Argila Queimada',
  91: 'Dourado / Mostarda',
  92: 'Amarelo Claro',
  93: 'Oliva Escuro',
  94: 'Oliva Médio',
  95: 'Verde Musgo',
  96: 'Verde Oliva Claro',
  97: 'Verde Floresta',
  98: 'Verde Esmeralda',
  99: 'Verde Folhagem',
  100: 'Verde Primavera',
  101: 'Folhagem Natural',
  102: 'Menta / Turquesa',
  103: 'Verde Água',
  104: 'Verde Mar',
  105: 'Ciano Urbano',
  106: 'Azul Celeste',
  107: 'Azul Petróleo',
  108: 'Azul Cobalto',
  109: 'Azul Escuro',
  110: 'Azul Índigo',
  111: 'Azul Céu',
  112: 'Azul Real',
  113: 'Vidro / Água',
  114: 'Violeta Profundo',
  115: 'Púrpura',
  116: 'Lavanda',
  117: 'Lilás Claro',
  118: 'Magenta Escuro',
  119: 'Bordeaux',
  120: 'Rosa Antigo',
  121: 'Carmim',
  122: 'Rosa Claro',
  123: 'Coral Escuro',
  124: 'Coral Claro',
  125: 'Verde Gramado',
  126: 'Vermelho Puro',
  127: 'Verde Copa'
};

const CATEGORIES: Record<string, Set<number>> = {
  urban: new Set([73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127]),
  building: new Set([0, 41, 42, 56, 57, 11, 14, 15, 19, 20, 30, 40, 44, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127]),
  nature: new Set([1, 2, 3, 4, 9, 10, 27, 28, 29, 32, 33, 34, 35, 36, 37, 38, 39, 58, 59, 60, 68, 69, 70, 71, 72, 17, 18, 97, 98, 99, 100, 101, 125, 127]),
  fungi: new Set([53, 63, 64, 65, 66, 61, 62, 67, 49, 50, 51, 52, 45, 46, 47, 48, 69, 70, 71, 72, 43, 54, 55]),
  special: new Set([6, 13, 12, 7, 8, 16, 21, 22, 23, 24, 25, 26, 31, 68])
};

export default class UI {
  private readonly statsEl: HTMLElement | null;
  private readonly chatEl: HTMLElement;
  private readonly inputContainerEl: HTMLElement | null;
  private readonly inputEl: HTMLInputElement;
  private readonly sendBtnEl: HTMLButtonElement | null;
  private readonly closeBtnEl: HTMLButtonElement | null;

  // Inventory Elements
  private readonly invModalEl: HTMLElement | null;
  private readonly invGridEl: HTMLElement | null;
  private readonly invSearchEl: HTMLInputElement | null;
  private readonly invCloseBtnEl: HTMLButtonElement | null;
  private readonly invHotbarPreviewEl: HTMLElement | null;
  private readonly invCategoryBtns: NodeListOf<HTMLButtonElement>;

  // Hotbar state (strictly 9 slots)
  private hotbarSlots: number[] = [74, 77, 80, 81, 84, 101, 125, 126, 113];
  private selectedSlotIndex = 0;
  private currentCategory = 'all';
  private hoveredCatalogBlockId: number | null = null;

  public onCommand?: (command: string, args: string[]) => void;
  public onToggle?: (isOpen: boolean) => void;
  public onToggleInventory?: (isOpen: boolean) => void;
  public onOpenMenu?: () => void;
  public onSelectBlock?: (type: number) => void;
  public onUpdateHotbar?: (types: number[]) => void;

  private chatTimeout: any;

  private isDebugVisible = true;
  private perfGraphContainer: HTMLElement | null = null;
  private perfGraphCanvas: HTMLCanvasElement | null = null;
  private perfGraphCtx: CanvasRenderingContext2D | null = null;
  private perfBadgeEl: HTMLElement | null = null;
  private perfAvgEl: HTMLElement | null = null;
  private perfWorstEl: HTMLElement | null = null;
  private perfFpsEl: HTMLElement | null = null;
  private latencyHistory: number[] = [];
  private readonly maxLatencyPoints = 120;
  private lastTextUpdateTime = 0;
  private measuredProcessMemoryBytes = 0;
  private lastMeasureTime = 0;

  constructor() {
    this.statsEl   = document.querySelector<HTMLElement>('#stats');
    this.initPerformanceHUD();
    this.chatEl    = document.querySelector<HTMLElement>('.chat')!;
    this.inputContainerEl = document.querySelector<HTMLElement>('.chat-input-container');
    this.inputEl   = document.querySelector<HTMLInputElement>('.chat-input')!;
    this.sendBtnEl = document.querySelector<HTMLButtonElement>('#chat-send-btn');
    this.closeBtnEl = document.querySelector<HTMLButtonElement>('#chat-close-btn');

    // Inventory modal queries
    this.invModalEl = document.getElementById('inventory-modal');
    this.invGridEl = document.getElementById('inventory-grid');
    this.invSearchEl = document.getElementById('inventory-search') as HTMLInputElement | null;
    this.invCloseBtnEl = document.getElementById('inventory-close-btn') as HTMLButtonElement | null;
    this.invHotbarPreviewEl = document.getElementById('inventory-hotbar-preview');
    this.invCategoryBtns = document.querySelectorAll<HTMLButtonElement>('.inv-cat-btn');

    this.initChat();
    this.initHotbarHUD();
    this.initInventoryModal();
    this.toggleChat(false);
    this.resetChatTimeout();
  }

  // ─── Hotbar Management ───────────────────────────────────────────────────

  public get currentHotbar(): number[] {
    return [...this.hotbarSlots];
  }

  public get activeSlot(): number {
    return this.selectedSlotIndex;
  }

  public get selectedBlockType(): number {
    return this.hotbarSlots[this.selectedSlotIndex] ?? 2;
  }

  private initHotbarHUD(): void {
    this.renderHotbarHUD();
  }

  public renderHotbarHUD(): void {
    const hotbarEl = document.getElementById('hotbar');
    if (!hotbarEl) return;

    hotbarEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const blockId = this.hotbarSlots[i];
      const slotEl = document.createElement('div');
      slotEl.className = 'hotbar-slot' + (i === this.selectedSlotIndex ? ' selected' : '');
      slotEl.setAttribute('data-slot', i.toString());
      slotEl.setAttribute('data-block', blockId.toString());

      const keyEl = document.createElement('span');
      keyEl.className = 'slot-key';
      keyEl.innerText = (i + 1).toString();
      slotEl.appendChild(keyEl);

      const iconEl = document.createElement('div');
      iconEl.className = 'slot-icon';
      this.applyBlockIconStyle(iconEl, blockId);
      slotEl.appendChild(iconEl);

      const labelEl = document.createElement('span');
      labelEl.className = 'slot-label';
      labelEl.innerText = this.getBlockDisplayName(blockId);
      slotEl.appendChild(labelEl);

      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectHotbarSlot(i);
      });

      hotbarEl.appendChild(slotEl);
    }
  }

  public selectHotbarSlot(index: number): void {
    if (index < 0 || index >= 9) return;
    this.selectedSlotIndex = index;
    const blockType = this.hotbarSlots[index];

    // Atualiza classes selecionadas na HUD
    const hudSlots = document.querySelectorAll('#hotbar .hotbar-slot');
    hudSlots.forEach((slot, i) => {
      if (i === index) slot.classList.add('selected');
      else slot.classList.remove('selected');
    });

    // Atualiza classes na prévia do inventário
    const previewSlots = document.querySelectorAll('#inventory-hotbar-preview .hotbar-slot');
    previewSlots.forEach((slot, i) => {
      if (i === index) slot.classList.add('selected');
      else slot.classList.remove('selected');
    });

    this.onSelectBlock?.(blockType);
  }

  public updateSelectedBlock(type: number): void {
    // Procura o bloco na hotbar
    const idx = this.hotbarSlots.indexOf(type);
    if (idx !== -1) {
      this.selectedSlotIndex = idx;
    } else {
      // Se não estava na hotbar, equipa no slot atual
      this.hotbarSlots[this.selectedSlotIndex] = type;
      this.renderHotbarHUD();
      this.renderInventoryHotbarPreview();
      this.onUpdateHotbar?.(this.hotbarSlots);
    }

    const hudSlots = document.querySelectorAll('#hotbar .hotbar-slot');
    hudSlots.forEach((slot, i) => {
      if (i === this.selectedSlotIndex) slot.classList.add('selected');
      else slot.classList.remove('selected');
    });

    const previewSlots = document.querySelectorAll('#inventory-hotbar-preview .hotbar-slot');
    previewSlots.forEach((slot, i) => {
      if (i === this.selectedSlotIndex) slot.classList.add('selected');
      else slot.classList.remove('selected');
    });
  }

  public setHotbarSlot(slotIdx: number, blockType: number): void {
    if (slotIdx < 0 || slotIdx >= 9) return;
    this.hotbarSlots[slotIdx] = blockType;
    this.selectedSlotIndex = slotIdx;

    this.renderHotbarHUD();
    this.renderInventoryHotbarPreview();

    this.onUpdateHotbar?.(this.hotbarSlots);
    this.onSelectBlock?.(blockType);
  }

  // ─── Inventory Modal ─────────────────────────────────────────────────────

  public get isInventoryOpen(): boolean {
    if (!this.invModalEl) return false;
    return !this.invModalEl.classList.contains('inventory-modal-hidden');
  }

  public toggleInventory(force?: boolean): boolean {
    if (!this.invModalEl) return false;
    const isCurrentlyOpen = this.isInventoryOpen;
    const shouldOpen = force !== undefined ? force : !isCurrentlyOpen;

    if (shouldOpen) {
      this.invModalEl.classList.remove('inventory-modal-hidden');
      this.renderInventoryHotbarPreview();
      this.renderCatalog();
      if (this.invSearchEl) {
        this.invSearchEl.value = '';
        setTimeout(() => this.invSearchEl?.focus(), 50);
      }
      this.onToggleInventory?.(true);
      return true;
    } else {
      this.invModalEl.classList.add('inventory-modal-hidden');
      if (this.invSearchEl) this.invSearchEl.blur();
      this.onToggleInventory?.(false);
      return false;
    }
  }

  private initInventoryModal(): void {
    if (!this.invModalEl) return;

    // Fechar ao clicar no backdrop ou botão de fechar
    const backdrop = this.invModalEl.querySelector('.inventory-backdrop');
    backdrop?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleInventory(false);
    });

    this.invCloseBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleInventory(false);
    });

    // Filtro por categorias
    this.invCategoryBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.invCategoryBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.getAttribute('data-cat') || 'all';
        this.renderCatalog();
      });
    });

    // Busca com debounce
    this.invSearchEl?.addEventListener('input', () => {
      this.renderCatalog();
    });

    // Tecla 1-9 no modal para equipar o bloco focado
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!this.isInventoryOpen) return;
      if (document.activeElement === this.invSearchEl && e.key.length === 1 && !e.ctrlKey) {
        return; // Deixa o usuário digitar no campo de busca
      }

      if (e.key >= '1' && e.key <= '9') {
        const targetSlot = parseInt(e.key, 10) - 1;
        if (this.hoveredCatalogBlockId !== null) {
          e.preventDefault();
          this.setHotbarSlot(targetSlot, this.hoveredCatalogBlockId);
        } else {
          e.preventDefault();
          this.selectHotbarSlot(targetSlot);
        }
      }
    });

    // Inicializa a prévia do catálogo
    this.renderCatalog();
    this.renderInventoryHotbarPreview();
  }

  private renderInventoryHotbarPreview(): void {
    if (!this.invHotbarPreviewEl) return;
    this.invHotbarPreviewEl.innerHTML = '';

    for (let i = 0; i < 9; i++) {
      const blockId = this.hotbarSlots[i];
      const slotEl = document.createElement('div');
      slotEl.className = 'hotbar-slot' + (i === this.selectedSlotIndex ? ' selected' : '');
      slotEl.setAttribute('data-slot', i.toString());
      slotEl.setAttribute('data-block', blockId.toString());
      slotEl.title = `Slot ${i + 1}: ${this.getBlockDisplayName(blockId)}`;

      const numEl = document.createElement('span');
      numEl.className = 'slot-key';
      numEl.innerText = (i + 1).toString();
      slotEl.appendChild(numEl);

      const iconEl = document.createElement('div');
      iconEl.className = 'slot-icon';
      this.applyBlockIconStyle(iconEl, blockId);
      slotEl.appendChild(iconEl);

      const nameEl = document.createElement('span');
      nameEl.className = 'slot-label';
      nameEl.innerText = this.getBlockDisplayName(blockId);
      slotEl.appendChild(nameEl);

      slotEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectHotbarSlot(i);
      });

      this.invHotbarPreviewEl.appendChild(slotEl);
    }
  }

  private renderCatalog(): void {
    const gridEl = this.invGridEl;
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const query = (this.invSearchEl?.value || '').trim().toLowerCase();
    const allBlocks = blockRegistry.getAll();

    // Filtra blocos que devem ser visíveis no inventário criativo
    const visibleBlocks = allBlocks.filter((b) => {
      if (b.id < 0 || b.air) return false;

      // Filtro de categoria
      if (this.currentCategory !== 'all') {
        const catSet = CATEGORIES[this.currentCategory];
        if (!catSet || !catSet.has(b.id)) return false;
      }

      // Filtro de busca por nome ou ID
      if (query !== '') {
        const ptName = (BLOCK_NAMES[b.id] || '').toLowerCase();
        const enName = b.name.toLowerCase();
        const idStr = b.id.toString();
        return ptName.includes(query) || enName.includes(query) || idStr === query;
      }

      return true;
    });

    if (visibleBlocks.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'inv-empty-state';
      emptyEl.innerText = 'Nenhum bloco encontrado para a busca.';
      gridEl.appendChild(emptyEl);
      return;
    }

    visibleBlocks.forEach((block) => {
      const card = document.createElement('div');
      card.className = 'hotbar-slot inv-catalog-slot';
      card.setAttribute('data-id', block.id.toString());
      card.setAttribute('data-block', block.id.toString());
      card.title = `${this.getBlockDisplayName(block.id)} (ID: ${block.id})`;

      const icon = document.createElement('div');
      icon.className = 'slot-icon';
      this.applyBlockIconStyle(icon, block.id);
      card.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'slot-label';
      name.innerText = this.getBlockDisplayName(block.id);
      card.appendChild(name);

      // Hover para atalhos de teclado 1-9
      card.addEventListener('mouseenter', () => {
        this.hoveredCatalogBlockId = block.id;
      });
      card.addEventListener('mouseleave', () => {
        if (this.hoveredCatalogBlockId === block.id) {
          this.hoveredCatalogBlockId = null;
        }
      });

      // Clique equipa no slot selecionado
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setHotbarSlot(this.selectedSlotIndex, block.id);

        // Feedback visual idêntico ao hotbar
        card.classList.add('selected');
        setTimeout(() => card.classList.remove('selected'), 180);
      });

      gridEl.appendChild(card);
    });
  }

  private applyBlockIconStyle(el: HTMLElement, blockId: number): void {
    const block = blockRegistry.get(blockId);
    if (!block) {
      el.style.backgroundColor = '#777777';
      return;
    }

    const hex = '#' + block.color.toString(16).padStart(6, '0');
    el.style.backgroundColor = hex;

    // Se o bloco emite luz, adiciona brilho estético
    if (block.luminance && block.luminance > 0) {
      const glow = Math.min(1.0, block.luminance * 1.2);
      el.style.boxShadow = `0 0 ${Math.round(glow * 10)}px ${hex}dd, inset 0 0 4px #ffffff66`;
    } else {
      el.style.boxShadow = 'inset 0 1px 2px rgba(255,255,255,0.25), inset 0 -1px 3px rgba(0,0,0,0.5)';
    }

    if (block.meshType === 'microvoxel') {
      el.style.borderRadius = '3px';
      el.style.border = '1px solid rgba(255,255,255,0.2)';
    }
  }

  public getBlockDisplayName(blockId: number): string {
    if (BLOCK_NAMES[blockId]) return BLOCK_NAMES[blockId];
    const b = blockRegistry.get(blockId);
    if (b) {
      return b.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return `Bloco ${blockId}`;
  }

  // ─── Chat System ─────────────────────────────────────────────────────────

  public get isChatOpen(): boolean {
    if (this.inputContainerEl) {
      return this.inputContainerEl.classList.contains('active') || this.inputContainerEl.style.display === 'flex';
    }
    return this.inputEl.style.display === 'block';
  }

  private initChat(): void {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.submitCurrentMessage();
      }
      if (e.key === 'Escape') {
        this.toggleChat(false);
      }
    });

    this.sendBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.submitCurrentMessage();
    });

    this.closeBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleChat(false);
    });

    this.inputEl.addEventListener('keydown', (e) => e.stopPropagation());
    this.inputEl.addEventListener('keyup', (e) => e.stopPropagation());
  }

  private submitCurrentMessage(): void {
    const command = this.inputEl.value.trim();
    if (command !== '') {
      this.addChatMessage(command);
      this.handleCommand(command);
    }
    this.inputEl.value = '';
    this.toggleChat(false);
  }

  private resetChatTimeout(): void {
    clearTimeout(this.chatTimeout);
    this.chatEl.classList.remove('hidden');
    this.chatTimeout = setTimeout(() => {
      if (!this.isChatOpen) {
        this.chatEl.classList.add('hidden');
      }
    }, 5000);
  }

  private handleCommand(command: string): void {
    const parts = command.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (cmd === '/menu') {
      this.onOpenMenu?.();
      return;
    }

    if (cmd === '/help') {
      this.addChatMessage('Comandos: /clima [limpo|chuva|tempestade|tornado|areia], /tornado, /sandstorm, /dim [dim], /rift, /kamehameha, /volcano, /star, /planet, /blackhole, /nuke, /raio, /laser, /tp, /time, /shaders [on|off]');
      return;
    }

    this.onCommand?.(cmd, args);
  }

  public addChatMessage(text: string): void {
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    msg.innerText = `- ${text}`;
    this.chatEl.appendChild(msg);
    this.chatEl.scrollTop = this.chatEl.scrollHeight;

    this.resetChatTimeout();
  }

  public toggleChat(force?: boolean): boolean {
    const isCurrentlyVisible = this.isChatOpen;
    const shouldShow = force !== undefined ? force : !isCurrentlyVisible;

    if (shouldShow) {
      if (this.inputContainerEl) {
        this.inputContainerEl.classList.add('active');
        this.inputContainerEl.style.display = 'flex';
      }
      this.inputEl.style.display = 'block';
      if (this.sendBtnEl) this.sendBtnEl.style.display = 'inline-flex';
      if (this.closeBtnEl) this.closeBtnEl.style.display = 'inline-flex';
      this.inputEl.focus();
      this.onToggle?.(true);
      this.resetChatTimeout();
      return true;
    } else {
      if (this.inputContainerEl) {
        this.inputContainerEl.classList.remove('active');
        this.inputContainerEl.style.display = 'none';
      }
      this.inputEl.style.display = 'none';
      if (this.sendBtnEl) this.sendBtnEl.style.display = 'none';
      if (this.closeBtnEl) this.closeBtnEl.style.display = 'none';
      this.inputEl.blur();
      this.onToggle?.(false);
      this.resetChatTimeout();
      return false;
    }
  }

  public toggleDebugOverlay(force?: boolean): boolean {
    this.isDebugVisible = force !== undefined ? force : !this.isDebugVisible;
    const debugEl = document.getElementById('debug');
    if (debugEl) {
      debugEl.classList.toggle('hidden', !this.isDebugVisible);
    }
    if (this.perfGraphContainer) {
      this.perfGraphContainer.classList.toggle('hidden', !this.isDebugVisible);
    }
    return this.isDebugVisible;
  }

  private initPerformanceHUD(): void {
    let graphContainer = document.getElementById('perf-graph-container');
    if (!graphContainer) {
      graphContainer = document.createElement('div');
      graphContainer.id = 'perf-graph-container';
      graphContainer.innerHTML = `
        <div class="perf-graph-header">
          <span class="perf-graph-title">📊 Latência de Quadro</span>
          <span id="perf-graph-badge" class="perf-badge">16.6 ms</span>
        </div>
        <canvas id="perf-graph"></canvas>
        <div class="perf-graph-footer">
          <span id="perf-fps">60 FPS</span>
          <span id="perf-avg">Média: 16.6ms</span>
          <span id="perf-worst">Pico: 16.6ms</span>
        </div>
        <div class="perf-graph-legend">
          <span class="legend-tag"><span class="legend-dot dot-green"></span>&le;16.7ms (60 FPS)</span>
          <span class="legend-tag"><span class="legend-dot dot-amber"></span>&le;33.3ms (30 FPS)</span>
          <span class="legend-tag"><span class="legend-dot dot-red"></span>&gt;33.3ms Pico</span>
        </div>
      `;
      document.body.appendChild(graphContainer);
    }
    this.perfGraphContainer = graphContainer;
    this.perfGraphCanvas = document.getElementById('perf-graph') as HTMLCanvasElement;
    if (this.perfGraphCanvas) {
      this.perfGraphCtx = this.perfGraphCanvas.getContext('2d');
    }
    this.perfBadgeEl = document.getElementById('perf-graph-badge');
    this.perfFpsEl = document.getElementById('perf-fps');
    this.perfAvgEl = document.getElementById('perf-avg');
    this.perfWorstEl = document.getElementById('perf-worst');
  }

  private async measureProcessMemory(): Promise<void> {
    const now = performance.now();
    if (now - this.lastMeasureTime < 6000) return;
    this.lastMeasureTime = now;
    if (typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance) {
      try {
        const res = await (performance as any).measureUserAgentSpecificMemory();
        if (res && typeof res.bytes === 'number' && res.bytes > 0) {
          this.measuredProcessMemoryBytes = res.bytes;
        }
      } catch {
        // Fallback to calculation
      }
    }
  }

  public update(stats: UIStats): void {
    if (!stats) return;

    const latency = stats.frameTimeMs > 0 ? stats.frameTimeMs : 16.6;
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxLatencyPoints) {
      this.latencyHistory.shift();
    }

    if (!this.isDebugVisible) return;

    this.renderLatencyGraph(stats);

    const now = performance.now();
    if (now - this.lastTextUpdateTime < 80) return;
    this.lastTextUpdateTime = now;

    this.measureProcessMemory();
    this.renderStatsText(stats);
  }

  private renderLatencyGraph(stats: UIStats): void {
    if (!this.perfGraphCanvas || !this.perfGraphCtx) return;

    const canvas = this.perfGraphCanvas;
    const ctx = this.perfGraphCtx;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 290;
    const cssHeight = canvas.clientHeight || 90;

    const targetWidth = Math.floor(cssWidth * dpr);
    const targetHeight = Math.floor(cssHeight * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const history = this.latencyHistory;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < history.length; i++) {
      const v = history[i];
      sum += v;
      if (v > max) max = v;
    }
    const avg = history.length > 0 ? sum / history.length : stats.frameTimeMs;
    const current = history[history.length - 1] ?? stats.frameTimeMs;
    const worst = stats.worstFrameMs ?? max;

    const maxScaleMs = Math.max(38, Math.ceil(max * 1.15));

    const y30 = cssHeight - (33.33 / maxScaleMs) * cssHeight;
    if (y30 >= 0 && y30 <= cssHeight) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y30);
      ctx.lineTo(cssWidth, y30);
      ctx.stroke();

      ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.font = '9px Consolas, monospace';
      ctx.fillText('33.3ms (30 FPS)', 4, y30 - 2);
    }

    const y60 = cssHeight - (16.67 / maxScaleMs) * cssHeight;
    if (y60 >= 0 && y60 <= cssHeight) {
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y60);
      ctx.lineTo(cssWidth, y60);
      ctx.stroke();

      ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
      ctx.font = '9px Consolas, monospace';
      ctx.fillText('16.7ms (60 FPS)', 4, y60 - 2);
    }

    ctx.setLineDash([]);

    const barWidth = cssWidth / this.maxLatencyPoints;
    const offset = this.maxLatencyPoints - history.length;

    for (let i = 0; i < history.length; i++) {
      const val = history[i];
      const barH = Math.min(cssHeight, Math.max(2, (val / maxScaleMs) * cssHeight));
      const x = (offset + i) * barWidth;
      const y = cssHeight - barH;

      if (val <= 16.7) {
        ctx.fillStyle = '#4ade80';
      } else if (val <= 33.3) {
        ctx.fillStyle = '#fbbf24';
      } else {
        ctx.fillStyle = '#f87171';
      }
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }

    if (history.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const val = history[i];
        const x = (offset + i) * barWidth + barWidth / 2;
        const y = cssHeight - (val / maxScaleMs) * cssHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    if (this.perfBadgeEl) {
      this.perfBadgeEl.innerText = `${current.toFixed(1)} ms`;
      this.perfBadgeEl.className = 'perf-badge' + (current > 33.3 ? ' red' : current > 16.7 ? ' amber' : '');
    }
    if (this.perfFpsEl) {
      this.perfFpsEl.innerText = `${stats.fps} FPS`;
    }
    if (this.perfAvgEl) {
      this.perfAvgEl.innerText = `Média: ${avg.toFixed(1)}ms`;
    }
    if (this.perfWorstEl) {
      this.perfWorstEl.innerText = `Pico: ${worst.toFixed(1)}ms`;
    }
  }

  private renderStatsText(stats: UIStats): void {
    if (!this.statsEl) return;

    // Cores
    const cores = stats.cores || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4;
    const coresStr = `${cores} núcleos`;

    // GPU & VRAM
    const isBraveShielded = (stats.gpuRenderer || '').toLowerCase().includes('brave');
    const gpuRenderer = isBraveShielded
      ? 'Brave Shields (GPU Mascarada)'
      : (stats.gpuRenderer || 'WebGL Graphics');
    const gpuVramLabel = stats.gpuTotalVram ? ` (${stats.gpuTotalVram})` : '';
    const gpuDisplayName = isBraveShielded
      ? `${gpuRenderer} <span class="stat-subhint">(Shields ativo — desligue no localhost para ver a RX 9060 XT)</span>`
      : `${gpuRenderer}${gpuVramLabel}`;
    const vramStr = `${stats.gpuMemoryMB ? stats.gpuMemoryMB.toFixed(1) : '0.0'} MB (alocada)`;

    // Process RAM calculation
    const mainMem = (performance as any)?.memory;
    const mainUsedMB = mainMem ? Math.round((mainMem.usedJSHeapSize / 1048576) * 10) / 10 : 25;
    const mainTotalMB = mainMem ? Math.round((mainMem.totalJSHeapSize / 1048576) * 10) / 10 : 35;

    const chunkWorkersCount = stats.workers?.total ?? 11;
    const totalWorkers = chunkWorkersCount + 1; // +1 Engine Worker
    const workersFootprintMB = Math.round(chunkWorkersCount * 28 + 35);
    const voxelRamMB = stats.voxelRamMB ?? 60;
    const glBackingMB = Math.round((stats.gpuMemoryMB || 50) * 0.4);

    let totalProcessMB = 0;
    if (this.measuredProcessMemoryBytes > 0) {
      totalProcessMB = Math.round((this.measuredProcessMemoryBytes / (1024 * 1024)) * 10) / 10;
    } else {
      totalProcessMB = Math.round(mainUsedMB + workersFootprintMB + voxelRamMB + glBackingMB);
    }

    // Workers Status
    const w = stats.workers;
    const workersStr = w
      ? `${w.total + 1} threads (1 Engine + ${w.total} Chunks: ${w.busy} ocupados, ${w.idle} livres${w.queued > 0 ? `, ${w.queued} fila` : ''})`
      : '1 Engine Worker';

    // Player position and direction
    const x = stats.x.toFixed(2);
    const y = stats.y.toFixed(2);
    const z = stats.z.toFixed(2);
    const chunkStr = `[${stats.chunkX ?? 0}, ${stats.chunkY ?? 0}, ${stats.chunkZ ?? 0}]`;
    const yawDeg = stats.yaw !== undefined ? ((((stats.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(1)) : '0.0';
    const pitchDeg = stats.pitch !== undefined ? (((stats.pitch * 180 / Math.PI)).toFixed(1)) : '0.0';
    const facingStr = `${stats.facing ?? 'Norte'} (Yaw: ${yawDeg}° / Pitch: ${pitchDeg}°)`;

    // Performance
    const fps = stats.fps;
    const frameMs = stats.frameTimeMs.toFixed(1);
    const renderMs = stats.renderTimeMs.toFixed(1);
    const worstMs = (stats.worstFrameMs || stats.frameTimeMs).toFixed(1);

    // World & Render
    const dimension = stats.dimension || 'Padrão';
    const chunks = `${stats.loadedChunks || 0} carregados`;
    const renderCalls = `${stats.calls} chamadas / ${stats.triangles.toLocaleString('pt-BR')} triângulos`;
    const memory = `${stats.geometries} geometrias / ${stats.textures} texturas`;

    this.statsEl.innerHTML = `
      <div class="stat-section">
        <div class="stat-section-title">⚡ SISTEMA &amp; HARDWARE</div>
        <div class="stat-row"><span class="stat-label">CPU:</span> <span class="stat-value">${coresStr}</span></div>
        <div class="stat-row"><span class="stat-label">GPU:</span> <span class="stat-value">${gpuDisplayName}</span></div>
        <div class="stat-row"><span class="stat-label">VRAM em Uso:</span> <span class="stat-value">${vramStr}</span></div>
        <div class="stat-row"><span class="stat-label">RAM da Aba (Processo):</span> <span class="stat-value highlight-fps">~${totalProcessMB} MB (Task Manager)</span></div>
        <div class="stat-row"><span class="stat-label">├ Workers (${totalWorkers}x threads):</span> <span class="stat-value">~${workersFootprintMB} MB</span></div>
        <div class="stat-row"><span class="stat-label">├ Voxels &amp; Terreno (RAM):</span> <span class="stat-value">~${voxelRamMB} MB</span></div>
        <div class="stat-row"><span class="stat-label">└ Heap JS (Interface):</span> <span class="stat-value">${mainUsedMB} MB (${mainTotalMB} MB alocado)</span></div>
        <div class="stat-row"><span class="stat-label">Workers:</span> <span class="stat-value">${workersStr}</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">⏱️ DESEMPENHO (F3)</div>
        <div class="stat-row"><span class="stat-label">FPS:</span> <span class="stat-value highlight-fps">${fps} FPS (${frameMs} ms)</span></div>
        <div class="stat-row"><span class="stat-label">Desenho (Render):</span> <span class="stat-value">${renderMs} ms</span></div>
        <div class="stat-row"><span class="stat-label">Pior Quadro (Spike):</span> <span class="stat-value">${worstMs} ms</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">📍 JOGADOR</div>
        <div class="stat-row"><span class="stat-label">Posição:</span> <span class="stat-value">X: ${x} Y: ${y} Z: ${z}</span></div>
        <div class="stat-row"><span class="stat-label">Chunk:</span> <span class="stat-value">${chunkStr}</span></div>
        <div class="stat-row"><span class="stat-label">Olhar:</span> <span class="stat-value">${facingStr}</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">🌍 MUNDO &amp; RENDER</div>
        <div class="stat-row"><span class="stat-label">Dimensão:</span> <span class="stat-value">${dimension} (${chunks})</span></div>
        <div class="stat-row"><span class="stat-label">Cena:</span> <span class="stat-value">${renderCalls}</span></div>
        <div class="stat-row"><span class="stat-label">Buffers:</span> <span class="stat-value">${memory}</span></div>
      </div>
    `;
  }
}
