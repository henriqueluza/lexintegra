import {
  congelarProduto,
  esquemaNovoProduto,
  esquemaSituacao,
  SITUACOES_PRODUTO,
  TETO_ENTREGAVEIS_POR_PRODUTO,
  type NovoProduto,
  type ProdutoResumo,
} from './produto.js';

const VALIDO: NovoProduto = {
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: ['Reuna os contratos de trabalho vigentes.'],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 7,
  numeroRevisoesPermitidas: 2,
  parcelas: 3,
};

describe('esquemaNovoProduto', () => {
  it('aceita um produto valido', () => {
    expect(esquemaNovoProduto.parse(VALIDO)).toEqual(VALIDO);
  });

  it('apara nome, descricao e cada item das listas', () => {
    const analisado = esquemaNovoProduto.parse({
      ...VALIDO,
      nome: '  Parecer Juridico Trabalhista  ',
      descricao: '  Analise de risco trabalhista com recomendacoes.  ',
      entregaveis: ['  Parecer em PDF  '],
      textosOrientativos: ['  Reuna os contratos.  '],
    });

    expect(analisado.nome).toBe('Parecer Juridico Trabalhista');
    expect(analisado.descricao).toBe(
      'Analise de risco trabalhista com recomendacoes.',
    );
    expect(analisado.entregaveis).toEqual(['Parecer em PDF']);
    expect(analisado.textosOrientativos).toEqual(['Reuna os contratos.']);
  });

  it('aceita zero reunioes e zero revisoes', () => {
    const analisado = esquemaNovoProduto.parse({
      ...VALIDO,
      quantidadeReunioes: 0,
      intervaloMinimoReunioesDias: 0,
      numeroRevisoesPermitidas: 0,
    });

    expect(analisado.quantidadeReunioes).toBe(0);
    expect(analisado.numeroRevisoesPermitidas).toBe(0);
  });

  /**
   * Produto gravado antes de `parcelas`, e snapshot de checkout aberto antes
   * dele, chegam sem o campo. `PedidosService.preparar` revalida o snapshot com
   * este schema: sem o padrao, um pagamento confirmado depois do deploy viraria
   * erro em vez de pedido.
   */
  it('assume parcela unica quando o campo nao vem', () => {
    const { parcelas: _parcelas, ...semParcelas } = VALIDO;
    expect(esquemaNovoProduto.parse(semParcelas).parcelas).toBe(1);
  });

  it('aceita de 1 a 12 parcelas', () => {
    expect(esquemaNovoProduto.parse({ ...VALIDO, parcelas: 1 }).parcelas).toBe(
      1,
    );
    expect(
      esquemaNovoProduto.parse({ ...VALIDO, parcelas: 12 }).parcelas,
    ).toBe(12);
  });

  it('aceita produto sem texto orientativo', () => {
    expect(
      esquemaNovoProduto.parse({ ...VALIDO, textosOrientativos: [] })
        .textosOrientativos,
    ).toEqual([]);
  });

  /** O Plano Prime de 12 meses do catalogo inicial tem 59. */
  it('aceita ate sessenta entregaveis', () => {
    expect(TETO_ENTREGAVEIS_POR_PRODUTO).toBe(60);
    expect(
      esquemaNovoProduto.safeParse({
        ...VALIDO,
        entregaveis: Array(60).fill('Parecer'),
      }).success,
    ).toBe(true);
  });

  /**
   * O preco e inteiro em CENTAVOS. Um decimal aqui significa que alguem digitou
   * reais, e o snapshot do pedido (5.3) carregaria o engano congelado para sempre.
   */
  it.each([
    ['preco decimal', { precoCentavos: 2500.5 }],
    ['preco zero', { precoCentavos: 0 }],
    ['preco negativo', { precoCentavos: -1 }],
    ['preco acima do teto', { precoCentavos: 100_000_001 }],
    ['preco como texto', { precoCentavos: '250000' }],
    ['nome curto', { nome: 'Pa' }],
    ['nome so com espaco', { nome: '     ' }],
    ['nome longo', { nome: 'a'.repeat(121) }],
    ['descricao curta', { descricao: 'curta' }],
    ['sem entregavel', { entregaveis: [] }],
    ['entregavel vazio', { entregaveis: ['  '] }],
    ['entregaveis demais', { entregaveis: Array(61).fill('Parecer') }],
    ['reunioes negativas', { quantidadeReunioes: -1 }],
    ['reunioes fracionadas', { quantidadeReunioes: 1.5 }],
    ['prazo zero', { prazoValidadeReunioesDias: 0 }],
    ['prazo acima do teto', { prazoValidadeReunioesDias: 3651 }],
    ['intervalo negativo', { intervaloMinimoReunioesDias: -1 }],
    ['revisoes negativas', { numeroRevisoesPermitidas: -1 }],
    ['revisoes fracionadas', { numeroRevisoesPermitidas: 0.5 }],
    ['zero parcelas', { parcelas: 0 }],
    ['parcelas fracionadas', { parcelas: 2.5 }],
    ['parcelas acima do painel do AbacatePay', { parcelas: 13 }],
  ])('recusa %s', (_caso, alteracao) => {
    expect(
      esquemaNovoProduto.safeParse({ ...VALIDO, ...alteracao }).success,
    ).toBe(false);
  });

  it.each([
    ['corpo vazio', {}],
    ['corpo nulo', null],
    ['sem preco', { ...VALIDO, precoCentavos: undefined }],
  ])('recusa %s', (_caso, entrada) => {
    expect(esquemaNovoProduto.safeParse(entrada).success).toBe(false);
  });

  /**
   * O `ZodPipe` monta a resposta 400 indexada por `path`, e a tela do
   * administrador mostra cada mensagem embaixo do seu campo. Um schema que
   * reportasse tudo na raiz deixaria o formulario sem onde pendurar o erro.
   */
  it('reporta o erro no campo certo, para a tela mostrar embaixo dele', () => {
    const resultado = esquemaNovoProduto.safeParse({
      ...VALIDO,
      precoCentavos: -1,
      entregaveis: [],
    });

    const campos = (resultado.error?.issues ?? [])
      .map((problema) => problema.path.join('.'))
      .sort();

    expect(campos).toEqual(['entregaveis', 'precoCentavos']);
  });

  /**
   * `ativo` fica FORA do schema. Se entrasse pelo corpo, um `PUT` de edicao de
   * preco reativaria em silencio um produto tirado do ar de proposito — e a
   * ativacao e recurso proprio na API justamente para nao ser campo digitavel.
   */
  it('descarta ativo e qualquer campo fora do schema', () => {
    const analisado = esquemaNovoProduto.parse({
      ...VALIDO,
      ativo: true,
      criadoPor: 'uid-invasor',
      id: 'produto-forjado',
    });

    expect(analisado).toEqual(VALIDO);
    expect('ativo' in analisado).toBe(false);
  });
});

