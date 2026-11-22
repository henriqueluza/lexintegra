import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import { CarrinhoService, CHAVE_CARRINHO } from './carrinho.service';

const PARECER: ProdutoVitrine = {
  id: 'produto-parecer',
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  quantidadeReunioes: 2,
  numeroRevisoesPermitidas: 2,
  parcelas: 1,
  tipoCobranca: 'assinatura',
  descricaoDetalhada: '',
};

const CONTRATO: ProdutoVitrine = {
  ...PARECER,
  id: 'produto-contrato',
  nome: 'Revisao de contrato',
  precoCentavos: 120_000,
};

function montar(plataforma: 'browser' | 'server' = 'browser'): CarrinhoService {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: plataforma }],
  });
  return TestBed.inject(CarrinhoService);
}

/** Dispara o `afterNextRender`, que e onde o armazenamento e lido. */
function hidratar(): void {
  TestBed.tick();
}

function guardado(): unknown {
  const bruto = localStorage.getItem(CHAVE_CARRINHO);
  return bruto === null ? null : JSON.parse(bruto);
}

describe('CarrinhoService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => jest.restoreAllMocks());

  it('comeca vazio, sem chave', () => {
    const carrinho = montar();

    expect(carrinho.itens()).toEqual([]);
    expect(carrinho.quantidade()).toBe(0);
    expect(carrinho.chave()).toBeNull();
    expect(carrinho.totalIndicativoCentavos()).toBe(0);
  });

  it('acrescenta e soma o total indicativo', () => {
    const carrinho = montar();

    carrinho.adicionar(PARECER);
    carrinho.adicionar(CONTRATO);

    expect(carrinho.quantidade()).toBe(2);
    expect(carrinho.totalIndicativoCentavos()).toBe(370_000);
    expect(carrinho.itens().map((item) => item.produtoId)).toEqual([
      'produto-parecer',
      'produto-contrato',
    ]);
  });

  /** Dois itens iguais sao dois pedidos (arquitetura 5.4). */
  it('aceita o mesmo produto duas vezes', () => {
    const carrinho = montar();

    carrinho.adicionar(PARECER);
    carrinho.adicionar(PARECER);

    expect(carrinho.quantidade()).toBe(2);
  });

  it('cria a chave no primeiro item e a mantem nos seguintes', () => {
    const carrinho = montar();

    carrinho.adicionar(PARECER);
    const chave = carrinho.chave();
    carrinho.adicionar(CONTRATO);

    expect(chave).toMatch(/^[0-9a-f-]{36}$/);
    expect(carrinho.chave()).toBe(chave);
  });

  it('para no teto e avisa que nao acrescentou', () => {
    const carrinho = montar();

    for (let i = 0; i < 10; i += 1) {
      expect(carrinho.adicionar(PARECER)).toBe(true);
    }

    expect(carrinho.cheio()).toBe(true);
    expect(carrinho.adicionar(CONTRATO)).toBe(false);
    expect(carrinho.quantidade()).toBe(10);
  });

  it('remove por posicao, e nao todos os iguais', () => {
    const carrinho = montar();
    carrinho.adicionar(PARECER);
    carrinho.adicionar(CONTRATO);
    carrinho.adicionar(PARECER);

    carrinho.remover(0);

    expect(carrinho.itens().map((item) => item.produtoId)).toEqual([
      'produto-contrato',
      'produto-parecer',
    ]);
  });

  it('remover sem carrinho nao faz nada', () => {
    const carrinho = montar();

    carrinho.remover(0);

    expect(carrinho.itens()).toEqual([]);
  });

  /**
   * Tirar o ultimo item encerra o carrinho: a proxima compra e outra compra, e
   * reaproveitar a chave faria o servidor confundi-la com a anterior.
   */
  it('tirar o ultimo item esvazia e descarta a chave', () => {
    const carrinho = montar();
    carrinho.adicionar(PARECER);

    carrinho.remover(0);

    expect(carrinho.chave()).toBeNull();
    expect(guardado()).toBeNull();
  });

  it('esvaziar gera chave nova na compra seguinte', () => {
    const carrinho = montar();
    carrinho.adicionar(PARECER);
    const primeira = carrinho.chave();

    carrinho.esvaziar();
    carrinho.adicionar(PARECER);

    expect(carrinho.chave()).not.toBe(primeira);
  });

  it('guarda no navegador', () => {
    const carrinho = montar();

    carrinho.adicionar(PARECER);

    expect(guardado()).toEqual({
      chave: carrinho.chave(),
      itens: [
        {
          produtoId: 'produto-parecer',
          nome: 'Parecer de risco trabalhista',
          precoCentavos: 250_000,
          parcelas: 1,
          tipoCobranca: 'assinatura',
        },
      ],
    });
  });

  /**
   * O resumo do checkout anuncia o MENOR parcelamento do carrinho: o maior
   * prometeria a um item mais parcelas do que o escritorio oferece para ele.
   */
  it('anuncia o menor parcelamento entre os itens', () => {
    const carrinho = montar();
    expect(carrinho.parcelasNoCartao()).toBe(1);

    carrinho.adicionar({ ...PARECER, parcelas: 12 });
    expect(carrinho.parcelasNoCartao()).toBe(12);

    carrinho.adicionar({ ...CONTRATO, parcelas: 3 });
    expect(carrinho.parcelasNoCartao()).toBe(3);
  });

  /**
   * PARCELAMENTO SO EM ASSINATURA (ajuste 11) e o carrinho misto (decisao de
   * 18/11/2026): com um servico avulso entre os itens a compra inteira vai a
   * vista. E a mesma conta que o servidor manda ao gateway como teto.
   */
  describe('tipo de cobranca', () => {
    const PLANO: ProdutoVitrine = { ...PARECER, parcelas: 12 };
    const AVULSO: ProdutoVitrine = {
      ...CONTRATO,
      tipoCobranca: 'avulso',
      parcelas: 1,
    };

    it('um avulso leva o carrinho inteiro para a vista, e avisa', () => {
      const carrinho = montar();
      carrinho.adicionar(PLANO);
      expect(carrinho.parcelasNoCartao()).toBe(12);
      expect(carrinho.avulsoImpedeParcelamento()).toBe(false);

      carrinho.adicionar(AVULSO);
      expect(carrinho.parcelasNoCartao()).toBe(1);
      expect(carrinho.avulsoImpedeParcelamento()).toBe(true);

      carrinho.remover(1);
      expect(carrinho.parcelasNoCartao()).toBe(12);
      expect(carrinho.avulsoImpedeParcelamento()).toBe(false);
    });

    it('so avulsos: a vista, sem aviso', () => {
      const carrinho = montar();
      carrinho.adicionar(AVULSO);

      expect(carrinho.parcelasNoCartao()).toBe(1);
      expect(carrinho.avulsoImpedeParcelamento()).toBe(false);
    });

    it('guarda o tipo com o item', () => {
      const carrinho = montar();
      carrinho.adicionar(AVULSO);

      expect(carrinho.itens()[0]?.tipoCobranca).toBe('avulso');
      expect(
        (
          JSON.parse(localStorage.getItem(CHAVE_CARRINHO) ?? '{}') as {
            itens: { tipoCobranca: string }[];
          }
        ).itens[0]?.tipoCobranca,
      ).toBe('avulso');
    });

    /** A API anterior ao campo nao o manda: o item entra como nao classificado. */
    it('produto sem tipo entra como nao classificado e segue as parcelas', () => {
      const carrinho = montar();
      const { tipoCobranca: _tipo, ...antigo } = PLANO;
      carrinho.adicionar(antigo as ProdutoVitrine);

      expect(carrinho.itens()[0]?.tipoCobranca).toBeNull();
      expect(carrinho.parcelasNoCartao()).toBe(12);
    });
  });

  it('trata carrinho guardado antes das parcelas como pagamento a vista', () => {
    localStorage.setItem(
      CHAVE_CARRINHO,
      JSON.stringify({
        chave: 'chave-1',
        itens: [{ produtoId: 'p', nome: 'P', precoCentavos: 100 }],
      }),
    );
    const carrinho = montar();

    hidratar();

    expect(carrinho.quantidade()).toBe(1);
    expect(carrinho.parcelasNoCartao()).toBe(1);
  });

  it('restaura depois da hidratacao', () => {
    localStorage.setItem(
      CHAVE_CARRINHO,
      JSON.stringify({
        chave: 'chave-1',
        itens: [{ produtoId: 'p', nome: 'P', precoCentavos: 100 }],
      }),
    );
    const carrinho = montar();

    hidratar();

    expect(carrinho.chave()).toBe('chave-1');
    expect(carrinho.quantidade()).toBe(1);
  });

  it.each([
    ['JSON invalido', '{nao e json'],
    ['sem chave', JSON.stringify({ itens: [] })],
    ['chave vazia', JSON.stringify({ chave: '', itens: [] })],
    ['sem itens', JSON.stringify({ chave: 'c', itens: [] })],
    ['itens que nao sao lista', JSON.stringify({ chave: 'c', itens: {} })],
    /*
     * Um item ruim descarta o carrinho inteiro: pular so ele levaria a pessoa a
     * pagar por uma lista diferente da que montou.
     */
    [
      'um item malformado',
      JSON.stringify({
        chave: 'c',
        itens: [
          { produtoId: 'p', nome: 'P', precoCentavos: 100 },
          { produtoId: 'q', nome: 'Q', precoCentavos: '100' },
        ],
      }),
    ],
    [
      'preco fracionado',
      JSON.stringify({
        chave: 'c',
        itens: [{ produtoId: 'p', nome: 'P', precoCentavos: 10.5 }],
      }),
    ],
    [
      'produto sem id',
      JSON.stringify({
        chave: 'c',
        itens: [{ produtoId: '', nome: 'P', precoCentavos: 100 }],
      }),
    ],
    ['item nulo', JSON.stringify({ chave: 'c', itens: [null] })],
    [
      'parcelas acima do painel',
      JSON.stringify({
        chave: 'c',
        itens: [{ produtoId: 'p', nome: 'P', precoCentavos: 100, parcelas: 13 }],
      }),
    ],
    [
      'parcelas fracionadas',
      JSON.stringify({
        chave: 'c',
        itens: [{ produtoId: 'p', nome: 'P', precoCentavos: 100, parcelas: 1.5 }],
      }),
    ],
    [
      'tipo de cobranca desconhecido',
      JSON.stringify({
        chave: 'c',
        itens: [
          {
            produtoId: 'p',
            nome: 'P',
            precoCentavos: 100,
            tipoCobranca: 'recorrente',
          },
        ],
      }),
    ],
  ])('descarta o guardado com %s', (_caso, bruto) => {
    localStorage.setItem(CHAVE_CARRINHO, bruto);
    const carrinho = montar();

    hidratar();

    expect(carrinho.itens()).toEqual([]);
  });

  it('corta no teto o que vier acima dele', () => {
    const item = { produtoId: 'p', nome: 'P', precoCentavos: 100 };
    localStorage.setItem(
      CHAVE_CARRINHO,
      JSON.stringify({
        chave: 'c',
        itens: Array.from({ length: 12 }, () => item),
      }),
    );
    const carrinho = montar();

    hidratar();

    expect(carrinho.quantidade()).toBe(10);
  });

  it('sobrevive a armazenamento bloqueado, sem lancar', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const carrinho = montar();

    hidratar();
    carrinho.adicionar(PARECER);
    expect(carrinho.quantidade()).toBe(1);

    carrinho.esvaziar();
    expect(carrinho.quantidade()).toBe(0);
  });

  /** Pre-renderizacao em Node: nao ha armazenamento, e nada pode lancar. */
  it('no servidor, nao toca o armazenamento', () => {
    const leitura = jest.spyOn(Storage.prototype, 'getItem');
    const escrita = jest.spyOn(Storage.prototype, 'setItem');
    const remocao = jest.spyOn(Storage.prototype, 'removeItem');
    const carrinho = montar('server');

    hidratar();
    carrinho.adicionar(PARECER);
    carrinho.esvaziar();

    expect(leitura).not.toHaveBeenCalled();
    expect(escrita).not.toHaveBeenCalled();
    expect(remocao).not.toHaveBeenCalled();
  });
});
