import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  NOME_CLAIM_PERFIL,
  type AdministradorResumo,
  type NovoAdministrador,
} from 'shared';
import { auditar } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { ehDuplicata } from '../outbox/evento.js';
import { OutboxService } from '../outbox/outbox.service.js';

export const COLECAO_ADMINISTRADORES = 'administradores';

interface DocumentoAdministrador {
  nome: string;
  email: string;
  /** Sempre escrito: a contagem do "ultimo administrador" filtra por ele. */
  ativo: boolean;
  convidadoEm: Timestamp | FieldValue | null;
  convidadoPor: string | null;
  /** Sobe a cada convite: a chave do e-mail de acesso (`convite-administrador`). */
  versaoDoConvite: number;
}

function codigoDoAuth(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}

/**
 * Administradores dentro da plataforma (B2, decisoes.md 5.5). O TERCEIRO
 * ESCRITOR DE CLAIM (regra inviolavel 17, emendada na B2), e so de `admin`.
 *
 * CONVIDAR: conta no Auth sem senha, documento `administradores/{uid}`, linha de
 * auditoria e e-mail de definicao de senha pelo outbox, na mesma transacao — e a
 * claim por ULTIMO, como em `AdvogadosService.criar`: se ela falhar, sobra um
 * registro sem acesso, recuperavel repetindo o convite; na ordem inversa,
 * sobraria um administrador sem registro. E-mail que ja e cliente ou advogado e
 * 409: a claim e uma so, e trocar o perfil de uma conta existente nao e convite.
 *
 * REMOVER: documento inativo e auditoria na transacao, depois a claim sai e os
 * tokens sao revogados (o `checkRevoked` do guard derruba a sessao aberta). Duas
 * recusas, as duas no servidor: remover a si mesmo, e remover o ULTIMO
 * administrador ativo. A contagem e uma consulta lida NA TRANSACAO: duas remocoes
 * cruzadas leem os dois documentos e escrevem um cada, e o Firestore faz uma
 * delas repetir — e a repeticao ve um so administrador e recusa.
 *
 * QUEM FOI PROVISIONADO A MAO (o administrador global anterior a B2) nao tem
 * documento. Ele ganha o seu no primeiro acesso a esta superficie
 * (`garantirRegistro`), antes de qualquer contagem: sem isso, depois de convidar
 * o primeiro colega, a contagem acharia um administrador so e recusaria remover
 * o colega — ou, pior, contaria errado no dia em que ele saisse.
 */
@Injectable()
export class AdministradoresService {
  private readonly log = new Logger('Administradores');

