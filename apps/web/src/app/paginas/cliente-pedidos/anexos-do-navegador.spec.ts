import { anexosDeclarados, MAXIMO_ANEXOS } from './anexos-do-navegador';

/** Um `File` de tamanho declarado, sem alocar os bytes. */
function arquivo(nome: string, tipo: string, bytes: number): File {
  const file = new File([''], nome, { type: tipo });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

function lista(...arquivos: File[]): FileList {
  return {
    length: arquivos.length,
    item: (i: number) => arquivos[i] ?? null,
    [Symbol.iterator]: function* () {
      yield* arquivos;
    },
    ...Object.fromEntries(arquivos.map((a, i) => [i, a])),
  } as unknown as FileList;
}

const PDF = arquivo('contrato.pdf', 'application/pdf', 1_000_000);
const JPG = arquivo('rg.jpg', 'image/jpeg', 200_000);

describe('anexosDeclarados', () => {
  it('sem selecao, nao ha anexo nem erro', () => {
    expect(anexosDeclarados(null)).toEqual({ anexos: [], erro: null });
    expect(anexosDeclarados(lista())).toEqual({ anexos: [], erro: null });
  });

  /**
   * SO METADADO. O conteudo do arquivo nao e lido em ponto nenhum — nem agora,
   * nem na Etapa 11, quando ele vai do navegador direto ao bucket de quarentena
   * sem passar pela API (arquitetura 7.3).
   */
  it('extrai nome, tipo e tamanho, e mais nada', () => {
    const { anexos } = anexosDeclarados(lista(PDF, JPG));

    expect(anexos).toEqual([
      {
        nome: 'contrato.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1_000_000,
      },
      { nome: 'rg.jpg', tipo: 'image/jpeg', tamanhoBytes: 200_000 },
    ]);
  });

  it('recusa acima do maximo por envio', () => {
    const { anexos, erro } = anexosDeclarados(lista(PDF, PDF, PDF, PDF));

    expect(anexos).toEqual([]);
    expect(erro).toContain(String(MAXIMO_ANEXOS));
  });

  it('aceita exatamente o maximo', () => {
    expect(anexosDeclarados(lista(PDF, PDF, PDF)).erro).toBeNull();
  });

  it.each([
    [
      'tipo nao aceito',
      arquivo('planilha.xlsx', 'application/vnd.ms-excel', 100),
    ],
    [
      'acima de 5 MB',
      arquivo('grande.pdf', 'application/pdf', 5 * 1024 * 1024 + 1),
    ],
    ['arquivo vazio', arquivo('vazio.pdf', 'application/pdf', 0)],
  ])('recusa %s', (_nome, invalido) => {
    const { anexos, erro } = anexosDeclarados(lista(invalido));

    expect(anexos).toEqual([]);
    expect(erro).not.toBeNull();
  });

  it('aceita exatamente 5 MB', () => {
    const limite = arquivo('limite.pdf', 'application/pdf', 5 * 1024 * 1024);
    expect(anexosDeclarados(lista(limite)).erro).toBeNull();
  });

  /** Um invalido no meio recusa o envio inteiro: aceitar so os validos deixaria
   * a pessoa achando que mandou tudo. */
  it('um invalido recusa o envio inteiro', () => {
    const grande = arquivo('grande.pdf', 'application/pdf', 9_000_000);
    expect(anexosDeclarados(lista(PDF, grande)).anexos).toEqual([]);
  });
});
