import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { LinkAcao } from './link-acao';
import type { VarianteBotao } from '../botao/botao';

@Component({
  imports: [LinkAcao],
  template: `
    <app-link-acao
      [destino]="destino"
      [variante]="variante"
      [tamanho]="tamanho"
    >
      Ver serviços
    </app-link-acao>
  `,
})
class Hospedeiro {
  destino = '#servicos';
  variante: VarianteBotao = 'secundario';
  tamanho: 'md' | 'p' = 'md';
}

function montar(): ComponentFixture<Hospedeiro> {
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  return fixture;
}

function ancora(fixture: ComponentFixture<Hospedeiro>): HTMLAnchorElement {
  return fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
}

describe('LinkAcao', () => {
  /**
   * O ponto inteiro do componente. Um `<button>` que navega quebra menu de
   * contexto, abrir em nova aba e o anuncio do leitor de tela — que diria
   * "botao" para algo que leva a outro lugar.
   */
  it('renderiza uma ancora de verdade, com href', () => {
    const fixture = montar();

    expect(ancora(fixture).tagName).toBe('A');
    expect(ancora(fixture).getAttribute('href')).toBe('#servicos');
  });

  it('mostra o conteudo projetado', () => {
    expect(montar().nativeElement.textContent).toContain('Ver serviços');
  });

  it.each<[VarianteBotao, string]>([
    ['primario', 'link-acao--primario'],
    ['secundario', 'link-acao--secundario'],
    ['fantasma', 'link-acao--fantasma'],
    ['texto', 'link-acao--texto'],
  ])('aplica a classe da variante %s', (variante, classe) => {
    const fixture = TestBed.createComponent(Hospedeiro);
    fixture.componentInstance.variante = variante;
    fixture.detectChanges();

    expect(ancora(fixture).classList).toContain(classe);
  });

  it('aplica o tamanho pequeno', () => {
    const fixture = TestBed.createComponent(Hospedeiro);
    fixture.componentInstance.tamanho = 'p';
    fixture.detectChanges();

    expect(ancora(fixture).classList).toContain('link-acao--p');
  });

  /**
   * `<a>` desabilitado nao existe em HTML, e as imitacoes produzem um elemento
   * que parece clicavel e nao e. Este teste guarda a ausencia: quem precisar de
   * acao indisponivel usa `app-botao`, que tem `disabled` de verdade.
   */
  it('nao tem estado desabilitado', () => {
    expect(
      (LinkAcao.prototype as Record<string, unknown>)['desabilitado'],
    ).toBeUndefined();
    expect(ancora(montar()).hasAttribute('aria-disabled')).toBe(false);
  });
});
