import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Selecao, type OpcaoSelecao } from './selecao';

const OPCOES: readonly OpcaoSelecao[] = [
  { valor: 'trabalhista', rotulo: 'Trabalhista' },
  { valor: 'tributario', rotulo: 'Tributario' },
  { valor: 'societario', rotulo: 'Societario', desabilitada: true },
];

@Component({
  imports: [Selecao, ReactiveFormsModule],
  template: `
    <app-selecao
      [formControl]="controle"
      rotulo="Area do direito"
      [opcoes]="OPCOES"
      [marcador]="marcador()"
      [dica]="dica()"
      [erro]="erro()"
      [obrigatorio]="obrigatorio()"
    />
  `,
})
class Hospedeiro {
  readonly marcador = input<string | null>(null);
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);
  readonly controle = new FormControl('');
  protected readonly OPCOES = OPCOES;
}

function montar(entradas: Record<string, unknown> = {}): {
  raiz: HTMLElement;
  controle: FormControl<string | null>;
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

const select = (raiz: HTMLElement): HTMLSelectElement =>
  raiz.querySelector('select') as HTMLSelectElement;

describe('Selecao', () => {
  /**
   * `<select>` nativo, e nao lista desenhada a mao: um select customizado exige
   * reimplementar setas, Home, End e busca por digitacao, e no celular perde o
   * seletor do sistema, que e mais rapido de operar que qualquer imitacao.
   */
  it('e um select nativo', () => {
    expect(select(montar().raiz).tagName).toBe('SELECT');
  });

  it('lista as opcoes e respeita a que esta desabilitada', () => {
    const opcoes = select(montar().raiz).querySelectorAll('option');

    expect(opcoes.length).toBe(3);
    expect(opcoes[0].textContent?.trim()).toBe('Trabalhista');
    expect(opcoes[2].disabled).toBe(true);
  });

  it('liga o rotulo ao controle por for/id', () => {
    const { raiz } = montar();

    expect(raiz.querySelector('label')?.getAttribute('for')).toBe(
      select(raiz).id,
    );
  });

  it('escreve e devolve o valor pelo formulario', () => {
    const { raiz, controle, detectar } = montar();
    controle.setValue('tributario');
    detectar();
    expect(select(raiz).value).toBe('tributario');

    select(raiz).value = 'trabalhista';
    select(raiz).dispatchEvent(new Event('change'));
    expect(controle.value).toBe('trabalhista');
  });

  it('marca como tocado ao sair do campo', () => {
    const { raiz, controle } = montar();
    expect(controle.touched).toBe(false);

    select(raiz).dispatchEvent(new Event('blur'));

    expect(controle.touched).toBe(true);
  });

  it('fica desabilitado pelo formulario', () => {
    const { raiz, controle, detectar } = montar();
    controle.disable();
    detectar();

    expect(select(raiz).disabled).toBe(true);
  });

  /**
   * O marcador e uma opcao desabilitada, nao um `placeholder`: `<select>` nao tem
   * placeholder, e uma opcao habilitada com texto de instrucao seria escolhivel
   * como se fosse resposta valida.
   */
  it('o marcador nao pode ser escolhido como resposta', () => {
    const { raiz } = montar({ marcador: 'Escolha uma area' });
    const primeira = select(raiz).querySelectorAll('option')[0];

    expect(primeira.textContent?.trim()).toBe('Escolha uma area');
    expect(primeira.disabled).toBe(true);
  });

  it('nao declara validade quando nao ha erro', () => {
    expect(select(montar().raiz).getAttribute('aria-invalid')).toBeNull();
  });

  it('declara invalido e aponta a mensagem quando ha erro', () => {
    const { raiz } = montar({ erro: 'Escolha uma area.' });
    const descrito = select(raiz).getAttribute('aria-describedby');

    expect(select(raiz).getAttribute('aria-invalid')).toBe('true');
    expect(raiz.querySelector(`#${descrito}`)?.textContent).toContain(
      'Escolha uma area.',
    );
  });

  it('descreve dica antes de erro quando ha os dois', () => {
    const { raiz } = montar({
      dica: 'Pode mudar depois.',
      erro: 'Obrigatorio.',
    });
    const ids = select(raiz).getAttribute('aria-describedby')?.split(' ');

    expect(ids?.length).toBe(2);
    expect(raiz.querySelector(`#${ids?.[0]}`)?.textContent).toContain(
      'Pode mudar depois.',
    );
  });

  /**
   * A seta desenhada por cima existe so porque `appearance: none` remove a do
   * navegador. Ela nao pode aparecer para o leitor de tela — o `<select>` ja se
   * anuncia como caixa de combinacao — nem interceptar o clique que abre a lista.
   */
  it('a seta e decorativa e nao rouba o clique', () => {
    const seta = montar().raiz.querySelector('.selecao__seta svg');

    expect(seta?.getAttribute('aria-hidden')).toBe('true');
  });
});
