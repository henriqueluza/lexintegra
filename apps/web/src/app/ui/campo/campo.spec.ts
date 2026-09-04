import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Campo } from './campo';

@Component({
  imports: [Campo, ReactiveFormsModule],
  template: `
    <app-campo
      [formControl]="controle"
      [rotulo]="rotulo()"
      [tipo]="tipo()"
      [multilinha]="multilinha()"
      [dica]="dica()"
      [erro]="erro()"
      [obrigatorio]="obrigatorio()"
      [somenteLeitura]="somenteLeitura()"
    />
  `,
})
class Hospedeiro {
  readonly rotulo = input('Razao social');
  readonly tipo = input<'text' | 'email' | 'tel' | 'password' | 'url'>('text');
  readonly multilinha = input(false);
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);
  readonly somenteLeitura = input(false);
  readonly controle = new FormControl('');
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

const entrada = (raiz: HTMLElement): HTMLInputElement =>
  raiz.querySelector('.campo__controle') as HTMLInputElement;

describe('Campo', () => {
  /**
   * `<label for>` de verdade, e nao `aria-label`: rotulo visivel e clicavel
   * amplia a area de acerto no toque e sobrevive a traducao automatica da
   * pagina, que ignora atributo ARIA.
   */
  it('liga o rotulo ao controle por for/id', () => {
    const { raiz } = montar();
    const rotulo = raiz.querySelector('label');

    expect(rotulo?.textContent?.trim()).toContain('Razao social');
    expect(rotulo?.getAttribute('for')).toBe(entrada(raiz).id);
    expect(entrada(raiz).id).not.toBe('');
  });

  /**
   * As rotas publicas sao pre-renderizadas e reidratadas (ADR-09). Id aleatorio
   * geraria `for` diferente no servidor e no cliente, quebrando a associacao
   * exatamente onde ninguem olha. Dois campos na mesma tela precisam de ids
   * distintos, e ambos precisam ser deterministicos.
   */
  it('gera ids distintos por instancia', () => {
    const { raiz } = montar();
    const outro = montar();

    expect(entrada(raiz).id).not.toBe(entrada(outro.raiz).id);
  });

  describe('valor', () => {
    it('escreve o valor vindo do formulario', () => {
      const { raiz, controle, detectar } = montar();
      controle.setValue('LexIntegra LTDA');
      detectar();

      expect(entrada(raiz).value).toBe('LexIntegra LTDA');
    });

    it('devolve ao formulario o que foi digitado', () => {
      const { raiz, controle } = montar();
      const campo = entrada(raiz);
      campo.value = '12.345.678/0001-90';
      campo.dispatchEvent(new Event('input'));

      expect(controle.value).toBe('12.345.678/0001-90');
    });

    it('marca como tocado ao sair do campo', () => {
      const { raiz, controle } = montar();
      expect(controle.touched).toBe(false);

      entrada(raiz).dispatchEvent(new Event('blur'));

      expect(controle.touched).toBe(true);
    });
  });

  describe('estados', () => {
    it('fica desabilitado pelo formulario, nao por input proprio', () => {
      const { raiz, controle, detectar } = montar();
      controle.disable();
      detectar();

      expect(entrada(raiz).disabled).toBe(true);
    });

    /**
     * Somente leitura nao e desabilitado: o valor ainda importa, ainda e
     * selecionavel e o campo continua na ordem de tabulacao.
     */
    it('somente leitura continua focavel', () => {
      const { raiz } = montar({ somenteLeitura: true });
      const campo = entrada(raiz);

      expect(campo.readOnly).toBe(true);
      expect(campo.disabled).toBe(false);
    });

    it('vira textarea quando multilinha', () => {
      const { raiz } = montar({ multilinha: true });

      expect(raiz.querySelector('textarea')).not.toBeNull();
      expect(raiz.querySelector('input')).toBeNull();
    });

    it('aplica o tipo pedido', () => {
      expect(entrada(montar({ tipo: 'email' }).raiz).type).toBe('email');
    });
  });

  describe('erro e dica', () => {
    /**
     * `aria-invalid="false"` fixo faz alguns leitores anunciarem "valido" em todo
     * campo da tela. O atributo so deve existir quando ha o que declarar.
     */
    it('nao declara validade quando nao ha erro', () => {
      expect(entrada(montar().raiz).getAttribute('aria-invalid')).toBeNull();
    });

    it('declara invalido e aponta a mensagem quando ha erro', () => {
      const { raiz } = montar({ erro: 'Informe um CNPJ valido.' });
      const campo = entrada(raiz);
      const descrito = campo.getAttribute('aria-describedby');

      expect(campo.getAttribute('aria-invalid')).toBe('true');
      expect(descrito).not.toBeNull();
      expect(raiz.querySelector(`#${descrito}`)?.textContent).toContain(
        'Informe um CNPJ valido.',
      );
    });

    /**
     * A ordem e a ordem de leitura: a dica explica o formato esperado, o erro diz
     * o que deu errado. Invertida, o leitor anuncia a falha antes de dizer o que
     * se esperava.
     */
    it('descreve dica antes de erro quando ha os dois', () => {
      const { raiz } = montar({
        dica: 'Apenas numeros.',
        erro: 'Informe um CNPJ valido.',
      });
      const ids = entrada(raiz).getAttribute('aria-describedby')?.split(' ');

      expect(ids?.length).toBe(2);
      expect(raiz.querySelector(`#${ids?.[0]}`)?.textContent).toContain(
        'Apenas numeros.',
      );
      expect(raiz.querySelector(`#${ids?.[1]}`)?.textContent).toContain(
        'Informe um CNPJ valido.',
      );
    });

    /**
     * O asterisco e ruido quando lido em voz alta. Quem carrega a obrigatoriedade
     * para o leitor de tela e `aria-required`.
     */
    it('marca obrigatorio por aria, e esconde o asterisco do leitor', () => {
      const { raiz } = montar({ obrigatorio: true });

      expect(entrada(raiz).getAttribute('aria-required')).toBe('true');
      expect(
        raiz.querySelector('.campo__obrigatorio')?.getAttribute('aria-hidden'),
      ).toBe('true');
    });
  });
});
