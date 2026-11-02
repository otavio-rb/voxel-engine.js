import {
  ClampToEdgeWrapping,
  Data3DTexture,
  NearestFilter,
  RedIntegerFormat,
  UnsignedByteType,
  UnsignedIntType,
  type WebGLRenderer
} from 'three';

/**
 * Textura 3D grande com escrita PARCIAL.
 *
 * O brickmap global precisa reescrever caixas pequenas de uma textura enorme muitas vezes por
 * segundo (um chunk que chega são 64 bricks de 8³; uma edição é um brick só). O three não
 * expõe isso: `needsUpdate` reenvia a imagem INTEIRA. Num atlas de 48 MB isso é meio segundo
 * de engasgo por chunk — exatamente o padrão de travada que esta reescrita existe para matar.
 *
 * Então a alocação é feita uma vez pelo three (para que ele conheça a textura e saiba ligá-la
 * a um uniform) e, a partir daí, toda escrita vai por `gl.texSubImage3D` direto no objeto
 * WebGL que o three criou. Nenhum espelho em JS existe em momento nenhum: ninguém lê o atlas
 * de volta, e ele chega a 150 MB.
 *
 * A ligação é feita por `renderer.state.bindTexture`, e não por `gl.bindTexture`, porque o
 * three mantém um cache de qual textura está em cada slot. Ligar por baixo dele deixa o cache
 * mentindo e o próximo draw lê a textura errada.
 */
export class GpuTexture3D {
  public readonly texture: Data3DTexture;

  private gl: WebGL2RenderingContext | null = null;
  private renderer: WebGLRenderer | null = null;
  private glTexture: WebGLTexture | null = null;

  private readonly internalFormat: 'R8UI' | 'R32UI';
  /** Formato de upload, derivado de `internalFormat`. */
  private readonly glFormat: 'RED_INTEGER';
  private readonly glType: 'UNSIGNED_BYTE' | 'UNSIGNED_INT';

  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly depth: number,
    internalFormat: 'R8UI' | 'R32UI'
  ) {
    // Sem dados, e sem `needsUpdate`.
    //
    // O objeto do three existe so para poder ser ligado a um uniform; quem aloca a textura
    // e `attach`, com `texStorage3D`. Deixar `version` em zero e o que impede o three de
    // tentar subir uma imagem -- e e exatamente o que se quer, porque um espelho em JS do
    // tamanho do atlas sao ~150 MB de pico no worker, alocados e jogados fora no mesmo
    // instante so para informar um tamanho que `texStorage3D` ja recebe.
    //
    // (Passar `data: null` e deixar o three fazer o upload nao funciona: ele chama
    // `texSubImage3D`, e em WebGL2 um `null` ali e lido como offset num PIXEL_UNPACK_BUFFER,
    // o que da INVALID_OPERATION a cada inicializacao.)
    this.texture = new Data3DTexture(null as unknown as BufferSource, width, height, depth);
    this.texture.format = RedIntegerFormat;
    this.texture.type = internalFormat === 'R8UI' ? UnsignedByteType : UnsignedIntType;
    this.texture.internalFormat = internalFormat;
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.wrapR = ClampToEdgeWrapping;
    this.texture.unpackAlignment = 1;
    this.texture.generateMipmaps = false;

    this.internalFormat = internalFormat;
    this.glFormat = 'RED_INTEGER';
    this.glType = internalFormat === 'R8UI' ? 'UNSIGNED_BYTE' : 'UNSIGNED_INT';
  }

  /** Bytes de VRAM ocupados, para o relatório de memória do runtime. */
  public get byteLength(): number {
    return this.width * this.height * this.depth * (this.glType === 'UNSIGNED_BYTE' ? 1 : 4);
  }

  /**
   * Força o three a criar o objeto WebGL (alocado, com conteúdo indefinido).
   *
   * Precisa do renderer, então só pode rodar depois que ele existe — não no construtor.
   * Idempotente: chamadas seguintes não fazem nada.
   */
  public attach(renderer: WebGLRenderer): void {
    if (this.glTexture) return;

    const gl = renderer.getContext() as WebGL2RenderingContext;
    const state = renderer.state as unknown as {
      bindTexture: (type: number, tex: WebGLTexture | null) => void;
    };

    const tex = gl.createTexture();
    if (!tex) throw new Error('GpuTexture3D: gl.createTexture falhou');

    state.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl[this.internalFormat], this.width, this.height, this.depth);
    // Textura inteira: filtro tem de ser NEAREST, e o wrap evita amostrar a face oposta
    // quando o DDA passa um texel do limite.
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Entrega o objeto pronto ao three. Com `version` em zero ele nao tenta subir nada e
    // apenas liga este `__webglTexture` quando o uniform pedir.
    const props = renderer.properties.get(this.texture) as {
      __webglTexture?: WebGLTexture; __webglInit?: boolean; __version?: number;
    };
    props.__webglTexture = tex;
    props.__webglInit = true;
    props.__version = this.texture.version;

    this.renderer = renderer;
    this.gl = gl;
    this.glTexture = tex;
  }

  public get isAttached(): boolean {
    return this.glTexture !== null;
  }

  /**
   * Reescreve a caixa `[x, x+w) x [y, y+h) x [z, z+d)`.
   *
   * `data` é lido na ordem x-mais-rápido, depois y, depois z, e precisa ter exatamente
   * `w * h * d` elementos.
   */
  public writeBox(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    data: Uint8Array | Uint32Array
  ): void {
    const gl = this.gl;
    if (!gl || !this.glTexture || !this.renderer) return;

    // Ver o comentário da classe: ligar pelo state do three, não pelo gl cru.
    (this.renderer.state as unknown as {
      bindTexture: (type: number, tex: WebGLTexture) => void;
    }).bindTexture(gl.TEXTURE_3D, this.glTexture);

    // O three deixa o estado de unpack como o ultimo upload DELE precisou -- flipY ligado
    // para uma textura de UI, ou um ROW_LENGTH de um subimage de array. Em WebGL2 esses
    // modificadores valem tambem para upload de ArrayBufferView, entao herda-los aqui
    // entregaria o brick espelhado ou deslocado. Sao seis `pixelStorei` por upload, e o
    // custo deles nao aparece em medicao nenhuma.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);

    gl.texSubImage3D(
      gl.TEXTURE_3D, 0,
      x, y, z, w, h, d,
      gl[this.glFormat], gl[this.glType],
      data
    );
  }

  public dispose(): void {
    // O three nao conhece esta textura como sua (nunca a subiu), entao o `dispose` dele nao
    // apaga o objeto WebGL: isso e por nossa conta.
    if (this.gl && this.glTexture) this.gl.deleteTexture(this.glTexture);
    this.texture.dispose();
    this.gl = null;
    this.renderer = null;
    this.glTexture = null;
  }
}
