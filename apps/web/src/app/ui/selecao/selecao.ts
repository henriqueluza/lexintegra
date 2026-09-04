import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { Icone } from '../icone/icone';
import { MensagemErro } from '../mensagem-erro/mensagem-erro';

export interface OpcaoSelecao {
  readonly valor: string;
  readonly rotulo: string;
  readonly desabilitada?: boolean;
}

/** Ver a nota sobre determinismo em `campo.ts`. */
let sequencia = 0;

/**
 * Selecao de uma opcao entre varias.
 *
 * E um `<select>` nativo por baixo, e nao uma lista desenhada a mao. Um select
 * customizado exige reimplementar teclado (setas, Home, End, busca por
 * digitacao), `role="listbox"`, gestao de foco e rolagem — e no celular perde o
 * seletor nativo do sistema, que e mais rapido de operar que qualquer imitacao.
 * Quando a Etapa 5 precisar de busca dentro da lista ou de selecao multipla, isso
 * entra como componente proprio, sem estragar este.
 *
 * A seta e desenhada por cima com `app-icone` porque `appearance: none` remove a
 * do navegador junto com o resto do estilo. Ela e `aria-hidden`: o `<select>` ja
 * se anuncia como caixa de combinacao.
 */
@Component({
  selector: 'app-selecao',
  imports: [Icone, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selecao.html',
  styleUrl: './selecao.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Selecao),
      multi: true,
    },
  ],
})
export class Selecao implements ControlValueAccessor {
  readonly rotulo = input.required<string>();
  readonly opcoes = input.required<readonly OpcaoSelecao[]>();
  readonly marcador = input<string | null>(null);
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);

  private readonly indice = sequencia++;
  protected readonly idControle = `selecao-${this.indice}`;
  protected readonly idDica = `selecao-${this.indice}-dica`;
  protected readonly idErro = `selecao-${this.indice}-erro`;

  protected readonly valor = signal('');
  protected readonly desabilitado = signal(false);

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

  protected escolheu(evento: Event): void {
    const alvo = evento.target as HTMLSelectElement;
    this.valor.set(alvo.value);
    this.aoMudar(alvo.value);
  }

  protected saiu(): void {
    this.aoTocar();
  }
}
