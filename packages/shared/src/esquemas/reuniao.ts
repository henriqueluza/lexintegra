import { z } from 'zod';
import type { EstadoReuniao } from '../estado-reuniao.js';

/**
 * O agendamento de reuniao (itens 2.7.1 a 2.7.4, ADR-05, ADR-12 e ADR-21).
 *
 * O CORPO TEM UM CAMPO SO, e isso e o desenho e nao economia. O cliente escolhe
 * um SLOT que o advogado publicou (ADR-06), e nao um horario livre: a plataforma
 * e a fonte da verdade da disponibilidade. Um corpo com `inicio` e `fim` deixaria
 * o cliente propor qualquer instante, e o servidor teria que procurar o slot
 * correspondente — com a pergunta "e se nao houver nenhum?" respondida em algum
 * lugar que nao e este.
 *
 * O `slotId` ja carrega o advogado e o instante (`{advogadoId}_{inicioISO}`, ver
 * `idDoSlot`), entao o servidor nao precisa de mais nada para conferir tudo:
 * quem e o advogado, quando e, e se o slot existe.
 *
 * NAO HA CORPO DE CANCELAMENTO. Cancelar e `POST .../cancelamento` sem corpo,
 * como o cancelamento de pedido da Etapa 8 — a unica informacao e "este", e ela
 * ja esta no caminho.
 */

/**
 * O id do slot, validado com a forma que `idDoSlot` produz.
 *
 * O teto existe porque o valor vira caminho de documento: `advogadoId` e um uid
 * do Firebase (28 caracteres) mais um instante ISO, e qualquer coisa muito maior
 * que isso e entrada forjada, nao erro de digitacao.
 */
const slotId = z
  .string()
  .trim()
  .min(1, 'Escolha um horario.')
  .max(200, 'Identificador de horario invalido.');

export const esquemaAgendamento = z.object({ slotId });
export type Agendamento = z.infer<typeof esquemaAgendamento>;

/**
 * A remarcacao tem o MESMO corpo do agendamento, e mesmo assim e um schema
 * proprio.
 *
 * Reaproveitar `esquemaAgendamento` funcionaria hoje e amarraria os dois para
 * sempre: a remarcacao e a operacao que mais provavelmente ganha um campo
 * (motivo, aviso ao advogado), e o dia em que ganhar, um schema compartilhado
 * passaria a aceitar esse campo tambem no agendamento.
 */
export const esquemaRemarcacao = z.object({ slotId });
export type Remarcacao = z.infer<typeof esquemaRemarcacao>;

/**
 * Um horario que o cliente pode escolher para ESTE pedido.
 *
 * Nao e `SlotResumo`: aquele e a grade do advogado, e carrega `semana`, que nao
 * significa nada para quem esta marcando. Este e o resultado de um filtro que ja
 * aplicou saldo, janela, intervalo e antecedencia (ADR-21) — o que chega aqui e
 * escolhivel, e a tela nao precisa reaplicar regra nenhuma para desenhar a lista.
 */
export type HorarioDisponivel = {
  readonly slotId: string;
  /** ISO 8601 em UTC. A tela formata em `America/Sao_Paulo`. */
  readonly inicio: string;
  readonly fim: string;
};

/**
 * O que a tela mostra de uma reuniao.
 *
 * `type` e nao `interface`, pela razao de sempre neste pacote: `app-tabela`
 * recebe `Record<string, unknown>`, e so alias de tipo ganha assinatura de indice
 * implicita. Com `interface`, a agenda do advogado compila no teste e quebra no
 * `ng build` (aconteceu com `EntregaResumo` na Etapa 7).
 *
 * `link` e `null` enquanto a sala nao existe, e a tela DIZ isso ("link a
 * caminho") em vez de esconder a reuniao — e a regra inviolavel 13: nunca mostrar
 * link vazio nem o de outra reuniao como alternativa.
 *
 * NAO CARREGA `uid` NEM `sequence`. Sao campos do iCalendar, do interesse do
 * servidor e de nenhum pixel: expo-los convidaria uma tela futura a monta-los, e
 * o `UID` estavel e o que faz a remarcacao atualizar o evento em vez de criar um
 * segundo (regra inviolavel 12).
 */
export type ReuniaoResumo = {
  readonly id: string;
  readonly inicio: string;
  readonly fim: string;
  readonly estado: EstadoReuniao;
  readonly link: string | null;
};

/**
 * Uma linha da agenda do advogado (item 2.7.1, "calendario interno").
 *
 * E OUTRO TIPO, e nao `ReuniaoResumo` com campos opcionais, pela mesma razao que
 * separa `CartaoPedido` de `DemandaResumo`: a diferenca nao e de apresentacao, e
 * de autorizacao. O cliente nao ve o nome de outro cliente; o advogado precisa
 * ver de quem e a reuniao para se preparar. Um tipo unico com `cliente?` obrigaria
 * cada caminho de leitura a lembrar de apagar o campo — e "lembrar de apagar" e
 * como dado vaza.
 *
 * `type` e nao `interface`: vai para `app-tabela`.
 */
export type ReuniaoDaAgenda = {
  readonly id: string;
  readonly pedidoId: string;
  readonly produto: string;
  readonly cliente: string;
  readonly inicio: string;
  readonly fim: string;
  readonly estado: EstadoReuniao;
  readonly link: string | null;
};

/**
 * Uma linha do painel de reunioes sem sala do administrador.
 *
 * E a arquitetura 7.2 em forma de tipo: "precisa virar estado visivel e acionavel
 * no painel do admin, nao erro silencioso". `eventoOutboxId` e o que torna a linha
 * ACIONAVEL — o botao de tentar de novo reenvia aquele registro pelo caminho
 * normal do outbox, e nao por um caminho proprio (regra inviolavel 3).
 *
 * NAO CARREGA O NOME DO CLIENTE. O administrador aqui esta consertando
 * infraestrutura, nao atendendo ninguem; o pedido basta para ele achar o caso.
 */
export type ReuniaoSemSala = {
  readonly id: string;
  readonly pedidoId: string;
  readonly advogadoId: string;
  readonly inicio: string;
  readonly fim: string;
  readonly estado: EstadoReuniao;
  readonly eventoOutboxId: string;
};
