import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { ContasClienteService } from '../../contas-cliente/contas-cliente.service.js';
import { AUTH_FIREBASE, FIRESTORE } from '../../firebase/firebase.module.js';
import { idDoPreCadastro } from '../../pre-cadastros/liberacao.js';
import { COLECAO_PRE_CADASTROS } from '../../pre-cadastros/pre-cadastros.service.js';

/** Conta opcional antes da compra (07/10/2026). Só o link recebido permite definir senha. */
@Injectable()
export class AcessoInicialService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    private readonly contas: ContasClienteService,
  ) {}

  async criarSePreCadastrado(email: string): Promise<string | null> {
    const cadastro = await this.db
      .collection(COLECAO_PRE_CADASTROS)
      .doc(idDoPreCadastro(email))
      .get();
    const dados = cadastro.data();
    if (!dados || dados['email'] !== email || typeof dados['nome'] !== 'string')
      return null;
    // Fora de transação: Auth não participa de transações do Firestore.
    // O único escritor de role:cliente continua sendo ContasClienteService.
    const conta = await this.contas.obterOuCriar({
      nome: dados['nome'],
      email,
    });
    if (conta.situacao !== 'cliente') return null;
    const usuario = await this.auth.getUser(conta.uid);
    return usuario.disabled ? null : usuario.uid;
  }
}
