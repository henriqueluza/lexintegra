import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { ProdutoVitrine } from 'shared';
import { PreCadastroService } from '../../../publico/pre-cadastro.service';
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
};

const liberado = signal(false);
let pedidos = 0;
let resposta: ProdutoVitrine[] | Error = [PARECER];

function montar(): ComponentFixture<Servicos> {
  liberado.set(false);
  pedidos = 0;

  TestBed.configureTestingModule({
    imports: [Servicos],
    providers: [
      {
        provide: PreCadastroService,
        useValue: {
          liberado,
          listarVitrine: () => {
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
          'a[href="#cadastro"]',
        ),
      ).not.toBeNull();
    });

    /**
     * Os cartoes borrados sao textura, nao conteudo: quem usa leitor de tela
     * recebe o aviso e o botao, que e a informacao inteira. Anuncia-los seria ler
     * tres nomes de servico que nao existem.
     */
    it('esconde os cartoes de exemplo do leitor de tela', () => {
      const fundo = (montar().nativeElement as HTMLElement).querySelector(
        '.trava__fundo',
      );

      expect(fundo?.getAttribute('aria-hidden')).toBe('true');
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

    it('mostra quantas reunioes e revisoes o servico inclui', async () => {
      const fixture = montar();

      await liberar(fixture);

      expect(texto(fixture)).toContain(TEXTOS.servicos.reunioes);
      expect(texto(fixture)).toContain(TEXTOS.servicos.revisoes);
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
});
