/**
 * Quanto o scanner leva para subir e para varrer (lote de novembro, ajuste 13).
 *
 * O pedido era "a verificacao de seguranca e lenta", e o contentor nao dizia
 * onde o tempo ia: o boot so tinha `echo`, e a varredura nao media nada. Daqui
 * saem duas coisas:
 *
 *   1. as medidas que vao JUNTO DO VEREDITO, para a API escrever uma linha so
 *      por arquivo, com as fases dos dois servicos lado a lado;
 *   2. a linha `scanner.pronto`, com o tempo de baixar a base e de subir o
 *      `clamd`, uma vez por instancia.
 *
 * SO NUMEROS. Nada daqui carrega caminho de objeto, que identifica o pedido (ver
 * a nota em `servidor.ts`).
 *
 * FUNCOES PURAS, com o relogio vindo de fora: `servidor.ts` nao tem teste (ele
 * sobe um servidor ao ser importado), entao a conta mora aqui.
 */

/** O que acompanha o veredito. A API confere os valores antes de usar. */
export interface MedidasDaVarredura {
  /** Primeira varredura desta instancia: quem pagou o boot foi esta. */
  readonly frio: boolean;
  /** Do comeco do script de entrada ate o servidor ouvir. So quando `frio`. */
  readonly bootMs?: number;
  /** Baixar o objeto do bucket para o disco temporario. */
  readonly downloadMs: number;
  /** O `clamdscan`, do comando ao veredito. */
  readonly clamMs: number;
}

/**
 * Os instantes do boot, em milissegundos desde 1970, que `entrada.sh` exporta
 * antes de entregar o processo ao Node.
 */
export interface InstantesDoBoot {
  readonly inicio: number | null;
  /** Base de assinaturas no disco (baixada do bucket ou do mirror). */
  readonly base: number | null;
  /** `clamd` com o socket aberto, ou a espera esgotada. */
  readonly clamd: number | null;
}

export interface DuracoesDoBoot {
  readonly baixarBaseMs: number | null;
  readonly clamdMs: number | null;
  readonly bootMs: number | null;
}

/** Epoca em milissegundos, como texto de digitos. Qualquer outra coisa, `null`. */
function instante(valor: string | undefined): number | null {
  if (valor === undefined || !/^\d{10,16}$/.test(valor)) return null;
  return Number(valor);
}

export function instantesDoBoot(
  ambiente: Readonly<Record<string, string | undefined>>,
): InstantesDoBoot {
  return {
    inicio: instante(ambiente['BOOT_INICIO_MS']),
    base: instante(ambiente['BOOT_BASE_MS']),
    clamd: instante(ambiente['BOOT_CLAMD_MS']),
  };
}

/** `null` quando falta uma ponta ou quando o fim vem antes do comeco. */
function entre(inicio: number | null, fim: number | null): number | null {
  if (inicio === null || fim === null || fim < inicio) return null;
  return fim - inicio;
}

/**
 * As tres duracoes do boot. `ouvindoEm` e o instante em que o servidor HTTP
 * abriu a porta — o fim do boot que este processo enxerga. O que vem ANTES do
 * script de entrada (o Cloud Run baixar a imagem e iniciar o contentor) nao
 * aparece aqui: a API o ve como a diferenca entre a chamada inteira e a soma
 * das partes.
 */
export function duracoesDoBoot(
  boot: InstantesDoBoot,
  ouvindoEm: number,
): DuracoesDoBoot {
  return {
    baixarBaseMs: entre(boot.inicio, boot.base),
    clamdMs: entre(boot.base, boot.clamd),
    bootMs: entre(boot.inicio, ouvindoEm),
  };
}

/** Roda o trabalho e devolve o resultado com quanto ele levou. */
export async function cronometrar<T>(
  agora: () => number,
  trabalho: () => Promise<T>,
): Promise<{ readonly resultado: T; readonly ms: number }> {
  const comeco = agora();
  const resultado = await trabalho();
  return { resultado, ms: Math.max(0, agora() - comeco) };
}

/**
 * Diz se esta e a PRIMEIRA varredura da instancia, e so uma vez.
 *
 * E o que separa "frio" de "quente" na tabela. A primeira varredura depois de o
 * contentor subir e a que esperou o boot; todas as seguintes encontram o `clamd`
 * com as assinaturas ja em memoria.
 */
export function criarMarcadorDeFrio(): () => boolean {
  let primeira = true;

  return () => {
    const era = primeira;
    primeira = false;
    return era;
  };
}

/** Monta as medidas de uma varredura. `bootMs` so entra na primeira. */
export function medidasDaVarredura(entrada: {
  readonly frio: boolean;
  readonly bootMs: number | null;
  readonly downloadMs: number;
  readonly clamMs: number;
}): MedidasDaVarredura {
  return {
    frio: entrada.frio,
    ...(entrada.frio && entrada.bootMs !== null
      ? { bootMs: entrada.bootMs }
      : {}),
    downloadMs: entrada.downloadMs,
    clamMs: entrada.clamMs,
  };
}
