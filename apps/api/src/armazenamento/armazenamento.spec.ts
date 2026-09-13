import type { Bucket, File } from '@google-cloud/storage';
import { ArmazenamentoFalso } from './armazenamento-falso.js';
import { criarArmazenamento } from './armazenamento.module.js';
import { GcsArmazenamento } from './gcs.armazenamento.js';

/* -------------------------------------------------------------------------- */
/* A escolha do adaptador                                                      */
/* -------------------------------------------------------------------------- */

describe('criarArmazenamento', () => {
  const COMPLETO = {
    BUCKET_QUARENTENA: 'q',
    BUCKET_ARQUIVOS: 'a',
  } as NodeJS.ProcessEnv;

  /**
   * EM PRODUCAO, CONFIGURACAO AUSENTE E ERRO DE INICIALIZACAO — nao degradacao
   * silenciosa. Um servico que sobe "saudavel" guardando arquivos num `Map` em
   * memoria e pior que um que se recusa a subir: o primeiro so aparece quando um
   * cliente diz que o entregavel sumiu.
   */
  it.each([
    ['sem os dois', {}],
    ['so com a quarentena', { BUCKET_QUARENTENA: 'q' }],
    ['com um vazio', { BUCKET_QUARENTENA: 'q', BUCKET_ARQUIVOS: '' }],
  ])('recusa subir em producao %s', (_nome, parcial) => {
    expect(() =>
      criarArmazenamento({
        ...parcial,
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/obrigatorios em producao/);
  });

  /** Fora de producao cai no falso de proposito: nao ha emulador de Storage. */
  it('sem configuracao fora de producao, usa o falso', () => {
    expect(criarArmazenamento({} as NodeJS.ProcessEnv)).toBeInstanceOf(
      ArmazenamentoFalso,
    );
  });

  /**
   * SOB EMULADOR TAMBEM CAI NO FALSO, mesmo com os buckets definidos. Sem isso,
   * a suite de integracao falaria com o Cloud Storage DE VERDADE — o projeto nao
   * tem emulador de Storage no `firebase.json`.
   */
  it('sob emulador usa o falso, mesmo configurado', () => {
    const armazenamento = criarArmazenamento({
      ...COMPLETO,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
    } as NodeJS.ProcessEnv);

    expect(armazenamento).toBeInstanceOf(ArmazenamentoFalso);
  });
});

/* -------------------------------------------------------------------------- */
/* O adaptador de producao                                                     */
/* -------------------------------------------------------------------------- */

interface ArquivoFalso {
  assinaturas: Record<string, unknown>[];
  copiados: string[];
  apagados: number;
  baixas: { start?: number; end?: number }[];
}

function baldeFalso(registro: ArquivoFalso, nome: string): Bucket {
  const arquivo = (caminho: string): File =>
    ({
      name: caminho,
      getSignedUrl: (opcoes: Record<string, unknown>) => {
        registro.assinaturas.push({ ...opcoes, caminho, balde: nome });
        return Promise.resolve([`https://assinada/${nome}/${caminho}`]);
      },
      download: (opcoes: { start?: number; end?: number }) => {
        registro.baixas.push(opcoes);
        return Promise.resolve([Buffer.from([0x25, 0x50, 0x44, 0x46])]);
      },
      copy: (destino: File) => {
        registro.copiados.push(destino.name);
        return Promise.resolve([]);
      },
      delete: () => {
        registro.apagados += 1;
        return Promise.resolve([]);
      },
      exists: () => Promise.resolve([true]),
    }) as unknown as File;

  return { file: arquivo } as unknown as Bucket;
}

describe('GcsArmazenamento', () => {
  let registro: ArquivoFalso;
  let armazenamento: GcsArmazenamento;

  beforeEach(() => {
    registro = { assinaturas: [], copiados: [], apagados: 0, baixas: [] };
    armazenamento = new GcsArmazenamento({
      quarentena: baldeFalso(registro, 'quarentena'),
      arquivos: baldeFalso(registro, 'arquivos'),
    });
  });

  describe('URL de escrita', () => {
    /**
     * O TIPO E O TAMANHO ENTRAM NA ASSINATURA. Sem isso, a validacao do servidor
     * seria conselho: o navegador pediria URL para um PDF de 1 MB e mandaria um
     * executavel de 500 MB. Com eles, o proprio Cloud Storage recusa.
     */
    it('assina tipo e faixa de tamanho', async () => {
      await armazenamento.urlDeEscrita({
        objeto: { balde: 'quarentena', caminho: 'anexos/p1/a1' },
        tipo: 'application/pdf',
        tamanhoMaximoBytes: 5_000_000,
        validadeSegundos: 600,
      });

      expect(registro.assinaturas[0]).toMatchObject({
        version: 'v4',
        action: 'write',
        contentType: 'application/pdf',
        extensionHeaders: {
          'x-goog-content-length-range': '1,5000000',
        },
      });
    });
  });

  describe('URL de leitura', () => {
    /**
     * `attachment` SEMPRE (arquitetura 7.3). Com `inline`, um PDF ou um SVG abre
     * no navegador — e um arquivo de conteudo desconhecido que ABRE e exatamente
     * o que a varredura existe para evitar servir.
     */
    it('forca download em vez de abrir', async () => {
      await armazenamento.urlDeLeitura({
        objeto: { balde: 'arquivos', caminho: 'anexos/p1/a1' },
        nomeParaBaixar: 'rg.jpg',
        validadeSegundos: 300,
      });

      expect(registro.assinaturas[0]).toMatchObject({
        action: 'read',
        responseDisposition: 'attachment; filename="rg.jpg"',
      });
    });

    /** Aspas no nome quebrariam o cabecalho; sao removidas. */
    it('aguenta aspas no nome do arquivo', async () => {
      await armazenamento.urlDeLeitura({
        objeto: { balde: 'arquivos', caminho: 'x' },
        nomeParaBaixar: 'do"c.pdf',
        validadeSegundos: 300,
      });

      expect(registro.assinaturas[0]['responseDisposition']).toBe(
        'attachment; filename="doc.pdf"',
      );
    });
  });

  /** Leitura de FAIXA, e nao o objeto inteiro: baixar tudo para olhar cinco
   * bytes desfaria a economia de a API nao tocar no arquivo. */
  it('le apenas os primeiros bytes', async () => {
    const inicio = await armazenamento.lerPrimeirosBytes(
      { balde: 'quarentena', caminho: 'x' },
      12,
    );

    expect(registro.baixas).toEqual([{ start: 0, end: 11 }]);
    expect(inicio).toBeInstanceOf(Uint8Array);
  });

  /** COPIA E APAGA, e nao `move`: os baldes sao diferentes, e o `move` do SDK so
   * opera dentro do mesmo bucket. */
  it('move entre baldes copiando e apagando', async () => {
    await armazenamento.mover(
      { balde: 'quarentena', caminho: 'anexos/p1/a1' },
      { balde: 'arquivos', caminho: 'anexos/p1/a1' },
    );

    expect(registro.copiados).toEqual(['anexos/p1/a1']);
    expect(registro.apagados).toBe(1);
  });

  it('exclui e consulta existencia', async () => {
    await armazenamento.excluir({ balde: 'quarentena', caminho: 'x' });
    expect(registro.apagados).toBe(1);

    await expect(
      armazenamento.existe({ balde: 'arquivos', caminho: 'x' }),
    ).resolves.toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* O falso                                                                     */
/* -------------------------------------------------------------------------- */

describe('ArmazenamentoFalso', () => {
  it('move o conteudo entre baldes', async () => {
    const falso = new ArmazenamentoFalso();
    falso.semear({ balde: 'quarentena', caminho: 'x' }, new Uint8Array([1, 2]));

    await falso.mover(
      { balde: 'quarentena', caminho: 'x' },
      { balde: 'arquivos', caminho: 'x' },
    );

    expect(falso.caminhos).toEqual(['arquivos:x']);
  });

  it('recusa ler ou mover objeto ausente', async () => {
    const falso = new ArmazenamentoFalso();

    await expect(
      falso.lerPrimeirosBytes({ balde: 'quarentena', caminho: 'sumiu' }, 4),
    ).rejects.toThrow(/ausente/);
    await expect(
      falso.mover(
        { balde: 'quarentena', caminho: 'sumiu' },
        { balde: 'arquivos', caminho: 'sumiu' },
      ),
    ).rejects.toThrow(/ausente/);
  });

  it('emite URLs reconheciveis e registra as operacoes', async () => {
    const falso = new ArmazenamentoFalso();

    await falso.urlDeEscrita({
      objeto: { balde: 'quarentena', caminho: 'x' },
      tipo: 'application/pdf',
      tamanhoMaximoBytes: 10,
      validadeSegundos: 60,
    });
    await falso.urlDeLeitura({
      objeto: { balde: 'arquivos', caminho: 'x' },
      nomeParaBaixar: 'x.pdf',
      validadeSegundos: 60,
    });

    expect(falso.operacoes).toEqual([
      'escrita quarentena:x',
      'leitura arquivos:x',
    ]);
  });

  it('excluir objeto ausente nao estoura', async () => {
    const falso = new ArmazenamentoFalso();
    await expect(
      falso.excluir({ balde: 'quarentena', caminho: 'sumiu' }),
    ).resolves.toBeUndefined();
  });
});
