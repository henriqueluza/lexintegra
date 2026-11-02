import { ConflictException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { AlertaFalso } from '../alertas/alerta.js';
import { COLECAO_AUDITORIA } from '../auditoria/auditoria.js';
import { EmailFalsoTransport } from '../email/email-falso.transport.js';
import {
  authDeTeste,
  firestoreDeTeste,
  limparEmuladores,
} from '../emulador.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { TarefaDeEvento } from '../outbox/fila.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { GatewayPagamentoFalso } from '../pagamentos/gateway/gateway-falso.js';
import type { ConvitesService } from '../reunioes/convites.service.js';
import { ConsultaReunioesService } from '../reunioes/consulta.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import { AdvogadosService } from './advogados.service.js';
import { EdicaoDeAdvogadoService } from './edicao.service.js';

/**
 * A edicao contra os emuladores (B2, decisoes.md 4.1). O que o duble nao prova:
 * que o Auth troca o e-mail de verdade e recusa o de outra conta, e que a
 * transacao (leitura do documento e do outbox antes das escritas) passa no
 * Firestore, que impoe a ordem.
 */
let auth: Auth;
let banco: Firestore;
let fila: FilaFalsa<TarefaDeEvento>;
let transporte: EmailFalsoTransport;
let despachante: DespachanteOutbox;
let criacao: AdvogadosService;
let edicao: EdicaoDeAdvogadoService;

const ANA = {
  nome: 'Ana Souza',
  email: 'ana@escritorio.test',
  organizadorTeams: null,
};
const ADMIN = 'uid-admin';

beforeAll(() => {
  auth = authDeTeste();
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  fila = new FilaFalsa<TarefaDeEvento>();
  transporte = new EmailFalsoTransport();
  const outbox = new OutboxService(banco, {
    atrasoDoVarredorMs: 0,
    arrendamentoMs: 60_000,
    loteDoVarredor: 100,
  });
  const enfileirador = new EnfileiradorDeEventos(outbox, fila);
  despachante = new DespachanteOutbox(
    outbox,
    auth,
    transporte,
    new AlertaFalso(),
    new GatewayPagamentoFalso(),
    {} as ConvitesService,
  );
  criacao = new AdvogadosService(
    auth,
    banco,
    outbox,
    enfileirador,
    new ConsultaReunioesService(banco),
  );
  edicao = new EdicaoDeAdvogadoService(
    auth,
    banco,
    outbox,
    enfileirador,
  );
});

async function entregarFila(): Promise<void> {
  const tarefas = [...fila.tarefas];
  fila.limpar();
  for (const tarefa of tarefas) await despachante.despachar(tarefa.id);
}

describe('edicao de advogado contra os emuladores', () => {
  it('troca o e-mail no Auth, audita e manda o acesso ao endereco novo', async () => {
    const { uid } = await criacao.criar(ANA, ADMIN);
    await entregarFila();

    await edicao.editar(
      uid,
      { ...ANA, email: 'ana.nova@escritorio.test' },
      ADMIN,
    );
    await entregarFila();

    expect((await auth.getUser(uid)).email).toBe('ana.nova@escritorio.test');
    expect(transporte.enviadas.at(-1)?.para).toEqual([
      'ana.nova@escritorio.test',
    ]);

    const auditoria = await banco.collection(COLECAO_AUDITORIA).get();
    expect(auditoria.docs.map((d) => d.data())).toEqual([
      expect.objectContaining({
        acao: 'advogado.editado',
        atorUid: ADMIN,
        alvo: uid,
        antes: { email: 'ana@escritorio.test' },
        depois: { email: 'ana.nova@escritorio.test' },
      }),
    ]);
  });

  it('recusa o e-mail de outra conta com 409, sem gravar', async () => {
    const { uid } = await criacao.criar(ANA, ADMIN);
    await auth.createUser({ email: 'ocupado@escritorio.test' });

    await expect(
      edicao.editar(uid, { ...ANA, email: 'ocupado@escritorio.test' }, ADMIN),
    ).rejects.toBeInstanceOf(ConflictException);

    const documento = await banco.collection('advogados').doc(uid).get();
    expect(documento.data()?.['email']).toBe(ANA.email);
    expect((await banco.collection(COLECAO_AUDITORIA).get()).size).toBe(0);
  });
});
