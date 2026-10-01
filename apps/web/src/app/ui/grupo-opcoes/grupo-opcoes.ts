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

export interface OpcaoGrupo {
  readonly valor: string;
  readonly rotulo: string;
  /** Na multipla, marca-la desmarca as outras, e marcar outra a desmarca. */
  readonly exclusiva?: boolean;
}

export type ValorGrupo = string | readonly string[];

/** Ver a nota sobre determinismo em `campo.ts`. */
let sequencia = 0;

/**
 * Grupo de opcoes: escolha unica (radio) ou multipla (caixa de marcar).
 *
 * `<fieldset>` com `<legend>`, e nao um rotulo solto: e o que faz o leitor de
 * tela anunciar a pergunta ao entrar no grupo, e nao so o texto de cada opcao.
 * Os controles sao nativos pela mesma razao da `app-selecao` — teclado, foco e
 * anuncio vem do navegador, e uma imitacao desenhada a mao erraria algum deles.
 *
 * NA UNICA, O FIELDSET E UM `radiogroup`: e o papel que aceita
 * `aria-required` e `aria-invalid` (o `group` implicito do fieldset nao aceita,
 * e o axe recusa). Na multipla nao ha papel com essa semantica; o erro chega ao
 * leitor de tela pelo `aria-describedby`.
 *
 * O VALOR E UMA STRING NA UNICA E UMA LISTA NA MULTIPLA, nunca os dois: e o
 * formato que o schema do servidor espera (`shared/esquemas/anamnese`). A opcao
 * EXCLUSIVA ("Nenhum dos anteriores") e so conveniencia de tela; quem recusa a
 * combinacao e o servidor.
 */
@Component({
  selector: 'app-grupo-opcoes',
  imports: [MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grupo-opcoes.html',
  styleUrl: './grupo-opcoes.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GrupoOpcoes),
      multi: true,
    },
  ],
})
export class GrupoOpcoes implements ControlValueAccessor {
  readonly rotulo = input.required<string>();
  readonly opcoes = input.required<readonly OpcaoGrupo[]>();
  readonly multipla = input(false);
  readonly dica = input<string | null>(null);
  readonly erro = input<string | null>(null);
  readonly obrigatorio = input(false);

  private readonly indice = sequencia++;
  protected readonly nome = `grupo-${this.indice}`;
  protected readonly idDica = `grupo-${this.indice}-dica`;
  protected readonly idErro = `grupo-${this.indice}-erro`;

  protected readonly marcadas = signal<readonly string[]>([]);
  protected readonly desabilitado = signal(false);

  protected readonly descritoPor = computed(() => {
    const ids = [
      this.dica() === null ? null : this.idDica,
      this.erro() === null ? null : this.idErro,
    ].filter((id): id is string => id !== null);
    return ids.length === 0 ? null : ids.join(' ');
  });

  private aoMudar: (valor: ValorGrupo) => void = () => {};
  private aoTocar: () => void = () => {};

  writeValue(valor: ValorGrupo | null): void {
    if (valor === null || valor === '') this.marcadas.set([]);
    else this.marcadas.set(typeof valor === 'string' ? [valor] : [...valor]);
  }

  registerOnChange(fn: (valor: ValorGrupo) => void): void {
    this.aoMudar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.aoTocar = fn;
  }

  setDisabledState(desabilitado: boolean): void {
    this.desabilitado.set(desabilitado);
  }

  protected marcada(valor: string): boolean {
    return this.marcadas().includes(valor);
  }

  protected alternou(opcao: OpcaoGrupo, evento: Event): void {
    const ligada = (evento.target as HTMLInputElement).checked;

    if (!this.multipla()) {
      this.marcadas.set([opcao.valor]);
      this.aoMudar(opcao.valor);
      return;
    }

    let proximas: string[];
    if (!ligada) {
      proximas = this.marcadas().filter((v) => v !== opcao.valor);
    } else if (opcao.exclusiva === true) {
      proximas = [opcao.valor];
    } else {
      const exclusivas = new Set(
        this.opcoes()
          .filter((o) => o.exclusiva === true)
          .map((o) => o.valor),
      );
      proximas = [
        ...this.marcadas().filter((v) => !exclusivas.has(v)),
        opcao.valor,
      ];
    }
    this.marcadas.set(proximas);
    this.aoMudar(proximas);
  }

  protected saiu(): void {
    this.aoTocar();
  }
}
