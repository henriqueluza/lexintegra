/**
 * O vocabulario do outbox (ADR-03), compartilhado entre servidor e interface.
 *
 * Vive aqui pela mesma razao de `estado-entregavel.ts`: a tela de reenvio do
 * administrador global (plano de execucao, Etapa 7) mostra tipo e estado de cada
 * registro, e precisa exibir exatamente os valores que o servidor grava. Duas
 * listas em lugares diferentes divergem — e aqui divergir significa um estado que
 * a tela nao sabe desenhar, ou um filtro que nunca casa.
 *
 * IMPORTE POR SUBCAMINHO no frontend (`shared/evento-outbox`), nunca pelo barril:
 * o barril reexporta os schemas zod, e zod entra com todos os locales. Um import
 * de barril num arquivo alcancado pelo `app.config.ts` ja levou o pacote inicial
 * de 256 kB para 722 kB.
 */

/**
 * Tipos de evento que o outbox entrega. Fixos no codigo, nao dado configuravel:
 * cada tipo tem um montador de mensagem correspondente no despachante, e um tipo
 * sem montador seria um registro que nunca sai.
 *
 * `definir-senha` e `redefinir-senha` produzem e-mails parecidos e mesmo assim
 * sao eventos DIFERENTES: "o administrador criou um acesso de advogado" e "alguem
 * pediu para redefinir a propria senha" sao fatos de negocio distintos.
 * Colapsa-los perderia a trilha de auditoria e daria aos dois o mesmo texto.
 *
 * `aviso-exclusao-arquivos` e o aviso previo da Etapa 11 (arquitetura, secao 13):
 * antes de qualquer exclusao de dado o titular recebe e-mail com antecedencia. O
 * aviso que nao chega e exatamente o que a secao 13 nao admite — e e por isso que
 * ele nasce no outbox como os outros.
 */
export const TIPOS_EVENTO = [
  'definir-senha',
  'redefinir-senha',
  'aviso-exclusao-arquivos',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/**
 * O ciclo de vida de uma entrega.
 *
 * `abandonado` e o quarto estado, e nasceu na Etapa 7 junto com o varredor. Sem
 * ele, um registro permanentemente quebrado — usuario apagado, modelo removido do
 * provedor — seria reenfileirado a cada minuto para sempre. Ele NAO duplica o
 * `max_attempts` da fila: aquele decide quando a TAREFA morre; este decide quando
 * o VARREDOR para de criar tarefas novas. Sai de `abandonado` so por reenvio
 * manual do administrador.
 */
export const ESTADOS_ENTREGA = [
  'pendente',
  'enviado',
  'falhou',
  'abandonado',
] as const;

export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number];

export function ehEstadoEntrega(valor: unknown): valor is EstadoEntrega {
  return (
    typeof valor === 'string' &&
    (ESTADOS_ENTREGA as readonly string[]).includes(valor)
  );
}

/**
 * Criticidade do evento (ADR-03).
 *
 * "O que diferencia um evento critico de um tolerante nao e o mecanismo, e a
 * politica: numero de tentativas, agressividade do backoff e se dispara alerta."
 * O mecanismo e um so; isto e a politica.
 */
export const CRITICIDADES = ['aviso', 'critico'] as const;

export type Criticidade = (typeof CRITICIDADES)[number];

/**
 * Um registro so pode ser reenviado a mao quando ja parou de andar sozinho.
 *
 * Reenviar um registro `pendente` criaria uma segunda tarefa para algo que a fila
 * ainda vai entregar — e o arrendamento no servidor recusaria a segunda, o que
 * transformaria o botao numa acao que nao faz nada e nao diz por que. A interface
 * esconde o botao; o servidor recusa de qualquer jeito.
 */
export function permiteReenvioManual(estado: EstadoEntrega): boolean {
  return estado === 'falhou' || estado === 'abandonado';
}
