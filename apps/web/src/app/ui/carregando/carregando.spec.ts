import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Carregando } from './carregando';

@Component({
  imports: [Carregando],
  template: `<app-carregando
    [variante]="variante()"
    [linhas]="linhas()"
    [rotulo]="rotulo()"
  />`,
})
class Hospedeiro {
  readonly variante = input<'linha' | 'bloco' | 'tabela'>('linha');
  readonly linhas = input(3);
  readonly rotulo = input('Carregando');
}

function montar(entradas: Record<string, unknown> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  for (const [chave, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(chave, valor);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Carregando', () => {
  /**
   * O ponto do componente. Uma sequencia de retangulos cinzas nao comunica nada a
   * quem usa leitor de tela; o anuncio precisa vir de texto.
   */
  it('anuncia o carregamento por texto, nao pela forma', () => {
    const el = montar({ rotulo: 'Carregando pedidos' });
    const status = el.querySelector('[role="status"]');

    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toContain('Carregando pedidos');
    expect(el.querySelector('.visualmente-oculto')).not.toBeNull();
  });

  it('esconde o esqueleto do leitor de tela', () => {
    expect(
      montar().querySelector('.carregando__forma')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('desenha o numero de linhas pedido', () => {
    expect(
      montar({ linhas: 5 }).querySelectorAll('.carregando__pedaco').length,
    ).toBe(5);
  });

  it('nunca desenha zero linhas, o que seria um vazio silencioso', () => {
    expect(
      montar({ linhas: 0 }).querySelectorAll('.carregando__pedaco').length,
    ).toBe(1);
  });

  it('aplica a forma da variante', () => {
    expect(
      montar({ variante: 'tabela' }).querySelector('.carregando__pedaco')
        ?.classList,
    ).toContain('carregando__pedaco--tabela');
  });
});
