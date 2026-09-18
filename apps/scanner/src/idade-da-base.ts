/**
 * Quando a base de assinaturas foi gerada — o unico sinal honesto de que o
 * antivirus ainda e um antivirus.
 *
 * O ALERTA QUE ISTO ALIMENTA NAO E "O JOB FALHOU". O job diario pode terminar
 * verde e publicar a base de tres semanas atras: o `freshclam` sai com sucesso
 * quando o mirror recusa a conexao por limite de taxa e nao ha nada novo a
 * aplicar, e o bucket entao recebe de volta os mesmos bytes. Um scanner que
 * responde "limpo" com assinaturas velhas e pior que um scanner fora do ar,
 * porque parece estar funcionando (arquitetura, secao 9).
 *
 * Duas fontes, de propositos diferentes:
 *
 * - `geradaEmDoCabecalho` le o que o job PUBLICOU. Responde "a base no bucket
 *   esta velha?".
 * - `versaoDoClamd` le o que o daemon CARREGOU. Responde "esta instancia esta
 *   varrendo com base velha?" — que e outra pergunta, porque a base e carregada
 *   no boot e a instancia pode viver dias.
 *
 * As duas sao funcoes puras, pela mesma razao de `veredito.ts`: o resto do
 * contentor e processo e rede, e a decisao, que e onde se erra, cabe aqui.
 */

/**
 * O cabecalho de um `.cvd`/`.cld` sao 512 bytes de texto separados por
 * dois-pontos: `ClamAV-VDB:dd MMM yyyy HH-MM ±ZZZZ:versao:...`.
 *
 * A hora vem com HIFEN no lugar dos dois-pontos — porque dois-pontos e o
 * separador de campo do proprio cabecalho. Sem desfazer isso, a data nao e
 * reconhecida e a idade viraria `null` justamente quando ela importa.
 */
export function geradaEmDoCabecalho(cabecalho: string): Date | null {
  const campos = cabecalho.split(':');
  if (campos[0] !== 'ClamAV-VDB' || campos.length < 2) return null;

  const instante = Date.parse(campos[1].replace(/(\d{2})-(\d{2})/, '$1:$2'));
  return Number.isNaN(instante) ? null : new Date(instante);
}

/**
 * A saida de `clamdscan --version`: `ClamAV 1.0.3/27123/Mon Sep 15 08:30:00 2026`.
 *
 * O numero do meio e a versao da base; o terceiro campo, a data em que ela foi
 * gerada. E o daemon respondendo sobre a base que ele TEM CARREGADA, que e o que
 * decide o veredito desta varredura.
 */
export function versaoDoClamd(saida: string): {
  readonly versao: string | null;
  readonly geradaEm: Date | null;
} {
  const campos = saida.trim().split('/');
  if (campos.length < 3) return { versao: null, geradaEm: null };

  const instante = Date.parse(campos[2]);

  return {
    versao: campos[1],
    geradaEm: Number.isNaN(instante) ? null : new Date(instante),
  };
}

export function idadeEmHoras(geradaEm: Date, agora: Date): number {
  return Math.max(
    0,
    Math.round((agora.getTime() - geradaEm.getTime()) / 3_600_000),
  );
}
