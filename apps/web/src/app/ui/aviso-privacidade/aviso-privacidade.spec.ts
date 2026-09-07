import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { AvisoPrivacidade } from './aviso-privacidade';

@Component({
  imports: [AvisoPrivacidade],
  template: `
    <app-aviso-privacidade [resumo]="resumo">
      Texto jurídico completo.
    </app-aviso-privacidade>
  `,
})
class Hospedeiro {
  resumo = 'Usamos seus dados só para liberar o acesso.';
}

function montar(): ComponentFixture<Hospedeiro> {
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  return fixture;
}

describe('AvisoPrivacidade', () => {
  /**
   * O resumo fica VISIVEL, nao dentro do `<details>`. E o texto que a pessoa
   * realmente le antes de digitar; escondido atras de um clique, ele deixaria de
   * cumprir o aviso no ponto da coleta que a arquitetura exige.
   */
  it('mostra o resumo fora do detalhe', () => {
    const fixture = montar();
    const resumo = (fixture.nativeElement as HTMLElement).querySelector(
      '.aviso__resumo',
    );

    expect(resumo?.textContent).toContain('liberar o acesso');
    expect(resumo?.closest('details')).toBeNull();
  });

  it('projeta o texto juridico dentro do detalhe', () => {
    const detalhe = (montar().nativeElement as HTMLElement).querySelector(
      'details',
    );

    expect(detalhe?.textContent).toContain('Texto jurídico completo.');
  });

  /**
   * Fechado por padrao: aberto, o texto juridico empurraria o formulario para
   * fora da primeira tela — e o formulario e o que a pessoa veio fazer.
   */
  it('comeca fechado', () => {
    const detalhe = (montar().nativeElement as HTMLElement).querySelector(
      'details',
    );

    expect(detalhe?.hasAttribute('open')).toBe(false);
  });

  it('usa o rotulo padrao no resumo do detalhe', () => {
    expect(
      (montar().nativeElement as HTMLElement).querySelector('summary')
        ?.textContent,
    ).toContain('Aviso de privacidade');
  });
});
