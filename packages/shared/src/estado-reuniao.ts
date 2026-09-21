/**
 * Os estados de uma reuniao (Etapa 10, ADR-05 e ADR-12).
 *
 * NAO E A MAQUINA DE ESTADOS DO ENTREGAVEL, e nao se parece com ela de proposito.
 * O ADR-11 fixa quatro estados de TRABALHO, com transicoes disparadas por eventos
 * de dominio. Aqui sao quatro situacoes de um COMPROMISSO, e a diferenca que
 * importa e que duas delas sao terminais e dizem coisas opostas sobre dinheiro.
 *
 * Vive em `packages/shared`, sem zod, pela mesma razao de `estado-entregavel.ts`:
 * a tela do cliente desenha o estado de cada reuniao e precisa exatamente dos
 * valores que o servidor grava. Duas listas em lugares diferentes divergem — e
 * aqui divergir significa um selo que a tela nao sabe pintar, ou pior, um saldo
 * calculado com um estado a menos.
 *
 * IMPORTE POR SUBCAMINHO no frontend (`shared/estado-reuniao`), nunca pelo
 * barril: o barril reexporta os schemas zod, e zod entra com todos os locales.
 */

/**
 * `reservada_sem_link` e o estado que a arquitetura 7.2 exige que exista.
 *
 * "Se a chamada a Graph API falhar no momento da confirmacao, existe reuniao
 * reservada no slot sem link de videoconferencia. Precisa virar estado visivel e
 * acionavel no painel do admin, nao erro silencioso."
 *
 * Ele nao e um estado de erro: o slot esta reservado, o saldo esta consumido e o
 * compromisso vale. O que falta e a sala, e ela chega pela reentrega do outbox.
 * Por isso a reuniao nasce aqui e nao em `confirmada` — nascer confirmada sem
 * link obrigaria a tela a distinguir "confirmada com link" de "confirmada sem",
 * que e o mesmo estado com outro nome e um campo a conferir.
 *
 * OS DOIS CANCELAMENTOS SAO ESTADOS DIFERENTES, e nao um estado com um booleano.
 * A distincao e a regra das 24 horas do ADR-12 — se a reuniao volta ou nao ao
 * saldo do pedido — e ela e lida por `saldoDeReunioes` a cada calculo. Um
 * `cancelada` com `devolveu: boolean` daria o mesmo resultado e deixaria a regra
 * legivel so para quem lembrasse de olhar o segundo campo.
 */
export const ESTADOS_REUNIAO = [
  'reservada_sem_link',
  'confirmada',
  'cancelada_com_devolucao',
  'cancelada_sem_devolucao',
] as const;

export type EstadoReuniao = (typeof ESTADOS_REUNIAO)[number];

/**
 * A reuniao ainda ocupa o slot e o saldo.
 *
 * Existe como funcao, e nao como comparacao espalhada, porque a pergunta e feita
 * em cinco lugares — saldo, intervalo, liberacao do slot, a recusa de remover
 * disponibilidade reservada e a recusa de trocar o advogado. Cinco copias de
 * `estado === 'confirmada' || estado === 'reservada_sem_link'` divergem no dia em
 * que aparecer um quinto estado, e a que divergir vai contar saldo a menos.
 */
export function reuniaoAtiva(estado: EstadoReuniao): boolean {
  return estado === 'reservada_sem_link' || estado === 'confirmada';
}

/**
 * A reuniao consumiu uma unidade do saldo do pedido.
 *
 * TUDO MENOS `cancelada_com_devolucao` consome (ADR-12, decisao 4 do ADR-21).
 * Escrito como negacao de UM estado, e nao como lista dos outros tres, porque e
 * assim que a regra foi decidida — "cancelamento com menos de 24 horas de
 * antecedencia, ou nao comparecimento, consome a reuniao do saldo sem devolucao".
 * Uma lista dos que consomem convidaria a esquecer de acrescentar um estado novo,
 * e o erro seria silencioso: o cliente ganharia uma reuniao a mais.
 */
export function reuniaoConsomeSaldo(estado: EstadoReuniao): boolean {
  return estado !== 'cancelada_com_devolucao';
}
