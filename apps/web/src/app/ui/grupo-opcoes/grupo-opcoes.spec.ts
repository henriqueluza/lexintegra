import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GrupoOpcoes, type OpcaoGrupo, type ValorGrupo } from './grupo-opcoes';

const OPCOES: readonly OpcaoGrupo[] = [
  { valor: 'clt', rotulo: 'Contrato CLT' },
  { valor: 'pj', rotulo: 'Contrato PJ' },
  { valor: 'nenhum', rotulo: 'Nenhum dos anteriores', exclusiva: true },
];

@Component({
  imports: [GrupoOpcoes, ReactiveFormsModule],
  template: `
    <app-grupo-opcoes
      [formControl]="controle"
      rotulo="Documentos da equipe"
      [opcoes]="OPCOES"
      [multipla]="multipla()"
      [dica]="dica()"
      [erro]="erro()"
      [obrigatorio]="obrigatorio()"
    />
  `,
})
class Hospedeiro {
  readonly multipla = input(false);
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);
  readonly controle = new FormControl<ValorGrupo>('');
  protected readonly OPCOES = OPCOES;
}

function montar(entradas: Record<string, unknown> = {}): {
  raiz: HTMLElement;
  controle: FormControl<ValorGrupo | null>;
  detectar: () => void;
} {
  const fixture = TestBed.createComponent(Hospedeiro);
  for (const [chave, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(chave, valor);
  }
  fixture.detectChanges();
  return {
    raiz: fixture.nativeElement as HTMLElement,
    controle: fixture.componentInstance.controle,
    detectar: () => fixture.detectChanges(),
  };
}

const controles = (raiz: HTMLElement): HTMLInputElement[] => [
  ...raiz.querySelectorAll<HTMLInputElement>('input'),
];

function clicar(raiz: HTMLElement, indice: number): void {
  controles(raiz)[indice].click();
}

describe('GrupoOpcoes', () => {
  /** O leitor de tela anuncia a pergunta ao entrar no grupo pela legenda. */
  it('e um fieldset com a pergunta na legenda', () => {
    const { raiz } = montar();

    expect(raiz.querySelector('fieldset')).not.toBeNull();
    expect(raiz.querySelector('legend')?.textContent).toContain(
      'Documentos da equipe',
    );
  });

  it('na unica, usa radio com o mesmo nome e grava uma string', () => {
    const { raiz, controle } = montar();
    const [a, b] = controles(raiz);

    expect(a.type).toBe('radio');
    expect(a.name).toBe(b.name);

    clicar(raiz, 1);
    expect(controle.value).toBe('pj');
    clicar(raiz, 0);
    expect(controle.value).toBe('clt');
  });

  it('na multipla, usa caixa de marcar e grava uma lista', () => {
    const { raiz, controle } = montar({ multipla: true });

    expect(controles(raiz)[0].type).toBe('checkbox');
    clicar(raiz, 0);
    clicar(raiz, 1);
    expect(controle.value).toEqual(['clt', 'pj']);
    clicar(raiz, 0);
    expect(controle.value).toEqual(['pj']);
  });

  /**
   * `detectar` entre os cliques faz o papel do navegador, que roda a deteccao
   * depois de cada evento: sem ela, o `[checked]` nao tem como desmarcar.
   */
  it('a exclusiva desmarca as outras, e outra desmarca a exclusiva', () => {
    const { raiz, controle, detectar } = montar({ multipla: true });

    clicar(raiz, 0);
    detectar();
    clicar(raiz, 2);
    detectar();
    expect(controle.value).toEqual(['nenhum']);
    expect(controles(raiz)[0].checked).toBe(false);

    clicar(raiz, 1);
    detectar();
    expect(controle.value).toEqual(['pj']);
    expect(controles(raiz)[2].checked).toBe(false);
  });

  it('mostra o valor escrito pelo formulario', () => {
    const { raiz, controle, detectar } = montar({ multipla: true });

    controle.setValue(['pj', 'nenhum']);
    detectar();
    expect(controles(raiz).map((c) => c.checked)).toEqual([false, true, true]);

    controle.setValue(null);
    detectar();
    expect(controles(raiz).some((c) => c.checked)).toBe(false);
  });

  it('na unica, aceita a string escrita pelo formulario', () => {
    const { raiz, controle, detectar } = montar();

    controle.setValue('clt');
    detectar();
    expect(controles(raiz)[0].checked).toBe(true);
  });

  it('marca obrigatoriedade, dica e erro e liga o grupo a eles', () => {
    const { raiz } = montar({
      obrigatorio: true,
      dica: 'Marque todas as que valem.',
      erro: 'Marque uma opcao.',
    });
    const grupo = raiz.querySelector('fieldset') as HTMLFieldSetElement;
    const ids = grupo.getAttribute('aria-describedby')?.split(' ') ?? [];

    expect(grupo.getAttribute('aria-required')).toBe('true');
    expect(grupo.getAttribute('aria-invalid')).toBe('true');
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(raiz.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(raiz.textContent).toContain('Marque uma opcao.');
  });

  /**
   * `aria-required` e `aria-invalid` so valem no `radiogroup`; no `group` do
   * fieldset o axe os recusa. Na multipla, o erro chega pelo `describedby`.
   */
  it('na multipla nao usa radiogroup nem os atributos dele', () => {
    const { raiz } = montar({
      multipla: true,
      obrigatorio: true,
      erro: 'Marque uma opcao.',
    });
    const grupo = raiz.querySelector('fieldset') as HTMLFieldSetElement;

    expect(grupo.getAttribute('role')).toBeNull();
    expect(grupo.getAttribute('aria-required')).toBeNull();
    expect(grupo.getAttribute('aria-invalid')).toBeNull();
    expect(grupo.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('na unica, o fieldset e um radiogroup', () => {
    const { raiz } = montar();

    expect(raiz.querySelector('fieldset')?.getAttribute('role')).toBe(
      'radiogroup',
    );
  });

  it('sem dica nem erro, nao descreve o grupo', () => {
    const { raiz } = montar();

    expect(
      raiz.querySelector('fieldset')?.getAttribute('aria-describedby'),
    ).toBeNull();
  });

  it('desabilitado pelo formulario, desabilita o fieldset', () => {
    const { raiz, controle, detectar } = montar();

    controle.disable();
    detectar();
    expect(
      (raiz.querySelector('fieldset') as HTMLFieldSetElement).disabled,
    ).toBe(true);
  });

  it('avisa o formulario quando o foco sai', () => {
    const { raiz, controle } = montar();

    controles(raiz)[0].dispatchEvent(new Event('blur'));
    expect(controle.touched).toBe(true);
  });
});
