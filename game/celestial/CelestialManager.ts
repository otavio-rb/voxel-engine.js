import {
  Scene,
  Vector3,
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  AdditiveBlending
} from 'three';
import { Star, StarOptions } from './Star';
import { Planet, PlanetOptions } from './Planet';
import { PlasmaStream } from './PlasmaStream';
import { BlackHole } from '../effects/BlackHole';
import { BlackHoleManager } from '../effects/BlackHoleManager';

interface PrimaryAttractor {
  position: Vector3;
  mass: number;
  radius: number;
  velocity: Vector3;
  name: string;
}

export class CelestialManager {
  private stars: Set<Star> = new Set();
  private planets: Set<Planet> = new Set();
  private plasmaStreams: Map<string, PlasmaStream> = new Map();
  private readonly scene: Scene;

  public onChatMessage?: (text: string) => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public spawnStar(options: StarOptions, blackHoles?: BlackHole[]): Star {
    const star = new Star(options);

    // Se já existem buracos negros ativos próximos, aplica um momento angular orbital de Kepler
    if (blackHoles && blackHoles.length > 0) {
      let nearestHole: BlackHole | null = null;
      let minDistance = Infinity;

      for (const hole of blackHoles) {
        if (hole.isDisposed || hole.isImploding) continue;
        const d = star.position.distanceTo(hole.position);
        if (d < minDistance) {
          minDistance = d;
          nearestHole = hole;
        }
      }

      if (nearestHole && minDistance > 5.0 && minDistance < nearestHole.influenceRadius * 2.0) {
        const toHole = new Vector3().subVectors(nearestHole.position, star.position);
        const dir = toHole.clone().normalize();
        const diskNormal = new Vector3(0, 1, 0);
        let tangent = new Vector3().crossVectors(dir, diskNormal).normalize();
        if (tangent.lengthSq() < 0.001) tangent.set(0, 0, 1);

        // Velocidade orbital circular estável de Kepler v = sqrt(G * M / r)
        const G = 32.0;
        const vOrb = Math.sqrt((G * nearestHole.mass) / Math.max(12.0, minDistance));
        star.velocity.copy(nearestHole.velocity).add(tangent.multiplyScalar(vOrb));
      }
    } else if (this.stars.size > 0) {
      // Se já existe outra estrela, coloca em órbita mútua (sistema binário estável)
      const existingStar = Array.from(this.stars)[0];
      if (!existingStar.isDisposed) {
        const toOther = new Vector3().subVectors(existingStar.position, star.position);
        const dist = toOther.length();
        if (dist > 8.0) {
          const dir = toOther.clone().normalize();
          const normal = new Vector3(0, 1, 0);
          let tangent = new Vector3().crossVectors(dir, normal).normalize();
          if (tangent.lengthSq() < 0.001) tangent.set(0, 0, 1);

          const G = 32.0;
          const totalMass = star.mass + existingStar.mass;
          const vBinary = Math.sqrt((G * totalMass) / dist);

          star.velocity.add(tangent.clone().multiplyScalar(vBinary * 0.5));
          existingStar.velocity.add(tangent.clone().multiplyScalar(-vBinary * 0.5));
        }
      }
    }

    this.stars.add(star);
    this.scene.add(star);

    const posStr = `[${Math.round(star.position.x)}, ${Math.round(star.position.y)}, ${Math.round(star.position.z)}]`;
    this.onChatMessage?.(
      `⭐ Estrela (${star.starType.toUpperCase()}) criada em ${posStr} | Raio: ${star.radius.toFixed(1)} | Massa: ${Math.round(star.mass)}`
    );

    return star;
  }

