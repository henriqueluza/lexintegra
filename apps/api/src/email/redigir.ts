/**
 * Endereco de e-mail em texto livre. Usado para tirar destinatario de mensagem de
 * erro antes que ela seja gravada no Firestore ou registrada em log.
 *
 * O caso concreto que motivou isto: a conta de desenvolvimento do Resend responde
 * "You can only send testing emails to your own email address (fulano@dominio.com)".
 * Sem a limpeza, esse endereco entra no documento do outbox e no Cloud Logging —
 * dado pessoal identificavel, que a secao de LGPD proibe registrar. As mensagens
 * de erro do Firebase Auth tem o mesmo habito.
 *
 * Heuristica, nao um analisador de RFC 5322, e a assimetria e deliberada: limpar
 * demais estraga uma mensagem de diagnostico, limpar de menos deixa dado pessoal
 * em log. A classe da parte local exclui os delimitadores comuns para o endereco
 * entre parenteses nao levar os parenteses junto, e o dominio termina em letras
 * para o ponto final da frase nao ser engolido.
 */
const ENDERECO = /[^\s<>()[\]{},;:"']+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redigirEnderecos(texto: string): string {
  return texto.replace(ENDERECO, '[e-mail]');
}

/** Descreve um erro desconhecido em texto seguro para log e para o Firestore. */
export function descreverErro(erro: unknown): string {
  const bruto = erro instanceof Error ? erro.message : String(erro);
  return redigirEnderecos(bruto);
}
