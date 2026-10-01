import { inflateRawSync } from 'node:zlib';

/**
 * A conferencia ESTRUTURAL do DOCX (`docs/decisoes.md`, 3.1).
 *
 * O magic bytes de DOCX e o de qualquer ZIP (`PK 03 04`): um `.docm` com macro,
 * uma planilha, um `.zip` qualquer renomeado — todos passam por ele. O que
 * distingue um documento do Word sem macro e o que esta DENTRO: o
 * `[Content_Types].xml` declara o conteudo principal como
 * `wordprocessingml.document.main+xml`, e o `.docm` declara
 * `document.macroEnabled.main+xml` e carrega um `vbaProject.bin`.
 *
 * LE POR FAIXA, NUNCA O ARQUIVO INTEIRO: o fim do ZIP (o diretorio central) e a
 * entrada `[Content_Types].xml`. Sem dependencia nova — o formato do ZIP e
 * estavel ha trinta anos, e `node:zlib` descomprime.
 *
 * RECUSA O QUE NAO SABE LER, em vez de deixar passar: ZIP64, entrada cifrada,
 * diretorio grande demais, compressao que nao e `deflate` nem `store`. Um DOCX
 * de 20 MB salvo pelo Word nao cai em nenhum desses casos.
 *
 * NAO E VALIDACAO DE DOCUMENTO. Um DOCX com o corpo corrompido passa daqui, como
 * um PDF corrompido passa pelo magic bytes: o que se impede e a divergencia
 * entre o declarado e o que chegou, e o codigo executavel.
 */

export type LeitorDeFaixa = (
  inicio: number,
  quantidade: number,
) => Promise<Uint8Array>;

const CONTEUDO_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

/** O fim do ZIP: 22 bytes do registro mais ate 64 KiB de comentario. */
const MAXIMO_DO_FIM = 22 + 0xffff;
/** Teto do diretorio central: um DOCX real tem dezenas de entradas. */
const MAXIMO_DO_DIRETORIO = 1024 * 1024;
/** Teto do `[Content_Types].xml`, comprimido e descomprimido. */
const MAXIMO_DO_INDICE = 256 * 1024;

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;

interface Entrada {
  readonly nome: string;
  readonly metodo: number;
  readonly cifrada: boolean;
  readonly tamanhoComprimido: number;
  readonly deslocamentoLocal: number;
}

class NaoEDocx extends Error {}

function u16(dados: Uint8Array, posicao: number): number {
  return dados[posicao] | (dados[posicao + 1] << 8);
}

function u32(dados: Uint8Array, posicao: number): number {
  return (u16(dados, posicao) | (u16(dados, posicao + 2) << 16)) >>> 0;
}

/**
 * Devolve o motivo da recusa, ou `null` quando o arquivo e um DOCX sem macro.
 */
export async function problemaDoDocx(
  ler: LeitorDeFaixa,
  tamanho: number,
): Promise<string | null> {
  try {
    const entradas = await lerDiretorio(ler, tamanho);
    conferirEntradas(entradas);
    const indice = entradas.find((e) => e.nome === '[Content_Types].xml');
    if (indice === undefined) {
      throw new NaoEDocx('Falta o [Content_Types].xml.');
    }
    conferirTiposDeConteudo(await lerEntrada(ler, indice));
    return null;
  } catch (erro) {
    if (erro instanceof NaoEDocx) return erro.message;
    return 'O arquivo nao pode ser lido como DOCX.';
  }
}

