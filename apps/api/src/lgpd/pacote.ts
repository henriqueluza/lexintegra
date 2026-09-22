import { PayloadTooLargeException } from '@nestjs/common';
import { Timestamp } from 'firebase-admin/firestore';

export interface EntradaPacote {
  readonly nome: string;
  readonly bytes: Buffer;
}
const LIMITE_PACOTE = 25 * 1024 * 1024;

/** TAR USTAR sem compressao: JSON UTF-8 e arquivos com nomes numericos seguros.
 * Nao usa nomes do usuario como caminhos. Nao persiste pacote nem URL de acesso.
 */
export function pacoteTar(entradas: readonly EntradaPacote[]): Buffer {
  const partes: Buffer[] = [];
  let tamanho = 1024;
  for (const entrada of entradas) {
    const preenchimento = (512 - (entrada.bytes.length % 512)) % 512;
    tamanho += 512 + entrada.bytes.length + preenchimento;
    if (tamanho > LIMITE_PACOTE)
      throw new PayloadTooLargeException(
        'Exportacao excede 25 MiB. Nenhum pacote parcial foi emitido.',
      );
    partes.push(cabecalho(entrada), entrada.bytes, Buffer.alloc(preenchimento));
  }
  return Buffer.concat([...partes, Buffer.alloc(1024)]);
}

function cabecalho(entrada: EntradaPacote): Buffer {
  if (!/^(dados\.json|arquivos\/[0-9]+\.(pdf|jpg|bin))$/.test(entrada.nome))
    throw new Error('Nome de entrada invalido.');
  const header = Buffer.alloc(512);
  header.write(entrada.nome, 0, 100, 'ascii');
  header.write('0000600\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(
    `${entrada.bytes.length.toString(8).padStart(11, '0')}\0`,
    124,
    12,
    'ascii',
  );
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(32, 148, 156);
  header.write('0', 156);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const soma = header.reduce((total, byte) => total + byte, 0);
  header.write(`${soma.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

/** Credenciais e identificadores de acesso nao integram portabilidade.
 * Datas do Firestore viram ISO em vez de detalhes internos do SDK.
 */
export function dadosLegiveis(valor: unknown): unknown {
  if (valor instanceof Timestamp) return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(dadosLegiveis);
  if (valor === null || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(
        ([chave]) =>
          ![
            'liberacaoHash',
            'passwordHash',
            'passwordSalt',
            'tokensValidAfterTime',
            'link',
            'url',
            'rastreio',
            'ultimoErro',
          ].includes(chave),
      )
      .map(([chave, dado]) => [chave, dadosLegiveis(dado)]),
  );
}
