/**
 * Verificacao de magic bytes: o conteudo do arquivo confere com o tipo
 * declarado?
 *
 * POR QUE ISSO EXISTE ALEM DO ANTIVIRUS. O ClamAV responde "tem malware
 * conhecido?"; esta funcao responde outra pergunta — "isto e mesmo um PDF?". Um
 * HTML com extensao `.pdf` passa limpo pelo antivirus e, servido de um dominio
 * que compartilhe cookies com a aplicacao, vira XSS na propria origem
 * (arquitetura 7.3). As duas defesas sao complementares, e nenhuma cobre a outra.
 *
 * O QUE ELA NAO E: prova de que o arquivo e valido. Um PDF com cabecalho certo e
 * corpo corrompido passa daqui — e deve passar, porque validar PDF nao e trabalho
 * desta plataforma. O que ela impede e a divergencia entre o que foi declarado e
 * o que chegou.
 *
 * Vive em `packages/shared` porque a lista de assinaturas precisa ser a mesma que
 * `POLITICA_UPLOAD` autoriza — duas listas em lugares diferentes divergem, e a
 * que divergir vai aceitar um tipo que a outra recusa.
 */

/** Quantos bytes do inicio do arquivo bastam para decidir. */
export const BYTES_NECESSARIOS = 12;

/**
 * As assinaturas, por tipo MIME.
 *
 * JPEG: `FF D8 FF` — os tres primeiros bytes de todo JPEG, qualquer variante.
 * PDF: `%PDF-` em ASCII.
 *
 * O PDF permite lixo ANTES do `%PDF-` segundo a especificacao, e alguns leitores
 * aceitam. Nao aceitamos: um arquivo que precisa de tolerancia para ser
 * reconhecido e exatamente o que se quer recusar numa fronteira de upload.
 */
const ASSINATURAS: Readonly<Record<string, readonly number[]>> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
};

export function tipoTemAssinaturaConhecida(tipo: string): boolean {
  return Object.hasOwn(ASSINATURAS, tipo);
}

/**
 * `true` quando o inicio do arquivo bate com o tipo declarado.
 *
 * TIPO DESCONHECIDO DEVOLVE `false`, e nao `true`. E a diferenca entre "nao sei
 * verificar, entao deixa passar" e "nao sei verificar, entao nao passa" — num
 * portao de upload, a primeira e como um tipo novo entra sem conferencia. Se um
 * tipo for acrescentado a politica sem assinatura aqui, todo arquivo dele e
 * recusado, o que aparece na hora.
 */
export function conteudoBateComTipo(
  inicio: Uint8Array,
  tipoDeclarado: string,
): boolean {
  const assinatura = ASSINATURAS[tipoDeclarado] as
    readonly number[] | undefined;
  if (assinatura === undefined) return false;
  if (inicio.length < assinatura.length) return false;

  return assinatura.every((byte, indice) => inicio[indice] === byte);
}
