import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MARCAS_ACEITAS,
  type MarcaDePagamento,
} from 'shared/formas-de-pagamento';
import { MarcasPagamento } from './marcas-pagamento';

@Component({
  imports: [MarcasPagamento],
  template: `<app-marcas-pagamento
    [marcas]="marcas()"
    [rotulo]="rotulo()"
    [tamanho]="tamanho()"
  />`,
})
class Hospedeiro {
  readonly marcas = signal<readonly MarcaDePagamento[]>(MARCAS_ACEITAS);
  readonly rotulo = signal('Formas de pagamento aceitas');
  readonly tamanho = signal<'p' | 'm'>('m');
}

function montar(
  ajuste: (hospedeiro: Hospedeiro) => void = () => undefined,
): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  ajuste(fixture.componentInstance);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function nomes(raiz: HTMLElement): (string | null)[] {
  return [...raiz.querySelectorAll('li svg')].map((svg) =>
    svg.getAttribute('aria-label'),
  );
}

describe('MarcasPagamento', () => {
  /**
   * A lista vem de `shared/formas-de-pagamento`, e nao do componente: o site
   * nao pode anunciar marca que a conta do AbacatePay nao aceita.
   */
  it('mostra exatamente as marcas aceitas, na ordem da fonte unica', () => {
    expect(nomes(montar())).toEqual([
      'Pix',
      'Visa',
      'Mastercard',
      'Apple Pay',
      'Google Pay',
    ]);
  });

  it('e uma lista com nome, legivel por leitor de tela como lista', () => {
    const lista = montar().querySelector('ul');

    expect(lista?.getAttribute('role')).toBe('list');
    expect(lista?.getAttribute('aria-label')).toBe(
      'Formas de pagamento aceitas',
    );
    expect(lista?.querySelectorAll(':scope > li')).toHaveLength(5);
  });

  it('cada marca e uma imagem com nome e titulo', () => {
    for (const svg of montar().querySelectorAll('svg')) {
      expect(svg.getAttribute('role')).toBe('img');
      expect(svg.querySelector('title')?.textContent).toBe(
        svg.getAttribute('aria-label'),
      );
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  });

  /**
   * Toda marca desenhada: um `@case` esquecido renderizaria um `li` vazio, que
   * o leitor de tela anunciaria como item sem conteudo.
   */
  it('desenha todas as marcas da fonte unica', () => {
    const raiz = montar();
    for (const item of raiz.querySelectorAll('li')) {
      expect(item.querySelectorAll('svg path').length).toBeGreaterThan(0);
    }
  });

  it('recorta a lista quando pedido', () => {
    const raiz = montar((h) => {
      h.marcas.set(['pix']);
      h.rotulo.set('Pix');
    });

    expect(nomes(raiz)).toEqual(['Pix']);
    expect(raiz.querySelector('ul')?.getAttribute('aria-label')).toBe('Pix');
  });

  it('tem o tamanho menor para dentro de formulario', () => {
    expect(montar().querySelector('ul.marcas--p')).toBeNull();
    expect(
      montar((h) => h.tamanho.set('p')).querySelector('ul.marcas--p'),
    ).not.toBeNull();
  });

  /** Cor de marca vem de token por classe, nunca de `fill` escrito no SVG. */
  it('nao tem cor escrita no desenho', () => {
    for (const path of montar().querySelectorAll('path')) {
      expect(path.getAttribute('fill')).toBeNull();
      expect(path.getAttribute('class')).toMatch(/^marca__/);
    }
  });
});
