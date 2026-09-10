import {
  esquemaAnexoDeclarado,
  esquemaEnvioDeAnexos,
  extensaoDe,
  POLITICA_ANEXO_CLIENTE,
  STATUS_ANEXO_SEM_ARQUIVO,
} from './anexo.js';

const PDF = {
  nome: 'contrato-social.pdf',
  tipo: 'application/pdf' as const,
  tamanhoBytes: 1_000_000,
};

describe('politica confirmada na reuniao', () => {
  it('sao 5 MB por arquivo e 3 arquivos por envio', () => {
    expect(POLITICA_ANEXO_CLIENTE.tamanhoMaximoBytes).toBe(5 * 1024 * 1024);
    expect(POLITICA_ANEXO_CLIENTE.maximoPorEnvio).toBe(3);
    expect(POLITICA_ANEXO_CLIENTE.tipos).toEqual([
      'image/jpeg',
      'application/pdf',
    ]);
  });

  /**
   * A regra inviolavel 6 diz que nada e servido com status diferente de `limpo`.
   * O anexo da Etapa 9 nao tem arquivo nenhum, e o status precisa refletir isso
   * de um jeito que nenhum caminho de leitura confunda com "ja varrido".
   */
  it('o status do placeholder nao e, e nao pode virar, `limpo`', () => {
    expect(STATUS_ANEXO_SEM_ARQUIVO).toBe('metadado_sem_arquivo');
    expect(STATUS_ANEXO_SEM_ARQUIVO).not.toBe('limpo');
  });
});

describe('extensaoDe', () => {
  it.each([
    ['foto.JPG', 'jpg'],
    ['doc.pdf', 'pdf'],
    ['arquivo.tar.gz', 'gz'],
    ['sem-extensao', ''],
  ])('%s tem extensao %s', (nome, esperado) => {
    expect(extensaoDe(nome)).toBe(esperado);
  });
});

describe('esquemaAnexoDeclarado', () => {
  it('aceita pdf e jpg dentro do limite', () => {
    expect(esquemaAnexoDeclarado.safeParse(PDF).success).toBe(true);
    expect(
      esquemaAnexoDeclarado.safeParse({
        nome: 'rg.jpeg',
        tipo: 'image/jpeg',
        tamanhoBytes: 200_000,
      }).success,
    ).toBe(true);
  });

  it.each([['image/png'], ['application/zip'], ['text/html']])(
    'recusa o tipo %s',
    (tipo) => {
      expect(esquemaAnexoDeclarado.safeParse({ ...PDF, tipo }).success).toBe(
        false,
      );
    },
  );

  it('recusa acima de 5 MB', () => {
    expect(
      esquemaAnexoDeclarado.safeParse({
        ...PDF,
        tamanhoBytes: 5 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it('aceita exatamente 5 MB', () => {
    expect(
      esquemaAnexoDeclarado.safeParse({
        ...PDF,
        tamanhoBytes: 5 * 1024 * 1024,
      }).success,
    ).toBe(true);
  });

  it('recusa arquivo vazio', () => {
    expect(
      esquemaAnexoDeclarado.safeParse({ ...PDF, tamanhoBytes: 0 }).success,
    ).toBe(false);
  });

  /**
   * Extensao e tipo declarados precisam concordar. Nao e prova de nada — a prova
   * sao os magic bytes da Etapa 11 — mas a divergencia ja e sinal suficiente para
   * recusar antes de gastar bucket.
   */
  it('recusa extensao que nao corresponde ao tipo', () => {
    expect(
      esquemaAnexoDeclarado.safeParse({ ...PDF, nome: 'contrato.jpg' }).success,
    ).toBe(false);
  });

  /**
   * Na Etapa 11 este nome participa do caminho do objeto no bucket. `../` num
   * nome de arquivo e travessia de diretorio, e recusar aqui e mais barato do que
   * sanear la.
   */
  it.each([['../../etc/passwd.pdf'], ['pasta/doc.pdf'], ['pasta\\doc.pdf']])(
    'recusa barra no nome: %s',
    (nome) => {
      expect(esquemaAnexoDeclarado.safeParse({ ...PDF, nome }).success).toBe(
        false,
      );
    },
  );
});

describe('esquemaEnvioDeAnexos', () => {
  it('aceita ate tres', () => {
    expect(
      esquemaEnvioDeAnexos.safeParse({ anexos: [PDF, PDF, PDF] }).success,
    ).toBe(true);
  });

  it('recusa o quarto', () => {
    expect(
      esquemaEnvioDeAnexos.safeParse({ anexos: [PDF, PDF, PDF, PDF] }).success,
    ).toBe(false);
  });

  it('recusa envio vazio', () => {
    expect(esquemaEnvioDeAnexos.safeParse({ anexos: [] }).success).toBe(false);
  });
});