  constructor(
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async listar(ator: UsuarioAutenticado): Promise<AdministradorResumo[]> {
    await this.garantirRegistro(ator);
    const pagina = await this.db
      .collection(COLECAO_ADMINISTRADORES)
      .where('ativo', '==', true)
      .get();
    return pagina.docs
      .map((d) => this.resumir(d.id, d.data() as DocumentoAdministrador, ator))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async convidar(
    dados: NovoAdministrador,
    ator: UsuarioAutenticado,
  ): Promise<AdministradorResumo> {
    await this.garantirRegistro(ator);
    const usuario = await this.obterOuCriar(dados);
    await this.conferirPerfilAnterior(usuario);

    const idEvento = await this.db.runTransaction((transacao) =>
      this.gravarConvite(transacao, usuario.uid, dados, ator.uid),
    );

    await this.auth.setCustomUserClaims(usuario.uid, {
      ...(usuario.customClaims ?? {}),
      [NOME_CLAIM_PERFIL]: 'admin',
    });
    this.log.log(`administrador ${usuario.uid} convidado por ${ator.uid}`);
    await this.enfileirador.enfileirarPorId(idEvento);

    return {
      uid: usuario.uid,
      nome: dados.nome,
      email: dados.email,
      ativo: true,
      convidadoEm: null,
      ehVoce: false,
    };
  }

  async remover(uid: string, ator: UsuarioAutenticado): Promise<void> {
    if (uid === ator.uid) {
      throw new ConflictException(
        'Voce nao pode remover o proprio acesso de administrador.',
      );
    }
    await this.garantirRegistro(ator);

    await this.db.runTransaction((transacao) =>
      this.gravarRemocao(transacao, uid, ator.uid),
    );

    /*
     * Depois do commit. Uma falha aqui deixa o documento inativo com a claim
     * ainda de pe; repetir a remocao retoma, porque `gravarRemocao` aceita o
     * documento ja inativo e esta parte roda de novo.
     */
    const usuario = await this.auth.getUser(uid);
    const { [NOME_CLAIM_PERFIL]: _perfil, ...outras } =
      usuario.customClaims ?? {};
    await this.auth.setCustomUserClaims(uid, outras);
    await this.auth.revokeRefreshTokens(uid);
    this.log.log(`administrador ${uid} removido por ${ator.uid}`);
  }

  /**
   * O documento de quem chegou com a claim gravada a mao. So o proprio ator — e
   * so porque o token ja prova que ele e administrador.
   */
  private async garantirRegistro(ator: UsuarioAutenticado): Promise<void> {
    const referencia = this.db
      .collection(COLECAO_ADMINISTRADORES)
      .doc(ator.uid);
    if ((await referencia.get()).exists) return;
    const usuario = await this.auth.getUser(ator.uid);
    try {
      await referencia.create({
        nome: usuario.displayName ?? usuario.email ?? ator.uid,
        email: usuario.email ?? ator.email ?? '',
        ativo: true,
        convidadoEm: null,
        convidadoPor: null,
        versaoDoConvite: 0,
      } satisfies DocumentoAdministrador);
    } catch (erro) {
      // Duas abas abertas ao mesmo tempo: a segunda acha o documento criado.
      if (!ehDuplicata(erro)) throw erro;
    }
  }

  private async obterOuCriar(dados: NovoAdministrador): Promise<UserRecord> {
    try {
      return await this.auth.createUser({
        email: dados.email,
        displayName: dados.nome,
        emailVerified: false,
        // Sem `password`: o acesso nasce por link de definicao de senha (ADR-07).
      });
    } catch (erro) {
      if (codigoDoAuth(erro) !== 'auth/email-already-exists') throw erro;
      return await this.auth.getUserByEmail(dados.email);
    }
  }

  /**
   * A conta que ja existe so vira administrador se nao tiver outro perfil. O
   * convite repetido de quem ja e administrador ativo e 409; o de quem foi
   * removido (claim apagada, documento inativo) e o caminho de volta.
   */
  private async conferirPerfilAnterior(usuario: UserRecord): Promise<void> {
    const perfil = usuario.customClaims?.[NOME_CLAIM_PERFIL] as unknown;
    if (perfil === 'cliente' || perfil === 'advogado') {
      throw new ConflictException(
        'Este e-mail ja e de um cliente ou advogado. Use outro endereco.',
      );
    }
    const documento = await this.db
      .collection(COLECAO_ADMINISTRADORES)
      .doc(usuario.uid)
      .get();
    const ativo = (documento.data() as DocumentoAdministrador | undefined)
      ?.ativo;
    if (perfil === 'admin' && ativo === true) {
      throw new ConflictException('Esta pessoa ja e administradora.');
    }
  }

  private async gravarConvite(
    transacao: Transaction,
    uid: string,
    dados: NovoAdministrador,
    atorUid: string,
  ): Promise<string> {
    const referencia = this.db.collection(COLECAO_ADMINISTRADORES).doc(uid);
    const anterior = (await transacao.get(referencia)).data() as
      DocumentoAdministrador | undefined;
    const versao = (anterior?.versaoDoConvite ?? 0) + 1;
    const idEvento = await this.outbox.registrarSeAusente(transacao, {
      tipo: 'convite-administrador',
      destinatarioUid: uid,
      versao,
    });

    transacao.set(referencia, {
      nome: dados.nome,
      email: dados.email,
      ativo: true,
      convidadoEm: FieldValue.serverTimestamp(),
      convidadoPor: atorUid,
      versaoDoConvite: versao,
    } satisfies DocumentoAdministrador);
    auditar(this.db, transacao, {
      acao: 'administrador.convidado',
      atorUid,
      alvo: uid,
      antes: anterior === undefined ? null : { ativo: anterior.ativo },
      depois: { ativo: true, email: dados.email },
    });
    return idEvento;
  }

  private async gravarRemocao(
    transacao: Transaction,
    uid: string,
    atorUid: string,
  ): Promise<void> {
    const colecao = this.db.collection(COLECAO_ADMINISTRADORES);
    const alvo = (await transacao.get(colecao.doc(uid))).data() as
      DocumentoAdministrador | undefined;
    if (alvo === undefined) {
      throw new NotFoundException('Administrador nao encontrado.');
    }
    if (!alvo.ativo) return;

    const ativos = await transacao.get(colecao.where('ativo', '==', true));
    if (ativos.size <= 1) {
      throw new ConflictException(
        'Nao e possivel remover o ultimo administrador.',
      );
    }

    transacao.update(colecao.doc(uid), {
      ativo: false,
      removidoEm: FieldValue.serverTimestamp(),
      removidoPor: atorUid,
    });
    auditar(this.db, transacao, {
      acao: 'administrador.removido',
      atorUid,
      alvo: uid,
      antes: { ativo: true, email: alvo.email },
      depois: { ativo: false },
    });
  }

  private resumir(
    uid: string,
    dados: DocumentoAdministrador,
    ator: UsuarioAutenticado,
  ): AdministradorResumo {
    return {
      uid,
      nome: dados.nome,
      email: dados.email,
      ativo: dados.ativo,
      convidadoEm:
        dados.convidadoEm instanceof Timestamp
          ? dados.convidadoEm.toDate().toISOString()
          : null,
      ehVoce: uid === ator.uid,
    };
  }
}
