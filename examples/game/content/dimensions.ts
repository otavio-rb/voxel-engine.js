import { dimensionRegistry } from '@voxel/engine/worker';

export function registerDimensions(): void {
  // ── 1. Overworld (Standard surface dimension) ──────────────────────────
  dimensionRegistry.register({
    id: 'overworld',
    name: 'Overworld (Superfície)',
    description: 'Mundo primordial com montanhas, florestas, oceanos e ciclo dia/noite.',
    generatorId: 'standard',
    coordinateScale: 1.0,
    defaultSpawnY: 42,
    portalColor: 0x4488ff,
    physics: {
      gravity: 0.008,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'skybox',
      daySkyColor: 0x87ceeb,
      nightSkyColor: 0x050510,
      horizonColor: 0xffa07a,
      ambientDayColor: 0x87ceeb,
      ambientNightColor: 0x0c0c20,
      fogNear: 128.0,
      fogFar: 256.0,
      hasDayNightCycle: true,
      hasClouds: true,
      cloudColor: 0xffffff,
      sunScale: 1.5,
      hasSun: true,
      hasMoon: true,
      starsVisible: 0.0,
      ambientIntensity: 0.7
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: true
    }
  });

  // ── 2. The Nether (Subterranean Hellscape) ──────────────────────────────
  dimensionRegistry.register({
    id: 'nether',
    name: 'O Nether (Submundo)',
    description: 'Dimensão subterrânea cavernosa com oceanos de lava, teto de rocha e fumaça carmesim.',
    generatorId: 'nether',
    coordinateScale: 8.0, // 1 bloco no Nether = 8 blocos na Overworld
    defaultSpawnY: 34,
    portalColor: 0x9c27b0,
    physics: {
      gravity: 0.008,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'hell',
      daySkyColor: 0x330808,
      nightSkyColor: 0x220404,
      horizonColor: 0xaa2211,
      ambientDayColor: 0x551100,
      ambientNightColor: 0x440c00,
      fogColor: 0x220505,
      fogNear: 32.0,
      fogFar: 140.0,
      hasDayNightCycle: false,
      hasClouds: false,
      hasSun: false,
      hasMoon: false,
      starsVisible: 0.0,
      ambientIntensity: 0.65,
      hasSkyLight: false, // submundo fechado: sem sol, só lava e brilho ambiente
      minLight: 0.28
    },
    celestial: {
      allowStars: false,
      allowPlanets: false,
      allowBlackHoles: true
    }
  });

  // ── 3. Lunar Surface (The Moon) ─────────────────────────────────────────
  dimensionRegistry.register({
    id: 'lunar',
    name: 'Superfície Lunar (Lua)',
    description: 'Paisagem lunar pontilhada por crateras de impacto, céu negro pontilhado de estrelas e baixa gravidade.',
    generatorId: 'lunar',
    coordinateScale: 1.0,
    defaultSpawnY: 38,
    portalColor: 0x88ccff,
    physics: {
      gravity: 0.0022, // ~1/4 da gravidade terrestre - saltos lunares altos e flutuantes!
      friction: 0.94,
      jumpForce: 0.18
    },
    atmosphere: {
      skyType: 'space',
      daySkyColor: 0x000000,
      nightSkyColor: 0x000000,
      horizonColor: 0x080812,
      ambientDayColor: 0x333344,
      ambientNightColor: 0x222233,
      fogNear: 160.0,
      fogFar: 320.0,
      hasDayNightCycle: true,
      hasClouds: false,
      hasSun: true,
      hasMoon: false,
      starsVisible: 1.0, // Estrelas sempre brilhantes mesmo sob luz solar
      sunScale: 1.2,
      ambientIntensity: 0.65,
      alwaysLit: true
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: true
    }
  });

  // ── 4. Mercury (Scorched World) ─────────────────────────────────────────
  dimensionRegistry.register({
    id: 'mercury',
    name: 'Mercúrio (Planeta Escaldante)',
    description: 'Mundo hiperaquecido com bacias de lava, atmosfera alaranjada e sol gigante incandescente.',
    generatorId: 'mercury',
    coordinateScale: 1.0,
    defaultSpawnY: 36,
    portalColor: 0xff5500,
    physics: {
      gravity: 0.0055,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'hell',
      daySkyColor: 0x442211,
      nightSkyColor: 0x111122,
      horizonColor: 0xaa4422,
      ambientDayColor: 0x663311,
      ambientNightColor: 0x221111,
      fogColor: 0x331505,
      fogNear: 40.0,
      fogFar: 180.0,
      hasDayNightCycle: true,
      hasClouds: true,
      cloudColor: 0xaa8844,
      hasSun: true,
      hasMoon: false,
      sunScale: 8.0, // Sol colossal no horizonte
      starsVisible: 0.4,
      ambientIntensity: 0.7,
      alwaysLit: true,
      underwaterFogColor: 0x330500 // Lava submersa em vez de água
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: true
    }
  });

  // ── 5. Volcanic Biome / World ───────────────────────────────────────────
  dimensionRegistry.register({
    id: 'volcanic',
    name: 'Terras Vulcânicas',
    description: 'Caldeiras ativas, rios de lava fervente, colunas de basalto e névoa densa de cinzas.',
    generatorId: 'volcanic',
    coordinateScale: 1.0,
    defaultSpawnY: 40,
    portalColor: 0xff2200,
    physics: {
      gravity: 0.008,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'hell',
      daySkyColor: 0x331c15,
      nightSkyColor: 0x180b08,
      horizonColor: 0xcc4411,
      ambientDayColor: 0x552211,
      ambientNightColor: 0x331100,
      fogColor: 0x28120c,
      fogNear: 48.0,
      fogFar: 180.0,
      hasDayNightCycle: true,
      hasClouds: true,
      cloudColor: 0x554440,
      hasSun: true,
      hasMoon: true,
      sunScale: 1.8,
      starsVisible: 0.2,
      ambientIntensity: 0.65
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: true
    }
  });

  // ── 6. Astral Void (Deep Space Floating Islands) ────────────────────────
  dimensionRegistry.register({
    id: 'astral_void',
    name: 'Vácuo Astral (Ilhas Celestiais)',
    description: 'Ilhas cósmicas flutuando num abismo estelar infinito com microgravidade e cristais estelares.',
    generatorId: 'astral_void',
    coordinateScale: 1.0,
    defaultSpawnY: 55,
    portalColor: 0xaa00ff,
    physics: {
      gravity: 0.0016, // Microgravidade / flutuabilidade cósmica!
      friction: 0.96,
      jumpForce: 0.20
    },
    atmosphere: {
      skyType: 'void',
      daySkyColor: 0x0c051a,
      nightSkyColor: 0x05020c,
      horizonColor: 0x4a148c,
      ambientDayColor: 0x4a236e,
      ambientNightColor: 0x2a1040,
      fogColor: 0x0a0518,
      fogNear: 180.0,
      fogFar: 360.0,
      hasDayNightCycle: false,
      hasClouds: false,
      hasSun: false,
      hasMoon: false,
      starsVisible: 1.0,
      ambientIntensity: 0.75
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: true
    }
  });

  // ── 7. Cavern (Deep Underground Domain) ─────────────────────────────────
  dimensionRegistry.register({
    id: 'cavern',
    name: 'Profundezas Cavernosas',
    description: 'Labirinto sem fim de grutas rochosas fechadas e veios minerais subterrâneos.',
    generatorId: 'cavern',
    coordinateScale: 1.0,
    defaultSpawnY: 28,
    portalColor: 0x455a64,
    physics: {
      gravity: 0.008,
      friction: 0.9,
      jumpForce: 0.16
    },
    atmosphere: {
      skyType: 'subterranean',
      daySkyColor: 0x08080c,
      nightSkyColor: 0x040408,
      horizonColor: 0x101018,
      ambientDayColor: 0x22222a,
      ambientNightColor: 0x181820,
      fogColor: 0x08080c,
      fogNear: 24.0,
      fogFar: 96.0,
      hasDayNightCycle: false,
      hasClouds: false,
      hasSun: false,
      hasMoon: false,
      starsVisible: 0.0,
      ambientIntensity: 0.5
    },
    celestial: {
      allowStars: false,
      allowPlanets: false,
      allowBlackHoles: false
    }
  });

  // ── 8. The Aether (Portal do Céu / Celestial Sky Realm) ─────────────────
  dimensionRegistry.register({
    id: 'aether',
    name: 'The Aether (Portal do Céu)',
    description: 'O reino celestial oposto ao Nether: ilhas celestiais flutuantes, nuvens aercloud, minérios de gravidade e santuários dourados.',
    generatorId: 'aether',
    coordinateScale: 1.0,
    defaultSpawnY: 88,
    portalColor: 0xffd700, // Fenda dourada e etérea reluzente
    physics: {
      gravity: 0.0052, // Gravidade celestial suave e flutuante
      friction: 0.92,
      jumpForce: 0.17
    },
    atmosphere: {
      skyType: 'skybox',
      daySkyColor: 0x81d4fa,
      nightSkyColor: 0x4fc3f7,
      horizonColor: 0xffecb3,
      ambientDayColor: 0xfff9c4,
      ambientNightColor: 0xb3e5fc,
      fogColor: 0xb3e5fc,
      fogNear: 140.0,
      fogFar: 380.0,
      hasDayNightCycle: false, // Luz solar celestial perpétua
      hasClouds: true,
      cloudColor: 0xffffff,
      hasSun: true,
      hasMoon: false,
      sunScale: 3.5, // Sol celestial dourado e benevolente
      starsVisible: 0.2,
      ambientIntensity: 0.9
    },
    celestial: {
      allowStars: true,
      allowPlanets: true,
      allowBlackHoles: false // O Céu é protegido de forças destrutivas
    }
  });
}
