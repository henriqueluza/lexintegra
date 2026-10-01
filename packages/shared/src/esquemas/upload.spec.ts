import {
  conferirPolitica,
  ESTADOS_ARQUIVO,
  esquemaPedidoDeUpload,
  TIPO_DOCX,
  tipoPelaExtensao,
  podeSerServido,
  POLITICA_UPLOAD,
  prefixoDoFluxo,
  type PedidoDeUpload,
} from './upload.js';

const PDF: PedidoDeUpload = {
  nome: 'contrato.pdf',
  tipo: 'application/pdf',
  tamanhoBytes: 1_000_000,
};

const JPG: PedidoDeUpload = {
  nome: 'rg.jpg',
  tipo: 'image/jpeg',
  tamanhoBytes: 200_000,
};

describe('a politica do cliente foi confirmada na reuniao', () => {
  it('e jpg/pdf, 5 MB, 3 arquivos', () => {
    expect(POLITICA_UPLOAD['anexo-cliente']).toEqual({
      tipos: ['image/jpeg', 'application/pdf'],
      tamanhoMaximoBytes: 5 * 1024 * 1024,
      maximoPorEnvio: 3,
    });
  });
});

const DOCX: PedidoDeUpload = {
  nome: 'parecer.docx',
  tipo: TIPO_DOCX,
  tamanhoBytes: 1_000_000,
};

/** decisoes.md, 3.1: PDF e DOCX, 20 MB, um por envio. */
describe('a politica do advogado foi confirmada', () => {
  it('e pdf/docx, 20 MB, 1 arquivo', () => {
    expect(POLITICA_UPLOAD['entregavel-advogado']).toEqual({
      tipos: ['application/pdf', TIPO_DOCX],
      tamanhoMaximoBytes: 20 * 1024 * 1024,
      maximoPorEnvio: 1,
    });
  });

  /** As duas sao DIFERENTES. Se um dia ficarem iguais, que seja por decisao. */
  it('as duas politicas nao sao a mesma', () => {
    expect(POLITICA_UPLOAD['entregavel-advogado']).not.toEqual(
      POLITICA_UPLOAD['anexo-cliente'],
    );
  });
});

describe('conferirPolitica', () => {
  it('aceita o que a politica do fluxo permite', () => {
    expect(conferirPolitica('anexo-cliente', [PDF, JPG])).toBeNull();
    expect(conferirPolitica('entregavel-advogado', [PDF])).toBeNull();
  });

  it('o advogado envia DOCX; o cliente nao', () => {
    expect(conferirPolitica('entregavel-advogado', [DOCX])).toBeNull();
    expect(conferirPolitica('anexo-cliente', [DOCX])).toContain(
      'Envie JPG ou PDF',
    );
  });

  /** `.doc` e `.docm` continuam recusados, pelo tipo e pela extensao. */
  it.each([
    ['DOC pelo tipo', { nome: 'a.doc', tipo: 'application/msword' }],
    [
      'DOCM pelo tipo',
      {
        nome: 'a.docm',
        tipo: 'application/vnd.ms-word.document.macroEnabled.12',
      },
    ],
    ['DOCM declarado como DOCX', { nome: 'a.docm', tipo: TIPO_DOCX }],
    ['PDF com extensao de DOCX', { nome: 'a.docx', tipo: 'application/pdf' }],
  ])('recusa %s', (_caso, arquivo) => {
    expect(
      conferirPolitica('entregavel-advogado', [{ ...DOCX, ...arquivo }]),
    ).toContain('Envie PDF ou DOCX');
  });

  it('a extensao e conferida sem diferenciar maiusculas', () => {
    expect(
      conferirPolitica('entregavel-advogado', [{ ...DOCX, nome: 'A.DOCX' }]),
    ).toBeNull();
  });

  it('recusa envio vazio', () => {
    expect(conferirPolitica('anexo-cliente', [])).toContain('ao menos um');
  });

  /**
   * A MESMA ENTRADA, VEREDITOS DIFERENTES por fluxo. E o ponto inteiro da
   * parametrizacao: um JPG e anexo valido do cliente e nao e entregavel.
   */
  it('o mesmo arquivo passa num fluxo e nao no outro', () => {
    expect(conferirPolitica('anexo-cliente', [JPG])).toBeNull();
    expect(conferirPolitica('entregavel-advogado', [JPG])).toContain(
      'Tipo nao aceito',
    );
  });

  it('o teto de quantidade e por fluxo', () => {
    expect(conferirPolitica('anexo-cliente', [PDF, PDF, PDF])).toBeNull();
    expect(conferirPolitica('anexo-cliente', [PDF, PDF, PDF, PDF])).toContain(
      'no maximo 3',
    );
    expect(conferirPolitica('entregavel-advogado', [PDF, PDF])).toContain(
      'no maximo 1',
    );
  });

  it('o teto de tamanho e por fluxo', () => {
    const grande = { ...PDF, tamanhoBytes: 6 * 1024 * 1024 };

    expect(conferirPolitica('anexo-cliente', [grande])).toContain('5 MB');
    expect(conferirPolitica('entregavel-advogado', [grande])).toBeNull();
  });

  it('aceita exatamente o limite', () => {
    const limite = { ...PDF, tamanhoBytes: 5 * 1024 * 1024 };
    expect(conferirPolitica('anexo-cliente', [limite])).toBeNull();
  });

  it('um invalido no meio recusa o envio', () => {
    const grande = { ...PDF, tamanhoBytes: 9_000_000 };
    expect(conferirPolitica('anexo-cliente', [PDF, grande])).not.toBeNull();
  });
});