async function lerDiretorio(
  ler: LeitorDeFaixa,
  tamanho: number,
): Promise<Entrada[]> {
  const quantidade = Math.min(tamanho, MAXIMO_DO_FIM);
  const fim = await ler(tamanho - quantidade, quantidade);

  let posicao = -1;
  for (let i = fim.length - 22; i >= 0; i -= 1) {
    if (u32(fim, i) === ASSINATURA_FIM) {
      posicao = i;
      break;
    }
  }
  if (posicao < 0) throw new NaoEDocx('Nao e um arquivo ZIP valido.');

  const total = u16(fim, posicao + 10);
  const tamanhoDoDiretorio = u32(fim, posicao + 12);
  const inicioDoDiretorio = u32(fim, posicao + 16);
  if (total === 0xffff || inicioDoDiretorio === 0xffffffff) {
    throw new NaoEDocx('ZIP64 nao e aceito.');
  }
  if (tamanhoDoDiretorio > MAXIMO_DO_DIRETORIO) {
    throw new NaoEDocx('Diretorio do ZIP grande demais.');
  }

  const diretorio = await ler(inicioDoDiretorio, tamanhoDoDiretorio);
  return lerEntradas(diretorio, total);
}

function lerEntradas(diretorio: Uint8Array, total: number): Entrada[] {
  const entradas: Entrada[] = [];
  let p = 0;
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > diretorio.length || u32(diretorio, p) !== ASSINATURA_CENTRAL) {
      throw new NaoEDocx('Diretorio do ZIP corrompido.');
    }
    const tamanhoDoNome = u16(diretorio, p + 28);
    const extra = u16(diretorio, p + 30);
    const comentario = u16(diretorio, p + 32);
    entradas.push({
      nome: new TextDecoder().decode(
        diretorio.subarray(p + 46, p + 46 + tamanhoDoNome),
      ),
      metodo: u16(diretorio, p + 10),
      cifrada: (u16(diretorio, p + 8) & 0x1) === 0x1,
      tamanhoComprimido: u32(diretorio, p + 20),
      deslocamentoLocal: u32(diretorio, p + 42),
    });
    p += 46 + tamanhoDoNome + extra + comentario;
  }
  return entradas;
}

/** Sem cifra, com o corpo do Word, e sem projeto de macro em lugar nenhum. */
function conferirEntradas(entradas: readonly Entrada[]): void {
  if (entradas.some((e) => e.cifrada)) {
    throw new NaoEDocx('DOCX protegido por senha nao e aceito.');
  }
  if (!entradas.some((e) => e.nome === 'word/document.xml')) {
    throw new NaoEDocx('Falta o corpo do documento do Word.');
  }
  if (entradas.some((e) => /vbaproject\.bin$/i.test(e.nome))) {
    throw new NaoEDocx('Documento com macro (DOCM) nao e aceito.');
  }
}

async function lerEntrada(
  ler: LeitorDeFaixa,
  entrada: Entrada,
): Promise<string> {
  if (entrada.tamanhoComprimido > MAXIMO_DO_INDICE) {
    throw new NaoEDocx('[Content_Types].xml grande demais.');
  }
  const cabecalho = await ler(entrada.deslocamentoLocal, 30);
  if (u32(cabecalho, 0) !== ASSINATURA_LOCAL) {
    throw new NaoEDocx('Entrada do ZIP corrompida.');
  }
  const inicio =
    entrada.deslocamentoLocal + 30 + u16(cabecalho, 26) + u16(cabecalho, 28);
  const comprimido = await ler(inicio, entrada.tamanhoComprimido);

  if (entrada.metodo === 0) return new TextDecoder().decode(comprimido);
  if (entrada.metodo === 8) {
    return new TextDecoder().decode(
      inflateRawSync(comprimido, { maxOutputLength: MAXIMO_DO_INDICE }),
    );
  }
  throw new NaoEDocx('Compressao do ZIP nao suportada.');
}

function conferirTiposDeConteudo(indice: string): void {
  if (/macroEnabled/i.test(indice)) {
    throw new NaoEDocx('Documento com macro (DOCM) nao e aceito.');
  }
  if (!indice.includes(CONTEUDO_DOCX)) {
    throw new NaoEDocx('O arquivo nao e um documento do Word (DOCX).');
  }
}
