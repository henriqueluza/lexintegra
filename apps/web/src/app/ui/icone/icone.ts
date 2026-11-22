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
  | 'fecha'
  | 'grade'
  | 'pasta'
  | 'rota'
  | 'usuarios'
  | 'usuario'
  | 'sacola'
  | 'relogio'
  | 'escudo'
  | 'mensagem'
  | 'predio'
  | 'mais'
  | 'menos'
  | 'sair'
  | 'olho'
  | 'menu'
  | 'estorno'
  | 'mala';

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
  grade: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  pasta: ['M3 7a2 2 0 012-2h5l2 3h7a2 2 0 012 2v9H3z'],
  rota: [
    'M7 5a2 2 0 11-4 0 2 2 0 014 0',
    'M21 19a2 2 0 11-4 0 2 2 0 014 0',
    'M7 5h8a4 4 0 010 8H9a3 3 0 000 6h8',
  ],
  usuarios: [
    'M12 7a3 3 0 11-6 0 3 3 0 016 0',
    'M3 21v-4a6 6 0 0112 0v4',
    'M16 4a3 3 0 010 6',
    'M19 21v-4a5 5 0 00-2-4',
  ],
  usuario: ['M16 8a4 4 0 11-8 0 4 4 0 018 0', 'M4 21a8 8 0 0116 0'],
  sacola: ['M4 7h16v14H4z', 'M8 9V6a4 4 0 018 0v3'],
  relogio: ['M21 12a9 9 0 11-18 0 9 9 0 0118 0', 'M12 6v6l4 2'],
  escudo: ['M12 3L3 7v5c0 5 9 9 9 9s9-4 9-9V7z', 'M8 12l3 3 5-6'],
  mensagem: [
    'M21 14a3 3 0 01-3 3H9l-6 4V6a3 3 0 013-3h12a3 3 0 013 3z',
    'M7 8h10',
    'M7 12h6',
  ],
  predio: ['M4 21V3h12v18', 'M16 10h4v11', 'M2 21h20', 'M8 7h4M8 11h4M8 15h4'],
  mais: ['M12 4v16', 'M4 12h16'],
  menos: ['M4 12h16'],
  sair: ['M9 4H4v16h5', 'M8 12h13', 'M16 7l5 5-5 5'],
  olho: [
    'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0',
  ],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  estorno: ['M3 12a9 9 0 103-6.7L3 8', 'M3 3v5h5'],
  mala: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18'],
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
