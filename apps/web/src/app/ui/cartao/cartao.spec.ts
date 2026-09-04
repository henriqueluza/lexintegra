import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cartao, CartaoCabecalho, CartaoRodape } from './cartao';

@Component({
  imports: [Cartao, CartaoCabecalho, CartaoRodape],
  template: `
    <app-cartao [titulo]="titulo" [descricao]="descricao" [variante]="variante">
      @if (comCabecalho) {
        <span appCartaoCabecalho class="extra">extra</span>
      }
      <p class="corpo">corpo</p>
      @if (comRodape) {
        <button appCartaoRodape type="button">acao</button>
      }
    </app-cartao>
  `,
})
class Hospedeiro {
  titulo: string | null = null;
  descricao: string | null = null;
  variante: 'elevado' | 'plano' = 'elevado';
  comCabecalho = false;
  comRodape = false;
}

function montar(ajuste: Partial<Hospedeiro> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  Object.assign(fixture.componentInstance, ajuste);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Cartao', () => {
  it('projeta o corpo', () => {
    expect(montar().querySelector('.corpo')?.textContent).toBe('corpo');
  });

  /**
   * Um `<header>` ou `<footer>` vazio nao e neutro: ele tem borda, e a borda
   * aparece como um risco solto no meio do cartao.
   */
  it('nao desenha cabecalho nem rodape quando nao ha o que mostrar', () => {
    const el = montar();

    expect(el.querySelector('.cartao__cabecalho')).toBeNull();
    expect(el.querySelector('.cartao__rodape')).toBeNull();
  });

  it('desenha o cabecalho a partir de titulo e descricao', () => {
    const el = montar({ titulo: 'Parecer', descricao: 'Prazo de 5 dias' });

    expect(el.querySelector('.cartao__titulo')?.textContent).toBe('Parecer');
    expect(el.querySelector('.cartao__descricao')?.textContent).toBe(
      'Prazo de 5 dias',
    );
  });

  it('desenha o cabecalho quando so ha conteudo projetado', () => {
    const el = montar({ comCabecalho: true });

    expect(el.querySelector('.cartao__cabecalho')).not.toBeNull();
    expect(el.querySelector('.extra')).not.toBeNull();
  });

  it('desenha o rodape quando ha acao projetada', () => {
    const el = montar({ comRodape: true });

    expect(el.querySelector('.cartao__rodape')).not.toBeNull();
  });

  /**
   * Esta classe nao e decorativa. Ela reescopa `--acento` para o dourado claro
   * na Catedra, porque `--ouro-500` reprova em contraste sobre a superficie
   * elevada (4,19:1). Removida daqui, todo rotulo dentro de cartao cai abaixo do
   * minimo AA sem nenhum sinal visivel. Ver styles/tokens/semanticos.css.
   */
  it('marca a superficie elevada, que corrige o contraste do acento', () => {
    expect(montar().querySelector('.cartao')?.classList).toContain(
      'superficie-elevada',
    );
  });

  it('o cartao plano nao reivindica superficie elevada', () => {
    const cartao = montar({ variante: 'plano' }).querySelector('.cartao');

    expect(cartao?.classList).toContain('cartao--plano');
    expect(cartao?.classList).not.toContain('superficie-elevada');
  });
});
