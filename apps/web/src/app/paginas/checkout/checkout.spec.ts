import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import type {
  CheckoutIniciado,
  NovoCheckout,
  SituacaoCheckout,
} from 'shared/esquemas/checkout';
import { VERSAO_TERMOS_CHECKOUT } from 'shared/termos-checkout';
import { ApiCheckoutService } from '../../autenticacao/api-checkout.service';
import { AppCheckService } from '../../autenticacao/app-check';
import { CarrinhoService } from '../../publico/carrinho.service';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { Checkout, INTERVALO_INICIAL_MS, NAVEGAR_PARA_FORA } from './checkout';
import { TEXTOS_CHECKOUT } from './textos';

const PIX: CheckoutIniciado = {
  checkoutId: 'checkout-1',
  metodo: 'pix',
  totalCentavos: 370_000,
  pix: {
    brCode: '00020101PIX',
    brCodeBase64: 'data:image/png;base64,AAAA',
    expiraEm: '2026-09-14T15:30:00.000Z',
  },
};

interface Cenario {
  fixture: ComponentFixture<Checkout>;
  iniciados: NovoCheckout[];
  consultas: string[];
  destinos: string[];
  carrinho: CarrinhoService;
  situacoes: (SituacaoCheckout | Error)[];
}

interface Opcoes {
  liberado?: boolean;
  itens?: number;
  retorno?: string | null;
  resposta?: CheckoutIniciado | Error | HttpErrorResponse;
}

async function montar(opcoes: Opcoes = {}): Promise<Cenario> {
  localStorage.clear();
  const iniciados: NovoCheckout[] = [];
  const consultas: string[] = [];
  const destinos: string[] = [];
  const situacoes: (SituacaoCheckout | Error)[] = [];
  const liberado = opcoes.liberado ?? true;

  TestBed.configureTestingModule({
    imports: [Checkout],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (nome: string) =>
                nome === 'id' ? (opcoes.retorno ?? null) : null,
            },
          },
        },
      },
      {
        provide: PreCadastroService,
        useValue: {
          liberado: signal(liberado),
          token: () => (liberado ? 'lead.segredo' : null),
        },
      },
      { provide: AppCheckService, useValue: { preparar: () => undefined } },
      {
        provide: ApiCheckoutService,
        useValue: {
          iniciar: (dados: NovoCheckout, token: string) => {
            iniciados.push(dados);
            expect(token).toBe('lead.segredo');
            const resposta = opcoes.resposta ?? PIX;
            /* `HttpErrorResponse` nao estende `Error`: a checagem e pela forma. */
            return 'checkoutId' in resposta
              ? Promise.resolve(resposta)
              : Promise.reject(resposta);
          },
          situacao: (id: string) => {
            consultas.push(id);
            const proxima = situacoes.shift() ?? {
              estado: 'aguardando_pagamento',
            };
            return proxima instanceof Error
              ? Promise.reject(proxima)
              : Promise.resolve(proxima);
          },
        },
      },
      {
        provide: NAVEGAR_PARA_FORA,
        useValue: (url: string) => destinos.push(url),
      },
    ],
  });

  jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const carrinho = TestBed.inject(CarrinhoService);
  for (let i = 0; i < (opcoes.itens ?? 2); i += 1) {
    carrinho.adicionar({
      id: `produto-${String(i)}`,
      nome: `Servico ${String(i)}`,
      descricao: 'x',
      precoCentavos: 100_000,
      entregaveis: ['x'],
      quantidadeReunioes: 1,
      numeroRevisoesPermitidas: 1,
    });
  }

  const fixture = TestBed.createComponent(Checkout);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, iniciados, consultas, destinos, carrinho, situacoes };
}

