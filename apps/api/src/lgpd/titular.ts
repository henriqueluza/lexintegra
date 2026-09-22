import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { MAPA_TITULAR } from './mapa.js';

export interface Titular {
  readonly chave: string;
  readonly uid: string | null;
  readonly preCadastroId: string;
  readonly conta: UserRecord | null;
}

export function validarAlvo(tipo: string, id: string): void {
  if (
    !['clientes', 'pre-cadastros'].includes(tipo) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(id)
  ) {
    throw new BadRequestException('Identificador de titular invalido.');
  }
}

export async function resolverTitular(
  db: Firestore,
  auth: Auth,
  tipo: string,
  id: string,
): Promise<Titular> {
  validarAlvo(tipo, id);
  if (tipo === 'clientes') return deConta(await obterConta(auth, id));
  const pre = await db
    .collection(MAPA_TITULAR.preCadastros.colecao)
    .doc(id)
    .get();
  const email = pre.data()?.['email'] as unknown;
  if (
    !pre.exists ||
    typeof email !== 'string' ||
    idDoPreCadastro(email) !== id
  ) {
    throw new NotFoundException('Titular nao encontrado.');
  }
  try {
    return deConta(await auth.getUserByEmail(email));
  } catch (erro) {
    if (!usuarioAusente(erro)) throw erro;
  }
  return {
    chave: chaveDoTitular(`pre:${id}`),
    uid: null,
    preCadastroId: id,
    conta: null,
  };
}

function deConta(conta: UserRecord): Titular {
  if (conta.customClaims?.['role'] !== 'cliente' || conta.email === undefined) {
    throw new NotFoundException('Titular cliente nao encontrado.');
  }
  return {
    chave: chaveDoTitular(`uid:${conta.uid}`),
    uid: conta.uid,
    conta,
    preCadastroId: idDoPreCadastro(conta.email.trim().toLowerCase()),
  };
}

export function chaveDoTitular(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

async function obterConta(auth: Auth, uid: string): Promise<UserRecord> {
  try {
    return await auth.getUser(uid);
  } catch (erro) {
    if (usuarioAusente(erro))
      throw new NotFoundException('Titular nao encontrado.');
    throw erro;
  }
}

function usuarioAusente(erro: unknown): boolean {
  return (erro as { code?: string } | null)?.code === 'auth/user-not-found';
}
