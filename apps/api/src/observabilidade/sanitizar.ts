import { redigirEnderecos } from '../email/redigir.js';

/**
 * Limpa texto de origem externa antes de ele virar linha de log.
 *
 * O caso que obriga isto e o relato de erro do navegador (ADR-08): e a unica
 * entrada do sistema em que texto produzido na maquina do titular vira log. Uma
 * mensagem de erro de formulario carrega valor digitado com frequencia
 * desconfortavel — "e-mail invalido: fulano@x.com", "CPF 000.000.000-00 nao
 * confere" —, e a secao de LGPD proibe registrar dado pessoal identificavel.
 *
 * MESMA ASSIMETRIA DELIBERADA DE `redigirEnderecos`: limpar demais estraga um
 * diagnostico, limpar de menos deixa dado pessoal em log. Por isso a sequencia
 * de onze ou mais digitos vai embora inteira, mesmo custando um carimbo de tempo
 * legivel aqui e ali — CPF e telefone tem exatamente esse formato, e nenhum
 * numero comprido e util o bastante para justificar o risco.
 */
const DIGITOS_DEMAIS = /\d[\d.\-/\s]{9,}\d/g;

export function sanitizar(texto: string, teto: number): string {
  return redigirEnderecos(texto)
    .replace(DIGITOS_DEMAIS, '[digitos]')
    .slice(0, teto);
}
