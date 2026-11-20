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

    /**
     * O DEFEITO DE 19/11/2026. Cabecalho assinado precisa chegar IGUAL no `PUT`,
     * e a porta devolvia so a URL: o navegador mandava o `Content-Type` e nao a
     * faixa de tamanho, e o Cloud Storage recusava todo envio. Agora quem assina
     * devolve o que assinou — o MESMO conjunto, nem um a menos, nem um a mais.
     */
    it('devolve os cabecalhos que assinou, junto da URL', async () => {
      const escrita = await armazenamento.urlDeEscrita({
        objeto: { balde: 'quarentena', caminho: 'anexos/p1/a1' },
        tipo: 'application/pdf',
        tamanhoMaximoBytes: 5_000_000,
        validadeSegundos: 600,
      });

      expect(escrita.url).toBe('https://assinada/quarentena/anexos/p1/a1');
      expect(escrita.cabecalhos).toEqual({
        'Content-Type': 'application/pdf',
        'x-goog-content-length-range': '1,5000000',
      });

      const assinado = registro.assinaturas[0] as {
        contentType: string;
        extensionHeaders: Record<string, string>;
      };
      expect({
        'Content-Type': assinado.contentType,
        ...assinado.extensionHeaders,
      }).toEqual(escrita.cabecalhos);
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

  it('devolve com a URL os cabecalhos que o PUT precisa mandar', async () => {
    const falso = new ArmazenamentoFalso();

    const escrita = await falso.urlDeEscrita({
      objeto: { balde: 'quarentena', caminho: 'x' },
      tipo: 'application/pdf',
      tamanhoMaximoBytes: 10,
      validadeSegundos: 60,
    });

    expect(escrita.url).toContain('/escrita/quarentena:x');
    expect(escrita.cabecalhos).toEqual({
      'Content-Type': 'application/pdf',
      'x-goog-content-length-range': '1,10',
    });
  });

  /**
   * O FALSO RECUSA O QUE O CLOUD STORAGE RECUSA. Ele aceitava qualquer `PUT`, e
   * foi assim que um envio que nunca funcionou em producao passou por todas as
   * jornadas. Estes casos sao HTTP de verdade, contra o ouvinte que `pnpm dev` e
   * as jornadas usam.
   */
  describe('o ouvinte HTTP confere o PUT', () => {
    let falso: ArmazenamentoFalso;
    let base: string;
    let assinados: Readonly<Record<string, string>>;
    const OBJETO = { balde: 'quarentena', caminho: 'anexos/p1/a1' } as const;
    const original = process.env['NODE_ENV'];

    beforeEach(async () => {
      process.env['NODE_ENV'] = 'test';
      falso = new ArmazenamentoFalso();
      falso.ouvirEm(0);
      const ouvinte = (
        falso as unknown as {
          ouvinte: {
            once(evento: string, feito: () => void): void;
            listening: boolean;
            address(): { port: number };
          };
        }
      ).ouvinte;
      if (!ouvinte.listening) {
        await new Promise<void>((feito) => ouvinte.once('listening', feito));
      }
      base = `http://127.0.0.1:${String(ouvinte.address().port)}`;

      const escrita = await falso.urlDeEscrita({
        objeto: OBJETO,
        tipo: 'application/pdf',
        tamanhoMaximoBytes: 10,
        validadeSegundos: 60,
      });
      assinados = escrita.cabecalhos;
    });

    afterEach(() => {
      falso.onModuleDestroy();
      process.env['NODE_ENV'] = original;
    });

    function enviar(
      cabecalhos: Record<string, string>,
      corpo = '%PDF-1.4',
      caminho = 'anexos/p1/a1',
    ): Promise<Response> {
      return fetch(
        `${base}/armazenamento-falso/escrita/quarentena:${caminho}`,
        {
          method: 'PUT',
          headers: cabecalhos,
          body: corpo,
        },
      );
    }

    it('aceita o PUT com os cabecalhos assinados', async () => {
      const resposta = await enviar({ ...assinados });

      expect(resposta.status).toBe(200);
      expect(await falso.existe(OBJETO)).toBe(true);
    });

    /** Exatamente o que o navegador fazia: so o tipo, sem a faixa de tamanho. */
    it('recusa o PUT sem a faixa de tamanho assinada, e nada e gravado', async () => {
      const resposta = await enviar({ 'Content-Type': 'application/pdf' });

      expect(resposta.status).toBe(400);
      expect(await resposta.text()).toMatch(/x-goog-content-length-range/);
      expect(await falso.existe(OBJETO)).toBe(false);
    });

    it('recusa o PUT com outro tipo', async () => {
      const resposta = await enviar({
        ...assinados,
        'Content-Type': 'application/x-msdownload',
      });

      expect(resposta.status).toBe(400);
      expect(await falso.existe(OBJETO)).toBe(false);
    });

    it('recusa o PUT com a faixa de tamanho adulterada', async () => {
      const resposta = await enviar({
        ...assinados,
        'x-goog-content-length-range': '1,999999999',
      });

      expect(resposta.status).toBe(400);
      expect(await falso.existe(OBJETO)).toBe(false);
    });

    it('recusa corpo acima do teto assinado', async () => {
      const resposta = await enviar({ ...assinados }, 'x'.repeat(11));

      expect(resposta.status).toBe(400);
      expect(await resposta.text()).toBe('EntityTooLarge');
      expect(await falso.existe(OBJETO)).toBe(false);
    });

    it('recusa escrita em URL que ninguem emitiu', async () => {
      const resposta = await enviar(
        { ...assinados },
        '%PDF-1.4',
        'outro/caminho',
      );

      expect(resposta.status).toBe(403);
    });
  });

  it('excluir objeto ausente nao estoura', async () => {
    const falso = new ArmazenamentoFalso();
    await expect(
      falso.excluir({ balde: 'quarentena', caminho: 'sumiu' }),
    ).resolves.toBeUndefined();
  });
});
