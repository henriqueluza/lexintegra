import { deflateRawSync } from 'node:zlib';

/**
 * ARNES DE TESTE, nao codigo de producao — fora da cobertura pela mesma razao de
 * `arnes-pedidos.ts`.
 *
 * Um ZIP minimo e real: cabecalhos locais, diretorio central e o registro de
 * fim, no formato que o Word grava. Montado no teste, e nao lido de fixture,
 * para o teste mostrar exatamente o que muda entre um DOCX e um DOCM.
 */
export interface EntradaDeTeste {
  readonly nome: string;
  readonly conteudo: string;
  readonly metodo?: 0 | 8 | 12;
  readonly cifrada?: boolean;
}

/**
 * Um ZIP minimo e real: cabecalhos locais, diretorio central e o registro de
 * fim, no formato que o Word grava. Escrito aqui, e nao lido de fixture, para o
 * teste mostrar exatamente o que muda entre um DOCX e um DOCM.
 */
export function zip(
  entradas: readonly EntradaDeTeste[],
  opcoes: { zip64?: boolean } = {},
): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const metodo = entrada.metodo ?? 8;
    const nome = Buffer.from(entrada.nome);
    const bruto = Buffer.from(entrada.conteudo);
    const dados = metodo === 8 ? deflateRawSync(bruto) : bruto;
    const flag = entrada.cifrada === true ? 1 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flag, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flag, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(bruto.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nome);

    deslocamento += 30 + nome.length + dados.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(opcoes.zip64 === true ? 0xffff : entradas.length, 8);
  fim.writeUInt16LE(opcoes.zip64 === true ? 0xffff : entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);

  return new Uint8Array(Buffer.concat([...locais, diretorio, fim]));
}

export const TIPOS_DOCX = `<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
export const TIPOS_DOCM = `<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>`;
export const TIPOS_PLANILHA = `<?xml version="1.0"?><Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;

export const DOCX: EntradaDeTeste[] = [
  { nome: '[Content_Types].xml', conteudo: TIPOS_DOCX },
  { nome: 'word/document.xml', conteudo: '<w:document/>' },
];
