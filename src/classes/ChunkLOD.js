import { BufferGeometry, BufferAttribute } from 'three';

class ChunkLOD {
    constructor(chunkData, options = {}) {
        // Verificar se chunkData é válido
        if (!chunkData || typeof chunkData !== 'object') {
            console.warn('ChunkLOD: Dados de chunk inválidos', chunkData);
            chunkData = this.createEmptyChunkData();
        }

        this.chunkData = chunkData;
        this.maxLevels = options.maxLevels || 4;
        this.distanceLevels = [
            { maxDistance: 50, resolution: 1 },   // Nível 0: Máximo detalhe
            { maxDistance: 100, resolution: 2 },  // Nível 1: Redução de 50% dos detalhes
            { maxDistance: 200, resolution: 4 },  // Nível 2: Redução de 75% dos detalhes
            { maxDistance: 400, resolution: 8 }   // Nível 3: Redução de 87.5% dos detalhes
        ];
        
        this.lodGeometries = new Map();
        this.generateLODGeometries();
    }

    // Método para criar dados de chunk vazios em caso de erro
    createEmptyChunkData() {
        return {
            positions: [],
            normals: [],
            colors: [],
            uvs: [],
            vertices: []
        };
    }

    generateLODGeometries() {
        // Gera geometrias com diferentes níveis de detalhe
        for (let level = 0; level < this.maxLevels; level++) {
            const geometry = this.createLODGeometry(level);
            this.lodGeometries.set(level, geometry);
        }
    }

    createLODGeometry(level) {
        const resolution = this.distanceLevels[level].resolution;
        const originalData = this.chunkData;

        // Verificações de segurança para cada atributo
        const requiredAttributes = ['positions', 'normals', 'colors', 'uvs', 'vertices'];
        requiredAttributes.forEach(attr => {
            if (!originalData[attr] || !Array.isArray(originalData[attr])) {
                console.warn(`ChunkLOD: Atributo ${attr} inválido ou ausente`);
                originalData[attr] = [];
            }
        });

        // Reduzir detalhes baseado no nível de LOD
        const reducedPositions = [];
        const reducedNormals = [];
        const reducedColors = [];
        const reducedUVs = [];
        const reducedVertices = [];

        // Estratégia de redução: pular blocos baseado no nível de resolução
        const safeReduce = (arr, step) => {
            const result = [];
            for (let i = 0; i < arr.length; i += step) {
                result.push(arr[i]);
            }
            return result;
        };

        reducedPositions.push(...safeReduce(originalData.positions, 3 * resolution));
        reducedNormals.push(...safeReduce(originalData.normals, 3 * resolution));
        reducedColors.push(...safeReduce(originalData.colors, 3 * resolution));
        reducedUVs.push(...safeReduce(originalData.uvs, 2 * resolution));
        reducedVertices.push(...safeReduce(originalData.vertices, resolution));

        const geometry = new BufferGeometry();
        
        // Garantir que todos os atributos originais sejam preservados
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(reducedPositions), 3));
        geometry.setAttribute('normal', new BufferAttribute(new Float32Array(reducedNormals), 3));
        geometry.setAttribute('color', new BufferAttribute(new Float32Array(reducedColors), 3));
        geometry.setAttribute('uv', new BufferAttribute(new Float32Array(reducedUVs), 2));
        geometry.setIndex(reducedVertices);

        // Adicionar atributos originais para referência
        geometry.originalData = originalData;
        geometry.lodLevel = level;

        return geometry;
    }

    selectLODGeometry(distanceToCamera) {
        // Verificação de segurança para distância
        if (typeof distanceToCamera !== 'number' || isNaN(distanceToCamera)) {
            console.warn('ChunkLOD: Distância inválida', distanceToCamera);
            distanceToCamera = Infinity; // Força o menor nível de detalhe
        }

        // Selecionar geometria baseado na distância da câmera
        for (let level = 0; level < this.maxLevels; level++) {
            if (distanceToCamera <= this.distanceLevels[level].maxDistance) {
                return this.lodGeometries.get(level);
            }
        }

        // Se muito distante, retorna o menor nível de detalhe
        return this.lodGeometries.get(this.maxLevels - 1);
    }

    // Método de utilidade para calcular distância
    static calculateDistance(position1, position2) {
        // Verificações de segurança para posições
        const safeCoord = (pos, key) => {
            // Se a posição for undefined, null ou não for um objeto, retorna 0
            if (!pos || typeof pos !== 'object') {
                console.warn(`ChunkLOD: Coordenada inválida ${key}`, pos);
                return 0;
            }
            // Retorna a coordenada ou 0 se não existir
            return pos[key] || 0;
        };

        // Calcular coordenadas com segurança
        const x1 = safeCoord(position1, 'x');
        const y1 = safeCoord(position1, 'y');
        const z1 = safeCoord(position1, 'z');

        const x2 = safeCoord(position2, 'x');
        const y2 = safeCoord(position2, 'y');
        const z2 = safeCoord(position2, 'z');

        // Calcular distância euclidiana
        return Math.sqrt(
            Math.pow(x1 - x2, 2) +
            Math.pow(y1 - y2, 2) +
            Math.pow(z1 - z2, 2)
        );
    }
}

export default ChunkLOD;
