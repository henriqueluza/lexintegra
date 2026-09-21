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
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href="/checkout"]')).not.toBeNull();
    f.nativeElement.querySelector('button').click();
    f.detectChanges();
    expect(carrinho.quantidade()).toBe(0);
  });
});
