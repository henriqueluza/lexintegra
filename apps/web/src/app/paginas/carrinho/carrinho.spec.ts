import { TestBed } from '@angular/core/testing';
import { Carrinho } from './carrinho';
import { CarrinhoService } from '../../publico/carrinho.service';
describe('carrinho separado', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [Carrinho] });
  });
  it('orienta a escolha quando vazio, sem checkout', () => {
    const f = TestBed.createComponent(Carrinho);
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href="/servicos"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('a[href="/checkout"]')).toBeNull();
  });
  it('edita os itens e oferece checkout sem login', () => {
    const f = TestBed.createComponent(Carrinho);
    f.detectChanges();
    const carrinho = TestBed.inject(CarrinhoService);
    carrinho.adicionar({
      id: 'p',
      nome: 'Contrato',
      descricao: 'Revisão',
      precoCentavos: 10000,
      entregaveis: [],
      quantidadeReunioes: 1,
      numeroRevisoesPermitidas: 1,
      parcelas: 1,
      tipoCobranca: 'avulso',
      descricaoDetalhada: '',
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href="/checkout"]')).not.toBeNull();
    f.nativeElement.querySelector('button').click();
    f.detectChanges();
    expect(carrinho.quantidade()).toBe(0);
  });

  /**
   * PARCELAMENTO SO EM ASSINATURA (ajuste 11). O carrinho passou a mostrar a
   * condicao do cartao no resumo, e a deixa de mostrar quando um servico avulso
   * leva a compra para a vista (decisao de 18/11/2026).
   */
  describe('condicao do cartao no resumo', () => {
    const PLANO = {
      id: 'plano',
      nome: 'Plano Prime',
      descricao: 'Assinatura',
      precoCentavos: 708_000,
      entregaveis: [],
      quantidadeReunioes: 12,
      numeroRevisoesPermitidas: 0,
      parcelas: 12,
      tipoCobranca: 'assinatura' as const,
      descricaoDetalhada: '',
    };
    const AVULSO = {
      ...PLANO,
      id: 'avulso',
      nome: 'Análise contratual',
      precoCentavos: 22_000,
      quantidadeReunioes: 0,
      parcelas: 1,
      tipoCobranca: 'avulso' as const,
    };

    function montarCom(...produtos: (typeof PLANO | typeof AVULSO)[]): {
      texto: (seletor: string) => string;
    } {
      const f = TestBed.createComponent(Carrinho);
      f.detectChanges();
      const carrinho = TestBed.inject(CarrinhoService);
      for (const produto of produtos) carrinho.adicionar(produto);
      f.detectChanges();
      return {
        texto: (seletor) =>
          (
            (f.nativeElement as HTMLElement).querySelector(seletor)
              ?.textContent ?? ''
          )
            .replace(/\s+/g, ' ')
            .trim(),
      };
    }

    it('assinatura sozinha anuncia a parcela', () => {
      const { texto } = montarCom(PLANO);

      expect(texto('.resumo__parcelas')).toBe(
        'ou em até 12x de R$ 590,00 no cartão',
      );
      expect(texto('.resumo__sem-parcelas')).toBe('');
    });

    it('avulso sozinho mostra so o total', () => {
      const { texto } = montarCom(AVULSO);

      expect(texto('.resumo__parcelas')).toBe('');
      expect(texto('.resumo__sem-parcelas')).toBe('');
    });

    it('carrinho misto vai a vista e explica como parcelar', () => {
      const { texto } = montarCom(PLANO, AVULSO);

      expect(texto('.resumo__parcelas')).toBe('');
      expect(texto('.resumo__sem-parcelas')).toContain(
        'contrate-a em uma compra separada',
      );
    });

    it('diz o tipo de cada item', () => {
      const { texto } = montarCom(PLANO, AVULSO);

      expect(texto('.itens li:nth-child(1) .itens__tipo')).toBe('Assinatura');
      expect(texto('.itens li:nth-child(2) .itens__tipo')).toBe(
        'Serviço avulso',
      );
    });
  });
});