describe('tipoPelaExtensao', () => {
  it.each([
    ['parecer.DOCX', TIPO_DOCX],
    ['a.pdf', 'application/pdf'],
    ['foto.jpeg', 'image/jpeg'],
    ['a.docm', ''],
    ['a.doc', ''],
  ])('%s', (nome, tipo) => {
    expect(tipoPelaExtensao(nome)).toBe(tipo);
  });
});

describe('podeSerServido', () => {
  /** Regra inviolavel 6: nada e servido com status diferente de `limpo`. */
  it('so `limpo` pode', () => {
    for (const estado of ESTADOS_ARQUIVO) {
      expect(podeSerServido(estado)).toBe(estado === 'limpo');
    }
  });

  /** A lista inteira, nominal: um estado novo que alguem acrescente sem pensar
   * na regra 6 faz este teste falhar. */
  it('sao seis estados, e apenas um serve', () => {
    expect(ESTADOS_ARQUIVO).toEqual([
      'pendente_upload',
      'pendente_scan',
      'limpo',
      'infectado',
      'rejeitado',
      'excluido',
    ]);
    expect(ESTADOS_ARQUIVO.filter(podeSerServido)).toEqual(['limpo']);
  });
});

describe('esquemaPedidoDeUpload', () => {
  it('aceita um pedido normal', () => {
    expect(esquemaPedidoDeUpload.safeParse(PDF).success).toBe(true);
  });

  /** O nome participa do caminho do objeto no bucket. */
  it.each([['../../etc/passwd.pdf'], ['pasta/doc.pdf'], ['pasta\\doc.pdf']])(
    'recusa barra no nome: %s',
    (nome) => {
      expect(esquemaPedidoDeUpload.safeParse({ ...PDF, nome }).success).toBe(
        false,
      );
    },
  );

  it('recusa arquivo vazio', () => {
    expect(
      esquemaPedidoDeUpload.safeParse({ ...PDF, tamanhoBytes: 0 }).success,
    ).toBe(false);
  });
});

describe('prefixoDoFluxo', () => {
  /**
   * O "bucket logico" da arquitetura 6.2. Os buckets fisicos sao os mesmos — com
   * CMEK e ciclo de vida num lugar so — e o caminho e o que permite IAM,
   * retencao e varredura diferentes por fluxo.
   */
  it('separa os dois fluxos por prefixo', () => {
    expect(prefixoDoFluxo('anexo-cliente', 'pedido-1')).toBe('anexos/pedido-1');
    expect(prefixoDoFluxo('entregavel-advogado', 'pedido-1', '001')).toBe(
      'entregaveis/pedido-1/001',
    );
  });

  it('os prefixos nunca colidem', () => {
    const anexo = prefixoDoFluxo('anexo-cliente', 'p1');
    const entregavel = prefixoDoFluxo('entregavel-advogado', 'p1', '001');

    expect(entregavel.startsWith(anexo)).toBe(false);
    expect(anexo.startsWith(entregavel)).toBe(false);
  });
});
