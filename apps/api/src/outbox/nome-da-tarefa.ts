/**
 * O nome da tarefa no Cloud Tasks — e ARQUIVO PROPRIO de proposito.
 *
 * Ele e a primeira das tres camadas contra entrega duplicada: o Cloud Tasks
 * deduplica por nome, e e isso que impede o varredor de criar uma segunda tarefa
 * para um registro cuja tarefa ainda esta viva na fila.
 *
 * A camada e fragil de um jeito particular: um chamador que monte o nome a mao,
 * com um campo a menos, nao quebra nada — a tarefa e criada, o teste passa, e a
 * deduplicacao simplesmente deixa de acontecer. O sintoma aparece em producao,
 * como e-mail duplicado, longe da causa.
 *
 * MESMA FORMA DE `arquivos/leitura.ts` (regra inviolavel 6), e pelo mesmo motivo:
 * ha teste provando que `EnfileiradorDeEventos` monta o nome certo, mas nenhum
 * teste prova que ALGUEM MAIS nao montou um por fora. Isolar a funcao aqui e
 * restringir quem a importa, por regra de dependency-cruiser, e o que transforma
 * essa segunda garantia em lint — e lint roda em todo commit, inclusive nos que
 * ninguem revisou com atencao.
 */

/**
 * INCLUI `tentativas` DE PROPOSITO. Depois de uma tentativa que falhou de verdade,
 * queremos uma tarefa nova — e uma tarefa nova precisa de nome novo, senao a
 * deduplicacao que protege no caso comum passa a impedir a reentrega no caso que
 * mais precisa dela.
 *
 * `ciclo` entra pelo mesmo raciocinio, uma camada acima: o reenvio manual do
 * administrador tem que produzir tarefa nova.
 *
 * Cloud Tasks aceita letras, numeros, hifen e sublinhado no nome; o id do evento
 * ja e formado assim (`redefinir-senha_uid_janela`), mas o uid vem do Firebase e
 * nao ha promessa disso — dai a limpeza.
 */
export function nomeDaTarefa(
  id: string,
  ciclo: number,
  tentativas: number,
): string {
  const limpo = id.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${limpo}-c${String(ciclo)}-t${String(tentativas)}`;
}
