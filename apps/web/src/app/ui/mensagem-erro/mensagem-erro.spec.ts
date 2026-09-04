import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MensagemErro } from './mensagem-erro';

@Component({
  imports: [MensagemErro],
  template: `<app-mensagem-erro [variante]="variante()" [id]="id()"
    >Informe um CNPJ valido.</app-mensagem-erro
  >`,
})
class Hospedeiro {
  readonly variante = input<'linha' | 'bloco'>('linha');
  readonly id = input<string | null>(null);
}

function montar(entradas: Record<string, unknown> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  for (const [chave, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(chave, valor);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MensagemErro', () => {
  it('mostra a mensagem', () => {
    expect(montar().textContent).toContain('Informe um CNPJ valido.');
  });

  /**
   * Um formulario com cinco campos invalidos dispararia cinco interrupcoes
   * seguidas se cada erro de campo fosse um alerta. Quem anuncia o erro de campo
   * e o proprio campo, pelo `aria-describedby`, quando ele recebe foco.
   */
  it('a forma de linha nao interrompe o leitor de tela', () => {
    expect(montar().querySelector('[role="alert"]')).toBeNull();
  });

  /**
   * O erro de operacao aparece longe do foco atual — o botao de salvar ficou
   * onde estava e a falha veio do servidor. Esse precisa interromper.
   */
  it('a forma de bloco interrompe, porque aparece longe do foco', () => {
    const alerta = montar({ variante: 'bloco' }).querySelector(
      '[role="alert"]',
    );

    expect(alerta).not.toBeNull();
    expect(alerta?.textContent).toContain('Informe um CNPJ valido.');
  });

  it('aceita id, para o campo poder aponta-la em aria-describedby', () => {
    const el = montar({ id: 'cnpj-erro' });

    expect(el.querySelector('#cnpj-erro')).not.toBeNull();
  });
});
