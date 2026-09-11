/**
 * A tradução da saída do `clamdscan` para o veredito que a API entende.
 *
 * FUNCAO PURA, E E POR ISSO QUE ELA EXISTE SEPARADA. O resto deste contentor e
 * processo, rede e sistema de arquivos — nada disso da para testar sem ClamAV
 * instalado. A DECISAO, que e onde se erra, cabe aqui e e testavel sozinha.
 *
 * OS CODIGOS DE SAIDA DO CLAMSCAN:
 *   0 — nada encontrado
 *   1 — virus encontrado
 *   2 — erro
 *
 * O 2 vira `indisponivel`, e nao `infectado`. A diferenca e o que separa "nao
 * consegui verificar" de "verifiquei e esta ruim": tratar as duas igual apagaria
 * arquivo legitimo por falha de infraestrutura. Quem recebe `indisponivel` do
 * outro lado lanca, e o Cloud Tasks reentrega.
 */
export type Veredito = 'limpo' | 'infectado' | 'indisponivel';

export interface ResultadoDaVarredura {
  readonly veredito: Veredito;
  readonly assinatura?: string;
  readonly baseAtualizadaEm?: string;
}

export function interpretar(
  codigoDeSaida: number,
  saida: string,
): ResultadoDaVarredura {
  if (codigoDeSaida === 0) return { veredito: 'limpo' };

  if (codigoDeSaida === 1) {
    return { veredito: 'infectado', assinatura: extrairAssinatura(saida) };
  }

  return { veredito: 'indisponivel' };
}

/**
 * A linha do `clamdscan` tem a forma `caminho: Nome.Da.Assinatura FOUND`.
 *
 * A assinatura vai para o painel do administrador, nunca para o titular: dizer a
 * alguem QUAL malware o arquivo dele carrega e informacao que so ajuda quem
 * mandou o arquivo.
 */
function extrairAssinatura(saida: string): string {
  const linha = saida.split('\n').find((atual) => atual.includes('FOUND'));

  if (linha === undefined) return 'assinatura nao identificada';

  const semSufixo = linha.replace(/\s*FOUND\s*$/, '');
  const doisPontos = semSufixo.lastIndexOf(': ');

  return doisPontos === -1
    ? 'assinatura nao identificada'
    : semSufixo.slice(doisPontos + 2).trim();
}