function texto(fixture: ComponentFixture<Checkout>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

interface Interno {
  formulario: { setValue: (v: Record<string, unknown>) => void };
  pagar: () => Promise<void>;
  copiar: () => Promise<void>;
  gerarNovo: () => void;
  horario: (iso: string | undefined) => string;
}

function interno(fixture: ComponentFixture<Checkout>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

async function pagarCom(
  cenario: Cenario,
  metodo: 'pix' | 'cartao' = 'pix',
): Promise<void> {
  interno(cenario.fixture).formulario.setValue({
    nome: 'Ana Ribeiro',
    email: 'ana@empresa.com.br',
    metodo,
    aceite: true,
  });
  await interno(cenario.fixture).pagar();
  cenario.fixture.detectChanges();
}

/** Avanca o relogio falso e deixa as promessas do polling assentarem. */
async function passar(cenario: Cenario, ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  cenario.fixture.detectChanges();
}

describe('Checkout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('antes de pagar', () => {
    /** Regra inviolavel 10: a rota publica nao toca a API ao abrir. */
    it('nao chama a API ao carregar', async () => {
      const cenario = await montar();
      await passar(cenario, 60_000);

      expect(cenario.iniciados).toEqual([]);
      expect(cenario.consultas).toEqual([]);
    });

    it('sem pre-cadastro, pede o cadastro', async () => {
      const cenario = await montar({ liberado: false });

      expect(texto(cenario.fixture)).toContain(
        TEXTOS_CHECKOUT.semLiberacao.titulo,
      );
    });

    it('sem itens, manda de volta para os servicos', async () => {
      const cenario = await montar({ itens: 0 });

      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.vazio.titulo);
    });

    it('mostra os itens, o total estimado e os termos ampliados', async () => {
      const cenario = await montar();

      const conteudo = texto(cenario.fixture).replace(/\s/g, ' ');
      expect(conteudo).toContain('Servico 0');
      expect(conteudo).toContain('R$ 2.000,00');
      expect(conteudo).toContain('Escopo, entregáveis e condições da oferta');
      expect(conteudo).not.toContain('TODO');
    });

    it('formulario invalido nao envia e pede o aceite', async () => {
      const cenario = await montar();
      interno(cenario.fixture).formulario.setValue({
        nome: 'Ana Ribeiro',
        email: 'ana@empresa.com.br',
        metodo: 'pix',
        aceite: false,
      });

      await interno(cenario.fixture).pagar();
      cenario.fixture.detectChanges();

      expect(cenario.iniciados).toEqual([]);
      expect(texto(cenario.fixture)).toContain(
        TEXTOS_CHECKOUT.formulario.aceiteObrigatorio,
      );
    });

    it('mostra os erros dos campos quando tocados', async () => {
      const cenario = await montar();

      await interno(cenario.fixture).pagar();
      cenario.fixture.detectChanges();

      expect(texto(cenario.fixture)).toContain('Informe o nome completo.');
    });
  });

  describe('PIX', () => {
    /**
     * O NAVEGADOR MANDA IDS, nunca precos, e a versao do termo que mostrou. A
     * chave do carrinho e o que faz a retentativa devolver a mesma cobranca.
     */
    it('envia ids, a versao dos termos e a chave do carrinho', async () => {
      const cenario = await montar();

      await pagarCom(cenario);

      expect(cenario.iniciados).toEqual([
        {
          itens: [{ produtoId: 'produto-0' }, { produtoId: 'produto-1' }],
          metodo: 'pix',
          comprador: { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' },
          termosVersao: VERSAO_TERMOS_CHECKOUT,
          chaveDoCarrinho: cenario.carrinho.chave(),
        },
      ]);
    });

    it('mostra o QR e o codigo copia-e-cola', async () => {
      const cenario = await montar();

      await pagarCom(cenario);

      const imagem = (
        cenario.fixture.nativeElement as HTMLElement
      ).querySelector('img.checkout__qr');
      expect(imagem?.getAttribute('src')).toBe(
        PIX.metodo === 'pix' ? PIX.pix.brCodeBase64 : '',
      );
      expect(
        (cenario.fixture.nativeElement as HTMLElement).querySelector('textarea')
          ?.value,
      ).toBe('00020101PIX');
    });

    it('acompanha ate o pagamento e esvazia o carrinho', async () => {
      const cenario = await montar();
      await pagarCom(cenario);
      cenario.situacoes.push(
        { estado: 'aguardando_pagamento' },
        { estado: 'pago' },
      );

      await passar(cenario, INTERVALO_INICIAL_MS);
      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.pix.titulo);

      await passar(cenario, INTERVALO_INICIAL_MS * 2);

      expect(cenario.consultas).toEqual(['checkout-1', 'checkout-1']);
      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.pago.titulo);
      expect(cenario.carrinho.quantidade()).toBe(0);
    });

    /** Falha de rede nao encerra o acompanhamento: a pessoa pode ter pago. */
    it('continua consultando depois de uma falha', async () => {
      const cenario = await montar();
      await pagarCom(cenario);
      cenario.situacoes.push(new Error('rede'), { estado: 'pago' });

      await passar(cenario, INTERVALO_INICIAL_MS);
      await passar(cenario, INTERVALO_INICIAL_MS * 2);

      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.pago.titulo);
    });

    it.each(['expirado', 'substituido', 'falhou_cobranca'] as const)(
      'cobranca %s oferece gerar outra e volta ao formulario',
      async (estado) => {
        const cenario = await montar();
        await pagarCom(cenario);
        cenario.situacoes.push({ estado });

        await passar(cenario, INTERVALO_INICIAL_MS);
        expect(texto(cenario.fixture)).toContain(
          TEXTOS_CHECKOUT.vencido.titulo,
        );

        interno(cenario.fixture).gerarNovo();
        cenario.fixture.detectChanges();
        expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.resumo.titulo);
      },
    );

    it('copia o codigo e avisa', async () => {
      const cenario = await montar();
      const escrita = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: escrita } });
      await pagarCom(cenario);

      await interno(cenario.fixture).copiar();
      cenario.fixture.detectChanges();

      expect(escrita).toHaveBeenCalledWith('00020101PIX');
      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.pix.copiado);
    });

    it('sem area de transferencia, nao lanca', async () => {
      const cenario = await montar();
      Object.assign(navigator, {
        clipboard: { writeText: () => Promise.reject(new Error('negado')) },
      });
      await pagarCom(cenario);

      await expect(interno(cenario.fixture).copiar()).resolves.toBeUndefined();
    });

    it('copiar sem PIX nao faz nada', async () => {
      const cenario = await montar();

      await expect(interno(cenario.fixture).copiar()).resolves.toBeUndefined();
    });

    it('para o polling ao sair da pagina', async () => {
      const cenario = await montar();
      await pagarCom(cenario);

      cenario.fixture.destroy();
      await jest.advanceTimersByTimeAsync(INTERVALO_INICIAL_MS * 10);

      expect(cenario.consultas).toEqual([]);
    });
  });

  describe('cartao', () => {
    /** O cartao e processado na pagina do gateway (ADR-19). */
    it('leva a pessoa para a pagina do gateway', async () => {
      const cenario = await montar({
        resposta: {
          checkoutId: 'checkout-2',
          metodo: 'cartao',
          totalCentavos: 200_000,
          url: 'https://pagamento.test/bill_1',
        },
      });

      await pagarCom(cenario, 'cartao');

      expect(cenario.destinos).toEqual(['https://pagamento.test/bill_1']);
      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.redirecionando);
    });

    /** Voltar do gateway nao confirma nada: a tela acompanha o que o webhook gravou. */
    it('ao voltar com ?id=, acompanha o estado ate o pagamento', async () => {
      const cenario = await montar({ retorno: 'checkout-2' });
      expect(texto(cenario.fixture)).toContain(
        TEXTOS_CHECKOUT.aguardando.titulo,
      );

      cenario.situacoes.push({ estado: 'pago' });
      await passar(cenario, INTERVALO_INICIAL_MS);

      expect(cenario.consultas).toEqual(['checkout-2']);
      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.pago.titulo);
    });

    it('ao voltar sem pre-cadastro, nao consulta nada', async () => {
      const cenario = await montar({ retorno: 'checkout-2', liberado: false });
      await passar(cenario, INTERVALO_INICIAL_MS * 3);

      expect(cenario.consultas).toEqual([]);
      expect(texto(cenario.fixture)).toContain(
        TEXTOS_CHECKOUT.semLiberacao.titulo,
      );
    });
  });

  describe('recusas do servidor', () => {
    function http(status: number, corpo: unknown): HttpErrorResponse {
      return new HttpErrorResponse({ status, error: corpo });
    }

    it.each([
      [
        409,
        { message: 'Nao e possivel concluir a compra com este e-mail.' },
        'Nao e possivel concluir a compra com este e-mail.',
      ],
      [
        422,
        { message: 'Os termos foram atualizados.' },
        'Os termos foram atualizados.',
      ],
      [422, {}, TEXTOS_CHECKOUT.falhas.generica],
      [401, {}, TEXTOS_CHECKOUT.falhas.liberacaoVencida],
      [429, {}, TEXTOS_CHECKOUT.falhas.excesso],
      [
        503,
        { message: 'detalhe interno' },
        TEXTOS_CHECKOUT.falhas.indisponivel,
      ],
      [500, { message: 'stack trace' }, TEXTOS_CHECKOUT.falhas.generica],
      [
        400,
        { erros: { itens: 'O carrinho esta vazio.' } },
        TEXTOS_CHECKOUT.falhas.generica,
      ],
    ])('HTTP %i mostra a mensagem certa', async (status, corpo, esperado) => {
      const cenario = await montar({ resposta: http(status, corpo) });

      await pagarCom(cenario);

      expect(texto(cenario.fixture)).toContain(esperado);
    });

    it('400 de campo do comprador aparece no campo', async () => {
      const cenario = await montar({
        resposta: http(400, {
          erros: { 'comprador.email': 'E-mail recusado.' },
        }),
      });

      await pagarCom(cenario);

      expect(texto(cenario.fixture)).toContain('E-mail recusado.');
      expect(texto(cenario.fixture)).not.toContain(
        TEXTOS_CHECKOUT.falhas.generica,
      );
    });

    it('erro que nao e HTTP vira a mensagem generica', async () => {
      const cenario = await montar({ resposta: new Error('boom') });

      await pagarCom(cenario);

      expect(texto(cenario.fixture)).toContain(TEXTOS_CHECKOUT.falhas.generica);
    });
  });

  it('horario ilegivel vira texto vazio', async () => {
    const cenario = await montar();

    expect(interno(cenario.fixture).horario('nao e data')).toBe('');
    expect(interno(cenario.fixture).horario(undefined)).toBe('');
    expect(
      interno(cenario.fixture).horario(
        PIX.metodo === 'pix' ? PIX.pix.expiraEm : '',
      ),
    ).toMatch(/^\d{2}:\d{2}$/);
  });
});
