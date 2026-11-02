import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { ProdutoVitrine } from 'shared';
import { CatalogoService } from '../../../publico/catalogo.service';
import { TEXTOS } from '../textos';
import { Servicos } from './servicos';

const PARECER: ProdutoVitrine = {
  id: 'produto-1',
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnóstico das rotinas atuais, em ordem de prioridade.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF', 'Plano de ação'],
  quantidadeReunioes: 2,
  numeroRevisoesPermitidas: 2,
  parcelas: 1,
};

const liberado = signal(false);
let pedidos = 0;
let resposta: ProdutoVitrine[] | Error = [PARECER];

function montar(): ComponentFixture<Servicos> {
  liberado.set(false);
  pedidos = 0;
  localStorage.clear();

  TestBed.configureTestingModule({
    imports: [Servicos],
    providers: [
      {
        provide: CatalogoService,
        useValue: {
          liberado,
          listar: () => {
            pedidos += 1;
            return resposta instanceof Error
              ? Promise.reject(resposta)
              : Promise.resolve(resposta);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(Servicos);
  fixture.detectChanges();
  return fixture;
}

async function liberar(fixture: ComponentFixture<Servicos>): Promise<void> {
  liberado.set(true);
  fixture.detectChanges();

  /*
   * Duas voltas: o efeito dispara a busca numa, e a resolucao (ou a rejeicao,
   * que passa pelo `finally`) chega na outra.
   */
  for (const _ of [0, 1]) {
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver, 0));
    fixture.detectChanges();
  }
}

function texto(fixture: ComponentFixture<Servicos>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('Servicos', () => {
  beforeEach(() => {
    resposta = [PARECER];
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('travado', () => {
    /**
     * REGRA INVIOLAVEL 10, e o coracao do criterio de aceite da etapa. Enquanto
     * nao ha pre-cadastro, nao existe requisicao — nem para contar servicos, nem
     * para pre-carregar. Com `min-instances = 0`, a primeira chamada custa de um
     * a tres segundos de cold start, e a pessoa ainda nao decidiu ficar.
     */
    it('nao pede a vitrine antes da liberacao', () => {
      montar();

      expect(pedidos).toBe(0);
    });

    it('mostra o aviso de cadeado e o caminho para o cadastro', () => {
      const fixture = montar();

      expect(texto(fixture)).toContain(TEXTOS.servicos.travado.titulo);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          'a[href="/cadastro"]',
        ),
      ).not.toBeNull();
    });

    it('identifica os exemplos como ilustração, sem preço fictício', () => {
      const fundo = (montar().nativeElement as HTMLElement).querySelector(
        '.trava__fundo',
      );
      expect(fundo?.textContent).toContain('Exemplo de serviço');
      expect(fundo?.textContent).not.toContain('R$');
    });

    it('nao mostra preco nenhum de verdade', () => {
      expect(texto(montar())).not.toContain('2.500');
    });
  });

  describe('liberado', () => {
    it('pede a vitrine assim que a liberacao chega', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(pedidos).toBe(1);
    });

    it('mostra nome, entregaveis e preco formatado', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).toContain('Parecer de risco trabalhista');
      expect(texto(fixture)).toContain('Plano de ação');
      expect(texto(fixture).replace(/\s/g, ' ')).toContain('R$ 2.500,00');
    });

    it('poe a parcela em destaque e o total menor, embaixo', async () => {
      resposta = [{ ...PARECER, precoCentavos: 708_000, parcelas: 12 }];
      const fixture = montar();

      await liberar(fixture);

      const rodape = (fixture.nativeElement as HTMLElement).querySelector(
        '.produto__rodape',
      );
      const preco = rodape?.querySelector('.produto__preco')?.textContent ?? '';
      const total = rodape?.querySelector('.produto__total')?.textContent ?? '';
      expect(preco.replace(/\s/g, ' ').trim()).toBe('12x de R$ 590,00');
      expect(total.replace(/\s/g, ' ').trim()).toBe('ou R$ 7.080,00 à vista');
    });

    it('sem parcelamento, mostra so o total, sem "1x de"', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).not.toContain('1x de');
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.produto__total'),
      ).toBeNull();
    });

    it('mostra as unidades repetidas numa linha so, com a quantidade', async () => {
      resposta = [
        {
          ...PARECER,
          entregaveis: [
            'Parecer em PDF',
            'Contrato personalizado (1 de 3)',
            'Contrato personalizado (2 de 3)',
            'Contrato personalizado (3 de 3)',
          ],
        },
      ];
      const fixture = montar();

      await liberar(fixture);

      const itens = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll(
          '.produto__entregaveis li',
        ),
      ].map((item) => item.textContent?.trim());
      expect(itens).toEqual([
        '1Parecer em PDF',
        '3Contratos personalizados',
        '2Reuniões',
        '2Revisões por entregável',
      ]);
      resposta = [PARECER];
    });

    it('mostra quantas reunioes e revisoes o servico inclui', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).toContain('2 reuniões');
      expect(texto(fixture)).toContain('Revisões por entregável');
    });

    it('some com o aviso de cadeado', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.trava'),
      ).toBeNull();
    });

    /**
     * Uma busca so. O efeito reage a um sinal, e sem a trava de `produtos()` cada
     * recalculo pediria a lista de novo — um laco de requisicoes contra o Cloud
     * Run, disparado por uma tela parada.
     */
    it('nao pede a vitrine mais de uma vez', async () => {
      const fixture = montar();

      await liberar(fixture);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(pedidos).toBe(1);
    });

    it('mostra o estado vazio quando nao ha servico publicado', async () => {
      resposta = [];
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).toContain(TEXTOS.servicos.vazio);
    });

    /**
     * O catalogo de producao nasce vazio (o escritorio o cria pelo painel), entao
     * este e o estado que o primeiro visitante real encontra. Ele precisa ser
     * anunciado ao leitor de tela, explicar o que fazer e nao oferecer o que nao
     * existe: nem busca, nem cartao, nem resumo de carrinho.
     */
    it('anuncia o vazio e nao oferece busca, cartao nem carrinho', async () => {
      resposta = [];
      const fixture = montar();

      await liberar(fixture);

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.vazio')?.getAttribute('role')).toBe('status');
      expect(texto(fixture)).toContain(TEXTOS.servicos.vazioApoio);
      expect(raiz.querySelector('input[type="search"]')).toBeNull();
      expect(raiz.querySelector('.produto')).toBeNull();
      expect(raiz.querySelector('.carrinho')).toBeNull();
    });

    /**
     * A causa nao vai para a tela. Um 401 aqui significa token vencido, e a
     * mensagem util e a mesma de uma falha de rede — distinguir os casos daria a
     * quem sonda um mapa dos estados do servidor.
     */
    /**
     * O laco que este teste encontrou: a primeira versao do efeito usava "nao tem
     * produtos" como condicao, e na falha ela continuava verdadeira — o efeito
     * refazia a busca para sempre, em rajada contra o Cloud Run, disparado por
     * uma tela parada. Quem tenta de novo agora e a pessoa, no botao.
     */
    it('nao refaz a busca sozinho depois de falhar', async () => {
      resposta = new Error('falha');
      const fixture = montar();

      await liberar(fixture);
      await new Promise((resolver) => setTimeout(resolver, 20));

      expect(pedidos).toBe(1);
    });

    it('tenta de novo quando a pessoa pede', async () => {
      resposta = new Error('falha');
      const fixture = montar();
      await liberar(fixture);

      resposta = [PARECER];
      (
        (fixture.nativeElement as HTMLElement).querySelector(
          '.falha button',
        ) as HTMLButtonElement
      ).click();
      await liberar(fixture);

      expect(pedidos).toBe(2);
      expect(texto(fixture)).toContain('Parecer de risco trabalhista');
    });

    it('mostra falha sem contar o motivo', async () => {
      resposta = new Error('401');
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).toContain(TEXTOS.servicos.falha);
      expect(texto(fixture)).not.toContain('401');
    });
  });

  /**
   * O carrinho (Etapa 8). Nao chama a API: o contador de `listar` e o unico
   * caminho de rede deste componente, e ele continua em um.
   */
  describe('carrinho', () => {
    function botoes(
      fixture: ComponentFixture<Servicos>,
      seletor: string,
    ): HTMLButtonElement[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(seletor),
      );
    }

    async function clicarAdicionar(
      fixture: ComponentFixture<Servicos>,
      vezes = 1,
    ): Promise<void> {
      for (let i = 0; i < vezes; i += 1) {
        botoes(fixture, '.produto__acao button')[0].click();
        fixture.detectChanges();
      }
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('nao mostra o resumo com o carrinho vazio', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.carrinho'),
      ).toBeNull();
    });

    it('acrescenta ao clicar e mostra o total estimado', async () => {
      const fixture = montar();
      await liberar(fixture);

      await clicarAdicionar(fixture, 2);

      const resumo = (fixture.nativeElement as HTMLElement).querySelector(
        '.carrinho',
      );
      expect(resumo?.textContent).toContain(TEXTOS.servicos.carrinho.titulo);
      expect(resumo?.textContent).toContain(
        `2 ${TEXTOS.servicos.carrinho.itens}`,
      );
      expect(resumo?.textContent?.replace(/\s/g, ' ')).toContain('R$ 5.000,00');
      expect(pedidos).toBe(1);
    });

    it('leva ao carrinho separado', async () => {
      const fixture = montar();
      await liberar(fixture);

      await clicarAdicionar(fixture);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '.carrinho a[href="/carrinho"]',
        ),
      ).not.toBeNull();
    });

    it('desabilita o botao e avisa quando o carrinho enche', async () => {
      const fixture = montar();
      await liberar(fixture);

      await clicarAdicionar(fixture, 10);

      expect(botoes(fixture, '.produto__acao button')[0].disabled).toBe(true);
      expect(texto(fixture)).toContain(TEXTOS.servicos.carrinho.cheio);
    });
  });
  /**
   * A busca e LOCAL (ADR-22): filtra o que ja veio, sem nova chamada. Acento e
   * maiuscula nao importam, porque o catalogo e escrito por gente.
   */
  describe('busca', () => {
    const LGPD: ProdutoVitrine = {
      ...PARECER,
      id: 'produto-2',
      nome: 'Adequação à LGPD',
      descricao: 'Mapeamento do tratamento de dados.',
    };

    function buscar(fixture: ComponentFixture<Servicos>, termo: string): void {
      const campo = (fixture.nativeElement as HTMLElement).querySelector(
        'input[type=search]',
      ) as HTMLInputElement;
      campo.value = termo;
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    function cartoes(fixture: ComponentFixture<Servicos>): number {
      return (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.vitrine .produto',
      ).length;
    }

    it('filtra por nome e descricao, sem acento, sem nova chamada', async () => {
      resposta = [PARECER, LGPD];
      const fixture = montar();
      await liberar(fixture);
      expect(cartoes(fixture)).toBe(2);

      buscar(fixture, 'adequacao');
      expect(cartoes(fixture)).toBe(1);
      expect(texto(fixture)).toContain('1 serviço');

      buscar(fixture, 'DIAGNOSTICO');
      expect(cartoes(fixture)).toBe(1);
      expect(texto(fixture)).toContain('Parecer de risco trabalhista');

      buscar(fixture, '');
      expect(cartoes(fixture)).toBe(2);
      expect(pedidos).toBe(1);
    });

    it('diz quando nada corresponde a busca', async () => {
      const fixture = montar();
      await liberar(fixture);

      buscar(fixture, 'inexistente');

      expect(cartoes(fixture)).toBe(0);
      expect(texto(fixture)).toContain(TEXTOS.servicos.semResultado);
    });
  });
});
