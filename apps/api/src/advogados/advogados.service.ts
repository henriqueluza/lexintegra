import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  NOME_CLAIM_PERFIL,
  type AdvogadoResumo,
  type NovoAdvogado,
  type StatusAdvogado,
} from 'shared';
import { FIRESTORE, AUTH_FIREBASE } from '../firebase/firebase.module.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

export const COLECAO_ADVOGADOS = 'advogados';

interface DocumentoAdvogado {
  nome: string;
  email: string;
  status: StatusAdvogado;
  criadoEm: Timestamp | FieldValue;
  criadoPor: string;
}

/**
 * Provisionamento de advogados (itens 2.4.3 a 2.4.7, arquitetura 7.4).
 *
 * NAO HA AUTOCADASTRO. Este servico e alcancado por um unico controlador, e ele
 * exige `@Perfis('admin')`. Nenhuma rota publica cria advogado.
 *
 * A CRIACAO E IDEMPOTENTE, E ISSO NAO E ENFEITE. Ela toca tres sistemas que nao
 * compartilham transacao — Auth, Firestore e outbox — entao uma falha no meio
 * deixa estado parcial. A alternativa comum e compensar apagando o usuario recem
 * criado no Auth; apagar conta num caminho de erro e a ultima coisa que se quer
 * automatizada num sistema onde a conta E o acesso. Aqui, repetir a mesma
 * requisicao retoma de onde parou.
 *
 * A ordem das escritas segue disso: documento e outbox primeiro, claim por
 * ultimo. Se a claim falhar, sobra um usuario que nao consegue fazer nada (o
 * guard recusa quem nao tem perfil) — recuperavel. Na ordem inversa, sobraria um
 * usuario com perfil de advogado e sem registro nenhum, que e um acesso sem
 * dono.
 */
@Injectable()
export class AdvogadosService {
  private readonly log = new Logger('Advogados');

  constructor(
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly despachante: DespachanteOutbox,
  ) {}

  async criar(dados: NovoAdvogado, criadoPor: string): Promise<AdvogadoResumo> {
    const usuario = await this.obterOuCriar(dados);

    if (await this.jaProvisionado(usuario.uid)) {
      throw new ConflictException('Ja existe um advogado com este e-mail.');
    }

    const idEvento = await this.gravar(usuario.uid, dados, criadoPor);

    /*
     * A escrita de claim mais sensivel do sistema. Acontece SO aqui, so para o
     * perfil `advogado`, e so a pedido de um administrador autenticado. Nenhum
     * caminho desta aplicacao escreve `admin` — o administrador global e
     * provisionado fora dela (item 2.4.2), por script manual.
     */
    await this.auth.setCustomUserClaims(usuario.uid, {
      [NOME_CLAIM_PERFIL]: 'advogado',
    });
    this.log.log(`advogado ${usuario.uid} provisionado por ${criadoPor}`);

    // Depois do commit, nunca dentro (regra inviolavel 2).
    await this.despachante.despachar(idEvento);

    return {
      uid: usuario.uid,
      nome: dados.nome,
      email: dados.email,
      status: 'ativo',
      criadoEm: null,
    };
  }

  async listar(): Promise<AdvogadoResumo[]> {
    const pagina = await this.db
      .collection(COLECAO_ADVOGADOS)
      .orderBy('nome')
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoAdvogado;
      return {
        uid: documento.id,
        nome: dados.nome,
        email: dados.email,
        status: dados.status,
        criadoEm:
          dados.criadoEm instanceof Timestamp
            ? dados.criadoEm.toDate().toISOString()
            : null,
      };
    });
  }

  /**
   * `createUser` e a tentativa normal. `email-already-exists` nao e
   * necessariamente conflito: pode ser a segunda tentativa de uma criacao que
   * falhou depois do Auth. Quem decide se e conflito de verdade e
   * `jaProvisionado`.
   */
  private async obterOuCriar(dados: NovoAdvogado): Promise<UserRecord> {
    try {
      return await this.auth.createUser({
        email: dados.email,
        displayName: dados.nome,
        emailVerified: false,
        // Sem `password`: o acesso nasce por link de definicao de senha (ADR-07).
        // Uma senha inicial gerada aqui ficaria na caixa de entrada para sempre.
      });
    } catch (erro) {
      if (codigoDoAuth(erro) !== 'auth/email-already-exists') throw erro;
      return await this.auth.getUserByEmail(dados.email);
    }
  }

  private async jaProvisionado(uid: string): Promise<boolean> {
    const [documento, usuario] = await Promise.all([
      this.db.collection(COLECAO_ADVOGADOS).doc(uid).get(),
      this.auth.getUser(uid),
    ]);

    const claim = usuario.customClaims?.[NOME_CLAIM_PERFIL];
    return documento.exists && claim === 'advogado';
  }

  /**
   * Documento e outbox na MESMA transacao (regra inviolavel 3): nao pode existir
   * estado em que o advogado foi criado e o e-mail de acesso nao.
   *
   * `registrarSeAusente`, e nao `registrar`: esta operacao e retomavel, e um
   * `create` estourando por duplicata na segunda tentativa derrubaria junto a
   * escrita do documento — a transacao inteira e revertida — e a criacao nunca
   * terminaria. A leitura dele vem antes do `set` porque o Firestore exige toda
   * leitura antes de qualquer escrita na transacao.
   */
  private async gravar(
    uid: string,
    dados: NovoAdvogado,
    criadoPor: string,
  ): Promise<string> {
    const documento: DocumentoAdvogado = {
      nome: dados.nome,
      email: dados.email,
      status: 'ativo',
      criadoEm: FieldValue.serverTimestamp(),
      criadoPor,
    };

    return await this.db.runTransaction(async (transacao) => {
      const idEvento = await this.outbox.registrarSeAusente(transacao, {
        tipo: 'definir-senha',
        destinatarioUid: uid,
      });

      transacao.set(this.db.collection(COLECAO_ADVOGADOS).doc(uid), documento, {
        merge: true,
      });

      return idEvento;
    });
  }
}

function codigoDoAuth(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}