  public spawnPlanet(
    options: PlanetOptions,
    targetStar?: Star,
    blackHoles?: BlackHole[]
  ): Planet {
    const planet = new Planet(options);

    // 1. Identifica o corpo primário de atração (Estrela ou Buraco Negro)
    let primary: PrimaryAttractor | null = null;

    if (targetStar && !targetStar.isDisposed) {
      primary = {
        position: targetStar.position,
        mass: targetStar.mass,
        radius: targetStar.radius,
        velocity: targetStar.velocity,
        name: `Estrela ${targetStar.starType.toUpperCase()}`
      };
    } else {
      // Procura a estrela ativa mais próxima
      let nearestStar: Star | null = null;
      let minStarDist = Infinity;
      for (const s of this.stars) {
        if (s.isDisposed) continue;
        const d = s.position.distanceTo(options.position);
        if (d < minStarDist) {
          minStarDist = d;
          nearestStar = s;
        }
      }

      if (nearestStar) {
        primary = {
          position: nearestStar.position,
          mass: nearestStar.mass,
          radius: nearestStar.radius,
          velocity: nearestStar.velocity,
          name: `Estrela ${nearestStar.starType.toUpperCase()}`
        };
      } else if (blackHoles && blackHoles.length > 0) {
        // Se não há estrela, procura o buraco negro mais próximo
        let nearestHole: BlackHole | null = null;
        let minHoleDist = Infinity;
        for (const h of blackHoles) {
          if (h.isDisposed || h.isImploding) continue;
          const d = h.position.distanceTo(options.position);
          if (d < minHoleDist) {
            minHoleDist = d;
            nearestHole = h;
          }
        }
        if (nearestHole) {
          primary = {
            position: nearestHole.position,
            mass: nearestHole.mass,
            radius: nearestHole.coreRadius,
            velocity: nearestHole.velocity,
            name: 'Buraco Negro'
          };
        }
      }
    }

    // Se NÃO existe nenhum corpo celeste primário, gera uma estrela solar central automaticamente!
    if (!primary) {
      const starPos = options.position.clone().add(new Vector3(0, 8, 0));
      const autoStar = this.spawnStar({
        position: starPos,
        type: 'sol',
        radius: 4.5
      }, blackHoles);

      primary = {
        position: autoStar.position,
        mass: autoStar.mass,
        radius: autoStar.radius,
        velocity: autoStar.velocity,
        name: 'Estrela Solar'
      };

      this.onChatMessage?.(
        '⭐ Nenhuma estrela foi encontrada! Uma estrela solar foi gerada como centro orbital.'
      );
    }

    // 2. Determinar raio orbital seguro e faixa de órbita (planetary lane)
    const existingPlanets = Array.from(this.planets).filter(
      (p) => !p.isDisposed && p.position.distanceTo(primary!.position) < 180
    );
    const laneIndex = existingPlanets.length;
    // Distância mínima segura: pelo menos 3x o raio da estrela + folga para nunca sobrepor
    const minSafeDist = primary.radius * 3.2 + planet.radius + 8.0;
    const laneDist = minSafeDist + laneIndex * 14.0;

    // Vetor radial da estrela até o ponto de spawn solicitado
    let radial = new Vector3().subVectors(options.position, primary.position);
    if (radial.lengthSq() < 1.0) {
      radial.set(1, 0, 0);
    }
    // Planariza levemente em relação ao plano horizontal da órbita
    radial.y *= 0.15;
    radial.normalize();

    // Posiciona o planeta no raio orbital exato
    planet.position.copy(primary.position).addScaledVector(radial, laneDist);

    // 3. Velocidade orbital circular kepleriana exata
    const G = 32.0;
    const softening = 1.0;
    // v = sqrt( (G * M * r) / (r^2 + eps^2) )
    const vCirc = Math.sqrt((G * primary.mass * laneDist) / (laneDist * laneDist + softening * softening));

    // Normal do plano orbital (horizontal com inclinação sutil realista de ~3 graus por planeta)
    const planeNormal = new Vector3(0, 1, 0);
    const tiltAxis = new Vector3(-radial.z, 0, radial.x).normalize();
    if (tiltAxis.lengthSq() > 0.001) {
      const tilt = ((laneIndex * 137.5) % 8 - 4) * (Math.PI / 180);
      planeNormal.applyAxisAngle(tiltAxis, tilt);
    }

    // Vetor tangente perpendicular no plano da órbita
    let tangent = new Vector3().crossVectors(planeNormal, radial).normalize();
    if (tangent.lengthSq() < 0.001) tangent.set(0, 0, 1);

    // Atribui velocidade: velocidade do corpo primário + velocidade orbital tangencial
    planet.velocity.copy(primary.velocity).addScaledVector(tangent, vCirc);

    // 4. Criação de linha visual sutil de órbita (órbita cósmica iluminada)
    const orbitPoints: number[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const pt = new Vector3(Math.cos(angle) * laneDist, 0, Math.sin(angle) * laneDist);
      if (tiltAxis.lengthSq() > 0.001) {
        const tilt = ((laneIndex * 137.5) % 8 - 4) * (Math.PI / 180);
        pt.applyAxisAngle(tiltAxis, tilt);
      }
      orbitPoints.push(pt.x, pt.y, pt.z);
    }

    const orbitGeo = new BufferGeometry();
    orbitGeo.setAttribute('position', new Float32BufferAttribute(orbitPoints, 3));
    const orbitMat = new LineBasicMaterial({
      color: 0x5599ee,
      transparent: true,
      opacity: 0.22,
      blending: AdditiveBlending
    });
    const orbitLine = new LineLoop(orbitGeo, orbitMat);
    orbitLine.position.copy(primary.position);
    this.scene.add(orbitLine);
    planet.orbitLine = orbitLine as any;

    this.planets.add(planet);
    this.scene.add(planet);

    this.onChatMessage?.(
      `🪐 Planeta (${planet.planetType}) entrou em órbita de ${primary.name}! Raio: ${laneDist.toFixed(1)} blocos | Vel: ${vCirc.toFixed(1)} m/s`
    );

    return planet;
  }

