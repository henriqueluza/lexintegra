import { TestBed } from '@angular/core/testing';
import { Resumo, type ItemDeResumo } from './resumo';

function item(n: number): ItemDeResumo {
  return { valor: n, rotulo: `Item ${n}`, icone: 'alerta' };
}

function montar(quantidade: number): HTMLElement {
  const fixture = TestBed.createComponent(Resumo);
  fixture.componentRef.setInput(
    'itens',
    Array.from({ length: quantidade }, (_, i) => item(i + 1)),
  );
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Resumo', () => {
  it('com tres itens nao leva a classe de quebra de linha', () => {
    const lista = montar(3).querySelector('ul')!;
    expect(lista.classList.contains('resumo--muitos')).toBe(false);
  });

  it('com cinco itens leva a classe', () => {
    const lista = montar(5).querySelector('ul')!;
    expect(lista.classList.contains('resumo--muitos')).toBe(true);
  });

  it('e uma lista, sem dt nem dd', () => {
    const raiz = montar(5);
    expect(raiz.querySelector('ul[role="list"]')).toBeTruthy();
    expect(raiz.querySelectorAll('ul > li')).toHaveLength(5);
    expect(raiz.querySelector('dt, dd, dl')).toBeNull();
  });
});
