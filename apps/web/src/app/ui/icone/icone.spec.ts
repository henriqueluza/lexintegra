import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Icone } from './icone';

@Component({
  imports: [Icone],
  template: `<app-icone [nome]="'confere'" [rotulo]="rotulo" />`,
})
class Hospedeiro {
  rotulo: string | null = null;
}

function montar(rotulo: string | null = null): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.componentInstance.rotulo = rotulo;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Icone', () => {
  it('desenha os tracos do icone pedido', () => {
    const paths = montar().querySelectorAll('path');

    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute('d')).toBe('M4 12l5 5L20 6');
  });

  /**
   * Um icone que so acompanha texto ja dito ao lado nao pode ser lido de novo
   * pelo leitor de tela — isso e ruido, nao acessibilidade. O padrao e decorativo
   * justamente porque esse e o caso da imensa maioria dos usos.
   */
  it('e decorativo por padrao, invisivel ao leitor de tela', () => {
    const svg = montar().querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('vira imagem com nome acessivel quando recebe rotulo', () => {
    const svg = montar('Entregue').querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Entregue');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('nunca entra na ordem de tabulacao', () => {
    // `focusable="false"` importa: no Internet Explorer e em alguns leitores,
    // SVG entra na tabulacao sozinho e cria parada morta no teclado.
    expect(montar().querySelector('svg')?.getAttribute('focusable')).toBe(
      'false',
    );
  });
});
