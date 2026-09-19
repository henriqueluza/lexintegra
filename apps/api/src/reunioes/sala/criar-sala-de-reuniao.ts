import { GraphSalaDeReuniao } from './graph.sala-de-reuniao.js';
import type { ConfiguracaoReunioes } from './modo.js';
import {
  SalaDeReuniaoDesligada,
  SalaDeReuniaoFalsa,
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
 * O RAMO DO GRAPH E INALCANCAVEL NESTA ETAPA, e de proposito: `configuracaoDeReunioes`
 * nunca devolve credencial (`graph` derruba o boot), entao `configuracao.graph`
 * e sempre `null`. O ramo existe escrito para que ligar a integracao seja um
 * commit que muda `modo.ts`, e nao um que precise descobrir onde instanciar o
 * adaptador.
 *
 * Nenhuma validacao acontece aqui: ramos na ordem de prioridade, e nada mais.
 * Quem valida e `configuracaoDeReunioes`, no boot.
 */
export function criarSalaDeReuniao(
  configuracao: ConfiguracaoReunioes,
): SalaDeReuniao {
  if (configuracao.modo === 'desligado') return new SalaDeReuniaoDesligada();
  if (configuracao.graph === null) return new SalaDeReuniaoFalsa();

  return new GraphSalaDeReuniao(configuracao.graph);
}
