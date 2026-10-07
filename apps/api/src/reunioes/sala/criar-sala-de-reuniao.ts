import { GraphSalaDeReuniao } from './graph.sala-de-reuniao.js';
import type { ConfiguracaoReunioes } from './modo.js';
import {
  SalaDeReuniaoDesligada,
  SalaDeReuniaoFalsa,
  SalaDeReuniaoPendente,
} from './sala-de-reuniao-falsa.js';
import type { SalaDeReuniao } from './sala-de-reuniao.js';

/**
 * Escolhe a implementacao pela configuracao ja validada em `modo.ts`.
 *
 * E O UNICO LUGAR QUE INSTANCIA O ADAPTADOR DO GRAPH, protegido pela regra de
 * dependency-cruiser `so-a-fabrica-conhece-o-graph`. Um `new GraphSalaDeReuniao`
 * em outro modulo passaria por cima da trava de modo inteira — e o que esta do
 * outro lado dela e o tenant da B&C, com advogados e clientes reais.
 *
 * O RAMO DO GRAPH SO E ALCANCADO COM A TRAVA ABERTA: `configuracaoDeReunioes`
 * so devolve credencial no modo `graph`, e `graph` derruba o boot enquanto
 * `INTEGRACAO_GRAPH_DESTRAVADA` for `false`. Ligar e o commit que troca a
 * constante, sem descobrir onde instanciar o adaptador.
 *
 * Nenhuma validacao acontece aqui: ramos na ordem de prioridade, e nada mais.
 * Quem valida e `configuracaoDeReunioes`, no boot.
 */
export function criarSalaDeReuniao(
  configuracao: ConfiguracaoReunioes,
): SalaDeReuniao {
  if (configuracao.modo === 'desligado') return new SalaDeReuniaoDesligada();
  /* ANTES do falso: `sem-sala` tambem tem `graph: null`, e cairia nele. */
  if (configuracao.modo === 'sem-sala') return new SalaDeReuniaoPendente();
  if (configuracao.graph === null) return new SalaDeReuniaoFalsa();

  return new GraphSalaDeReuniao(configuracao.graph);
}
