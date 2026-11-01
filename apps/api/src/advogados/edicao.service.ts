import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import type { AdvogadoResumo, EdicaoAdvogado, StatusAdvogado } from 'shared';
import { auditar } from '../auditoria/auditoria.js';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { COLECAO_ADVOGADOS, organizadorTeamsDe } from './advogados.service.js';

interface Cadastro {
  readonly nome: string;
  readonly email: string;
  readonly organizadorTeams: string | null;
}

interface DocumentoEditavel extends Cadastro {
  /** O nome anterior do campo; ver `organizadorTeamsDe`. */
  readonly usuarioTeams?: string | null;
  readonly status: StatusAdvogado;
  readonly criadoEm?: unknown;
  /** Sobe a cada troca de e-mail; ausente nos documentos anteriores a B2. */
  readonly versaoDeAcesso?: number;
}

function cadastroDe(dados: DocumentoEditavel): Cadastro {
  return {
    nome: dados.nome,
    email: dados.email,
    organizadorTeams: organizadorTeamsDe(dados),
  };
}

/** So os campos que mudaram, nos dois lados — e o que vai para a auditoria. */
function diferenca(
  antes: Cadastro,
  depois: Cadastro,
): { antes: Partial<Cadastro>; depois: Partial<Cadastro> } | null {
  const campos = (['nome', 'email', 'organizadorTeams'] as const).filter(
    (campo) => antes[campo] !== depois[campo],
  );
  if (campos.length === 0) return null;
  return {
    antes: Object.fromEntries(campos.map((c) => [c, antes[c]])),
    depois: Object.fromEntries(campos.map((c) => [c, depois[c]])),
  };
}

function codigoDoAuth(erro: unknown): string | null {
  if (typeof erro !== 'object' || erro === null) return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : null;
}

/**
 * Edicao de advogado ja criado (B2, decisoes.md 4.1).
 *
 * O QUE MUDA E O CADASTRO, E SO ELE. Nao mexe na claim (regra inviolavel 17:
 * quem escreve `role: advogado` continua sendo so a criacao), nao mexe no status
 * (suspender e outra operacao, com tres efeitos) e NAO REDISTRIBUI PEDIDOS: a
 * atribuicao mora no pedido (`pedidos.advogadoId`, pelo uid), e o uid nao muda.
 *
 * DUAS CONFERENCIAS ANTES DE QUALQUER ESCRITA:
 *
 * - o documento de advogado existe — e o que impede esta rota de alcancar a
 *   conta de um cliente ou de um administrador (mesmo raciocinio da suspensao);
 * - o e-mail novo nao e de outra conta — o Auth responde
 *   `email-already-exists`, que vira 409.
 *
 * A TROCA DE E-MAIL ACONTECE NO AUTH ANTES DA TRANSACAO, porque e efeito
 * externo (regra inviolavel 2). Se a transacao falhar depois, sobra o Auth com o
 * endereco novo e o documento com o velho; repetir a mesma requisicao retoma,
 * porque trocar para o mesmo endereco e operacao sem efeito no Auth. Na mesma
 * transacao do documento nascem a linha de auditoria e o novo e-mail de acesso
 * (regra inviolavel 3), com a chave na versao do acesso — cada troca, o seu
 * registro.
 *
 * O `organizadorTeams` NAO e conferido no tenant (`feat/ligar-teams`). A
 * conferencia por `GET /users` exigia `User.Read.All`, e o aplicativo do
 * escritorio fica so com `OnlineMeetings.ReadWrite.All`. O schema confere o
 * formato; um GUID que nao existe aparece na primeira sala, como falha
 * reentregavel em `/admin/reunioes`.
 */
@Injectable()
export class EdicaoDeAdvogadoService {
  private readonly log = new Logger('Advogados');

  constructor(
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async editar(
    uid: string,
    dados: EdicaoAdvogado,
    admin: string,
  ): Promise<AdvogadoResumo> {
    const referencia = this.db.collection(COLECAO_ADVOGADOS).doc(uid);
    const atual = await referencia.get();
    if (!atual.exists) throw new NotFoundException('Advogado nao encontrado.');

    const antes = cadastroDe(atual.data() as DocumentoEditavel);
    const depois: Cadastro = {
      nome: dados.nome,
      email: dados.email,
      organizadorTeams: dados.organizadorTeams ?? null,
    };

    const trocouEmail = antes.email !== depois.email;
    if (trocouEmail || antes.nome !== depois.nome) {
      await this.atualizarAuth(uid, depois, trocouEmail);
    }

    const idEvento = await this.gravar(uid, depois, admin);
    if (idEvento !== null) await this.enfileirador.enfileirarPorId(idEvento);

    const dadosAtuais = atual.data() as DocumentoEditavel;
    return {
      uid,
      ...depois,
      status: dadosAtuais.status,
      criadoEm:
        dadosAtuais.criadoEm instanceof Timestamp
          ? dadosAtuais.criadoEm.toDate().toISOString()
          : null,
    };
  }

  private async atualizarAuth(
    uid: string,
    depois: Cadastro,
    trocouEmail: boolean,
  ): Promise<void> {
    try {
      await this.auth.updateUser(uid, {
        displayName: depois.nome,
        ...(trocouEmail ? { email: depois.email, emailVerified: false } : {}),
      });
    } catch (erro) {
      if (codigoDoAuth(erro) === 'auth/email-already-exists') {
        throw new ConflictException('Este e-mail ja e usado por outra conta.');
      }
      throw erro;
    }
  }

  /**
   * Reler na transacao, e nao reaproveitar a leitura de fora: duas edicoes
   * concorrentes do mesmo advogado gravariam a auditoria com o `antes` errado.
   * Toda leitura (o documento e o registro do outbox) vem antes de toda escrita.
   * Devolve o id do evento de acesso, ou `null` quando o e-mail nao mudou.
   */
  private async gravar(
    uid: string,
    depois: Cadastro,
    admin: string,
  ): Promise<string | null> {
    const referencia = this.db.collection(COLECAO_ADVOGADOS).doc(uid);
    return this.db.runTransaction(async (transacao) => {
      const documento = await transacao.get(referencia);
      if (!documento.exists)
        throw new NotFoundException('Advogado nao encontrado.');
      const dados = documento.data() as DocumentoEditavel;
      const mudanca = diferenca(cadastroDe(dados), depois);
      if (mudanca === null) return null;

      const trocouEmail = dados.email !== depois.email;
      const versao = (dados.versaoDeAcesso ?? 0) + (trocouEmail ? 1 : 0);
      const idEvento = trocouEmail
        ? await this.outbox.registrarSeAusente(transacao, {
            tipo: 'acesso-advogado-atualizado',
            destinatarioUid: uid,
            versao,
          })
        : null;

      transacao.update(referencia, {
        ...depois,
        /* O nome anterior sai na primeira edicao; ver `organizadorTeamsDe`. */
        usuarioTeams: FieldValue.delete(),
        versaoDeAcesso: versao,
        alteradoEm: FieldValue.serverTimestamp(),
        alteradoPor: admin,
      });
      auditar(this.db, transacao, {
        acao: 'advogado.editado',
        atorUid: admin,
        alvo: uid,
        ...mudanca,
      });
      this.log.log(`advogado ${uid} editado por ${admin}`);
      return idEvento;
    });
  }
}
