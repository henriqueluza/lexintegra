import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { MensagemErro } from '../mensagem-erro/mensagem-erro';

/**
 * Contador de instancia para gerar os `id` que ligam rotulo, dica e erro ao
 * controle.
 *
 * Precisa ser deterministico, nao aleatorio: as rotas publicas sao
 * pre-renderizadas (ADR-09) e o cliente reidrata o HTML gerado no build. Um
 * `Math.random()` ou `crypto.randomUUID()` produziria `for="campo-a1b2"` no
 * servidor e `for="campo-c3d4"` no cliente, quebrando a associacao rotulo→campo
 * exatamente onde ninguem olha. Um contador reinicia em zero nos dois lados e as
 * instancias sao criadas na mesma ordem.
 */
let sequencia = 0;

/**
 * Campo de texto do sistema, em uma linha ou varias.
 *
 * ACESSIBILIDADE, e e a razao de o componente ser tao grande:
 * - `<label for>` de verdade apontando para o controle, nao `aria-label` — rotulo
 *   visivel e clicavel amplia a area de acerto e sobrevive a traducao da pagina.
 * - `aria-describedby` reune dica e erro. Os dois ao mesmo tempo quando ha os
 *   dois; a ordem importa, porque e a ordem em que sao lidos.
 * - `aria-invalid` so aparece quando ha erro. `aria-invalid="false"` fixo faz
 *   alguns leitores anunciarem "valido" em todo campo, o que e ruido.
 * - `aria-required` alem do `required` nativo: o nativo dispara a validacao do
 *   navegador, que atropela a mensagem propria da aplicacao em varios casos.
 *
 * A diferenca visual entre as direcoes — sublinhado na Catedra, caixa branca na
 * Pauta — e inteiramente token (`--campo-borda-largura`, `--campo-fundo`), nao ha
 * ramo por direcao aqui dentro.
 */
@Component({
  selector: 'app-campo',
  imports: [MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campo.html',
  styleUrl: './campo.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Campo),
      multi: true,
    },
  ],
})
export class Campo implements ControlValueAccessor {
  readonly rotulo = input.required<string>();
  readonly tipo = input<'text' | 'email' | 'tel' | 'password' | 'url'>('text');
  readonly multilinha = input(false);
  readonly marcador = input('');
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);
  readonly somenteLeitura = input(false);
  readonly linhas = input(4);

  private readonly indice = sequencia++;
  protected readonly idControle = `campo-${this.indice}`;
  protected readonly idDica = `campo-${this.indice}-dica`;
  protected readonly idErro = `campo-${this.indice}-erro`;

  protected readonly valor = signal('');
  /** Vem do `setDisabledState` das reactive forms, nao de um input. */
  protected readonly desabilitado = signal(false);

  /**
   * A ordem e a ordem de leitura: a dica explica o formato esperado, o erro diz o
   * que deu errado. Erro primeiro faria o leitor anunciar a falha antes de dizer
   * o que se esperava.
   */
  protected readonly descritoPor = computed(() => {
    const ids = [
      this.dica() === null ? null : this.idDica,
      this.erro() === null ? null : this.idErro,
    ].filter((id): id is string => id !== null);
    return ids.length === 0 ? null : ids.join(' ');
  });

  private aoMudar: (valor: string) => void = () => {};
  private aoTocar: () => void = () => {};

  writeValue(valor: string | null): void {
    this.valor.set(valor ?? '');
  }

  registerOnChange(fn: (valor: string) => void): void {
    this.aoMudar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.aoTocar = fn;
  }

  setDisabledState(desabilitado: boolean): void {
    this.desabilitado.set(desabilitado);
  }

  protected digitou(evento: Event): void {
    const alvo = evento.target as HTMLInputElement | HTMLTextAreaElement;
    this.valor.set(alvo.value);
    this.aoMudar(alvo.value);
  }

  protected saiu(): void {
    this.aoTocar();
  }
}
