// Chunks uniformes (ar puro, solido puro) compartilham um unico array por valor entre
// todos os chunks do mundo, com copy-on-write na escrita. Isso derruba a memoria em ~6x e
// e o que permite carregar longe nos tres eixos.
//
// O modo de falha e silencioso e catastrofico: uma escrita que nao materialize primeiro
// aparece em TODO chunk uniforme daquele valor, espalhando blocos pelo mundo inteiro. Tipos
// nao pegam isso, e um teste de runtime pegaria so o caminho exercitado.
//
// Este verificador exige que todo metodo que escreve nos arrays compartilhados tambem
// chame o materializador correspondente.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** Divide o corpo de uma classe em metodos, por indentacao de dois espacos. */
const splitMethods = (source) => {
  const lines = source.split('\n');
  const methods = [];
  let current = { name: '<arquivo>', lines: [], start: 1 };
  const signature = /^ {2}(?:public |private |protected |static |readonly |async |get |set )*([A-Za-z_$][\w$]*)\s*[(<]/;

  lines.forEach((line, i) => {
    const m = signature.exec(line);
    if (m && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*')) {
      methods.push(current);
      current = { name: m[1], lines: [], start: i + 1 };
    }
    current.lines.push(line);
  });
  methods.push(current);
  return methods.map((mt) => ({ ...mt, body: mt.lines.join('\n') }));
};

const checks = [
  {
    file: 'engine/world/ProceduralWorld.ts',
    // Escritas indexadas em blocks / waterLevels / fatias de fronteira
    writes: [
      /\.blocks\[[^\]]*\]\s*=[^=]/,
      /\.waterLevels\[[^\]]*\]\s*=[^=]/,
      /\bborders\.(?:negX|posX|negY|posY|negZ|posZ)\[[^\]]*\]\s*=[^=]/
    ],
    requires: 'materializeBlocks',
    // Metodos que criam os arrays compartilhados, ou que os clonam, nao precisam do guard.
    exempt: ['materializeBlocks', 'sharedBlocksFor', 'sharedSliceFor', 'sharedLightFor']
  },
  {
    file: 'engine/world/ProceduralWorld.ts',
    // Quem passa chunk.data adiante perde o controle da escrita: o chamado guarda o array
    // numa local. Precisa materializar antes.
    writes: [/WaterSimulator\.stepChunk\s*\(/],
    requires: 'materializeBlocks',
    exempt: []
  },
  {
    file: 'engine/world/LightEngine.ts',
    writes: [/\.light\[[^\]]*\]\s*=[^=]/],
    requires: 'beforeLightWrite',
    // computeLocal escreve num array novo que ele mesmo alocou, nao no de um chunk.
    exempt: ['computeLocal']
  }
];

const violations = [];
for (const check of checks) {
  const source = readFileSync(join(root, check.file), 'utf8');
  for (const method of splitMethods(source)) {
    if (check.exempt.includes(method.name)) continue;
    const writesHere = check.writes.some((re) => re.test(method.body));
    if (!writesHere) continue;
    if (!method.body.includes(check.requires)) {
      violations.push(
        `${check.file}:${method.start} metodo \`${method.name}\` escreve em array ` +
        `compartilhavel sem chamar \`${check.requires}\``
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Escrita em array de chunk compartilhado sem copy-on-write:\n  ' + violations.join('\n  ') +
    '\n\nAdicione a chamada do materializador no inicio do metodo, ou registre a isencao ' +
    'neste script se o array for comprovadamente privado.'
  );
  process.exit(1);
}
console.log('copy-on-write de chunks compartilhados OK');
