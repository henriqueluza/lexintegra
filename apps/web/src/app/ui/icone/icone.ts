import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Icones do sistema. Nao estavam na lista de componentes da Etapa 3 porque sao
 * infraestrutura: botao, estado vazio, aviso e tabela precisam deles para existir.
 *
 * O desenho vem de docs/design.md: traco de 1,5px, sem preenchimento, terminacao
 * reta (`stroke-linecap: butt`). Essas tres propriedades sao o que faz o conjunto
 * parecer da mesma familia, e por isso vivem em token (`--traco-icone`) e no CSS
 * deste componente, nunca no ponto de uso.
 *
 * Os tracos sao dados inline, nao um sprite `<use href="#id">` como nos
 * prototipos: sprite exige um bloco de `<defs>` presente no documento, o que
 * quebra em rota carregada sob demanda e obriga a duplicar o bloco no HTML
 * pre-renderizado de cada rota (ADR-09).
 *
 * ACESSIBILIDADE: por padrao o icone e decorativo (`aria-hidden`), porque na
 * imensa maioria dos usos ele acompanha um texto que ja diz a mesma coisa.
 * Passar `rotulo` o promove a `role="img"` com nome acessivel — use so quando o
 * icone for a UNICA fonte da informacao.
 */
export type NomeIcone =
  | 'documento'
  | 'enviar'
  | 'calendario'
  | 'video'
  | 'alerta'
  | 'cadeado'
  | 'confere'
  | 'marca'
  | 'busca'
  | 'seta-direita'
  | 'fecha';

const TRACOS: Readonly<Record<NomeIcone, readonly string[]>> = {
  documento: ['M14 3H6v18h12V7z', 'M14 3v4h4'],
  enviar: ['M12 19V5', 'M5 12l7-7 7 7'],
  calendario: ['M4 6h16v14H4z', 'M4 10h16', 'M9 3v5', 'M15 3v5'],
  video: ['M3 7h12v10H3z', 'M15 11l6-3v8l-6-3'],
  alerta: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  cadeado: ['M5 11h14v9H5z', 'M8 11V8a4 4 0 018 0v3'],
  confere: ['M4 12l5 5L20 6'],
  marca: ['M8 3H4v18h4M16 3h4v18h-4', 'M12 7v10'],
  // Circulo desenhado como path: manter todo icone como lista de `d` deixa o
  // template com um unico `<path>` em laco, sem ramo por tipo de forma.
  busca: ['M18 11a7 7 0 11-14 0 7 7 0 0114 0', 'M16 16l5 5'],
  'seta-direita': ['M5 12h14', 'M13 5l7 7-7 7'],
  fecha: ['M6 6l12 12', 'M18 6L6 18'],
};

@Component({
  selector: 'app-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icone.html',
  styleUrl: './icone.css',
})
export class Icone {
  readonly nome = input.required<NomeIcone>();
  readonly tamanho = input<'md' | 'p'>('md');
  /** Preenchido, o icone deixa de ser decorativo e ganha nome acessivel. */
  readonly rotulo = input<string | null>(null);

  protected readonly tracos = computed(() => TRACOS[this.nome()]);
  protected readonly decorativo = computed(() => this.rotulo() === null);
}