  public update(delta: number, blackHoleManager?: BlackHoleManager): void {
    const dtSeconds = delta / 1000;
    const G = 32.0;
    const softening = 1.0;

    const activeHoles = blackHoleManager ? blackHoleManager.getBlackHoles().filter((h) => !h.isDisposed && !h.isImploding) : [];
    const activeStars = Array.from(this.stars).filter((s) => !s.isDisposed);
    const activePlanets = Array.from(this.planets).filter((p) => !p.isDisposed);

    // Sub-stepping para integração orbital ultra-estável (Symplectic Euler em 4 sub-passos)
    const subSteps = 4;
    const subDt = dtSeconds / subSteps;

    for (let step = 0; step < subSteps; step++) {
      // ── 1. Estrelas ───────────────────────────────────────────────────────
      for (const star of activeStars) {
        if (star.isDisposed) continue;
        // Atração por buracos negros (se houver)
        for (const hole of activeHoles) {
          if (hole.isDisposed) continue;
          const dist = star.position.distanceTo(hole.position);

          // Absorção direta caso mergulhe no horizonte de eventos
          if (dist <= hole.coreRadius * 1.25) {
            const starColors = star.getColors();
            hole.absorbStarColors(starColors, true);
            hole.spawnGravitationalWaveRing(starColors.corona);
            hole.mass += star.mass * 0.8;
            star.dispose();
            this.stars.delete(star);
            this.onChatMessage?.(
              `💥 A estrela foi tragada pelo horizonte de eventos! Os anéis de poeira do buraco negro absorveram sua cor!`
            );
            break;
          }

          const accel = star.getGravitationalAcceleration(hole.position, hole.mass, G, softening);
          star.velocity.addScaledVector(accel, subDt);

          // O buraco negro também é acelerado pela estrela
          const holeDir = new Vector3().subVectors(star.position, hole.position);
          const holeDist = holeDir.length();
          if (holeDist > 0.1) {
            holeDir.divideScalar(holeDist);
            const holeForce = (G * star.mass) / Math.max(30.0, holeDist * holeDist);
            hole.velocity.addScaledVector(holeDir, holeForce * subDt);
          }
        }

        // Atração mútua entre estrelas (sistemas binários / ternários)
        for (const otherStar of activeStars) {
          if (star === otherStar) continue;
          const accel = star.getGravitationalAcceleration(otherStar.position, otherStar.mass, G, softening);
          star.velocity.addScaledVector(accel, subDt);
        }

        // Atualização de posição da estrela
        star.position.addScaledVector(star.velocity, subDt);
      }

      // ── 2. Planetas (gravitação exata sob estrelas e buracos negros) ───────
      for (const planet of activePlanets) {
        if (planet.isDisposed) continue;

        // Gravidade de todas as estrelas
        for (const star of activeStars) {
          if (star.isDisposed) continue;
          const dist = planet.position.distanceTo(star.position);

          // Colisão com a estrela: se entrar na fotosfera, queima
          if (dist <= star.radius * 0.95) {
            this.onChatMessage?.(`💥 O planeta (${planet.planetType}) mergulhou na fotosfera estelar e foi incinerado!`);
            planet.dispose();
            this.planets.delete(planet);
            break;
          }

          const accel = planet.getGravitationalAcceleration(star.position, star.mass, G, softening);
          planet.velocity.addScaledVector(accel, subDt);
        }

        if (planet.isDisposed) continue;

        // Gravidade de buracos negros
        for (const hole of activeHoles) {
          if (hole.isDisposed) continue;
          const dist = planet.position.distanceTo(hole.position);

          // Horizonte de eventos: espaguetificação do planeta
          if (dist <= hole.coreRadius * 1.15) {
            this.onChatMessage?.(`🌀 O planeta (${planet.planetType}) cruzou o horizonte de eventos e foi espaguetificado pelo buraco negro!`);
            planet.dispose();
            this.planets.delete(planet);
            break;
          }

          const accel = planet.getGravitationalAcceleration(hole.position, hole.mass, G, softening);
          planet.velocity.addScaledVector(accel, subDt);
        }

        if (planet.isDisposed) continue;

        // Atualização de posição com a nova velocidade (Symplectic Euler)
        planet.position.addScaledVector(planet.velocity, subDt);
      }
    }

    // ── 3. Atualizar posições dos anéis de órbita caso a estrela se mova ────
    for (const planet of activePlanets) {
      if (!planet.isDisposed && planet.orbitLine && activeStars.length > 0) {
        // Encontra a estrela mais próxima e sincroniza o anel de órbita
        let nearestStar: Star | null = null;
        let minD = Infinity;
        for (const s of activeStars) {
          const d = s.position.distanceTo(planet.position);
          if (d < minD) {
            minD = d;
            nearestStar = s;
          }
        }
        if (nearestStar && minD < 160) {
          planet.orbitLine.position.copy(nearestStar.position);
        }
      }
    }

    // ── 4. Atualizar Rotações e Shaders dos Corpos Celestes ─────────────────
    for (const star of activeStars) {
      if (!star.isDisposed) star.update(delta);
    }

    for (const planet of activePlanets) {
      if (!planet.isDisposed) planet.update(delta);
    }

    // ── 5. Canibalismo Estelar: Riacho de Plasma (Tidal Disruption Event) ────
    const activeStreamKeys = new Set<string>();

    for (const star of activeStars) {
      let isNearAnyHole = false;

      for (let hIdx = 0; hIdx < activeHoles.length; hIdx++) {
        const hole = activeHoles[hIdx];
        const dist = star.position.distanceTo(hole.position);

        // Raio de Maré de Roche: quando a gravidade diferencial do buraco negro rompe a estrela
        const rocheLimit = (hole.coreRadius * 4.2 + star.radius * 2.8);

        if (dist <= rocheLimit && !star.isDisposed) {
          isNearAnyHole = true;
          const streamKey = `${star.id}-${hIdx}`;
          activeStreamKeys.add(streamKey);

          // Vetor apontando da estrela para o buraco negro
          const dir = new Vector3().subVectors(hole.position, star.position).normalize();
          const tidalFactor = Math.max(0, 1.0 - (dist / rocheLimit));

          // Alongamento elipsoidal de maré na estrela
          star.setTidalStretch(dir, tidalFactor * 1.5);

          // Conecta o riacho de plasma se ainda não existir
          let stream = this.plasmaStreams.get(streamKey);
          if (!stream) {
            stream = new PlasmaStream(star, hole);
            this.plasmaStreams.set(streamKey, stream);
            this.scene.add(stream);

            this.onChatMessage?.(
              `⚡ RUPTURA DE MARÉ! A gravidade do buraco negro rompeu a superfície estelar, formando um riacho contínuo de plasma cósmico!`
            );
          }

          // O buraco negro canibaliza a estrela, drenando massa e crescendo
          const drainRate = (12.0 + tidalFactor * 24.0) * dtSeconds;
          const isDestroyed = star.drainMass(drainRate);

          // O buraco negro ganha massa e o disco de acreção/anéis de poeira absorvem gradualmente a cor da estrela
          hole.mass += drainRate * 0.7;
          const starColors = star.getColors();
          hole.absorbStarColors(starColors, false);

          // Se a estrela foi totalmente drenada ou cruzou o horizonte de eventos final:
          if (isDestroyed || dist <= hole.coreRadius * 1.25) {
            star.dispose();
            this.stars.delete(star);

            stream.dispose();
            this.plasmaStreams.delete(streamKey);

            hole.absorbStarColors(starColors, true);
            hole.spawnGravitationalWaveRing(starColors.corona);
            this.onChatMessage?.(
              `💥 A estrela foi completamente consumida! Os anéis de acreção e poeira do buraco negro absorveram sua cor!`
            );
            break;
          }
        }
      }

      if (!isNearAnyHole) {
        star.resetTidalStretch();
      }
    }

    // Remove riachos de plasma que saíram do alcance ou cujas estrelas sumiram
    for (const [key, stream] of this.plasmaStreams) {
      if (!activeStreamKeys.has(key) || stream.star.isDisposed || stream.blackHole.isDisposed) {
        stream.dispose();
        this.plasmaStreams.delete(key);
      } else {
        stream.update(dtSeconds);
      }
    }
  }

  public clear(): void {
    for (const stream of this.plasmaStreams.values()) {
      stream.dispose();
    }
    this.plasmaStreams.clear();

    for (const star of this.stars) {
      star.dispose();
    }
    this.stars.clear();

    for (const planet of this.planets) {
      planet.dispose();
    }
    this.planets.clear();

    this.onChatMessage?.('✨ Todos os corpos celestes foram dissipados.');
  }

  public get starCount(): number {
    return this.stars.size;
  }

  public get planetCount(): number {
    return this.planets.size;
  }
}