describe('esquemaSituacao', () => {
  it.each(SITUACOES_PRODUTO)('aceita a situacao %s', (situacao) => {
    expect(esquemaSituacao.parse(situacao)).toBe(situacao);
  });

  /**
   * Filtro vem de query string, que e texto livre do navegador. Cair em `todos`
   * em vez de estourar 400 mantem a tela do administrador utilizavel com um link
   * digitado errado; a consulta continua sendo uma das tres conhecidas.
   */
  it.each([
    ['ausente', undefined],
    ['desconhecida', 'arquivados'],
    ['numero', 7],
  ])('cai em todos quando a situacao e %s', (_caso, entrada) => {
    expect(esquemaSituacao.parse(entrada)).toBe('todos');
  });
});

describe('congelarProduto', () => {
  const RESUMO: ProdutoResumo = {
    id: 'produto-1',
    ativo: true,
    criadoEm: '2026-09-05T12:00:00.000Z',
    atualizadoEm: '2026-09-05T12:00:00.000Z',
    ...VALIDO,
  };

  it('copia os dez campos do produto', () => {
    expect(congelarProduto(RESUMO)).toEqual(VALIDO);
  });

  /**
   * A razao de a funcao listar campo a campo em vez de espalhar o objeto: um
   * spread levaria `id`, `ativo` e os carimbos para dentro do pedido, e o pedido
   * passaria a carregar estado administrativo congelado que ninguem pediu.
   */
  /**
   * Documento gravado antes de `parcelas` nao tem o campo, e o Firestore recusa
   * `undefined`: sem normalizar aqui, levar um produto antigo ao carrinho
   * derrubaria a gravacao do checkout.
   */
  it('normaliza parcelas ausentes para 1', () => {
    const { parcelas: _parcelas, ...antigo } = RESUMO;
    expect(congelarProduto(antigo).parcelas).toBe(1);
  });

  it('nao leva id, ativo nem carimbos para o snapshot', () => {
    const snapshot = congelarProduto(RESUMO) as Record<string, unknown>;

    for (const campo of ['id', 'ativo', 'criadoEm', 'atualizadoEm']) {
      expect(campo in snapshot).toBe(false);
    }
  });

  /**
   * Snapshot e imutavel por contrato (regra inviolavel 5). Se as listas fossem a
   * mesma referencia do produto, editar o catalogo mutaria o pedido em memoria —
   * a falha exata que o snapshot existe para impedir, e a mais dificil de ver.
   */
  it('copia as listas em vez de compartilhar a referencia', () => {
    const snapshot = congelarProduto(RESUMO);

    expect(snapshot.entregaveis).not.toBe(RESUMO.entregaveis);
    expect(snapshot.textosOrientativos).not.toBe(RESUMO.textosOrientativos);
    expect(snapshot.entregaveis).toEqual(RESUMO.entregaveis);
  });
});
