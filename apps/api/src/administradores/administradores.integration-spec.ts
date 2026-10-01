import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NOME_CLAIM_PERFIL } from 'shared';
import { AlertaFalso } from '../alertas/alerta.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
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
import { FilaFalsa } from '../tarefas/fila.js';
import {
  AdministradoresService,
  COLECAO_ADMINISTRADORES,
} from './administradores.service.js';

/**
 * Contra os emuladores (B2, decisoes.md 5.5). O que o duble nao prova: a claim
 * de verdade no Auth, o e-mail que sai pelo outbox e — o motivo deste arquivo —
 * a CONTAGEM do ultimo administrador sob concorrencia. Duas remocoes cruzadas
 * leem os dois documentos e escrevem um cada; o Firestore faz uma repetir, e a
 * repeticao ve um administrador so.
 */
let auth: Auth;
let banco: Firestore;
let fila: FilaFalsa<TarefaDeEvento>;
let transporte: EmailFalsoTransport;
let despachante: DespachanteOutbox;
let servico: AdministradoresService;

async function administrador(email: string): Promise<UsuarioAutenticado> {
  const usuario = await auth.createUser({ email, displayName: email });
  await auth.setCustomUserClaims(usuario.uid, { [NOME_CLAIM_PERFIL]: 'admin' });
  return { uid: usuario.uid, email, perfil: 'admin' };
}

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
  despachante = new DespachanteOutbox(
    outbox,
    auth,
    transporte,
    new AlertaFalso(),
    new GatewayPagamentoFalso(),
    {} as ConvitesService,
  );
  servico = new AdministradoresService(
    auth,
    banco,
    outbox,
    new EnfileiradorDeEventos(outbox, fila),
  );
});

describe('administradores contra os emuladores', () => {
  it('convida: claim admin no Auth e link de senha ao convidado', async () => {
    const henrique = await administrador('henrique@lexintegra.test');

    const { uid } = await servico.convidar(
      { nome: 'Auan Silva', email: 'auan@lexintegra.test' },
      henrique,
    );
    for (const tarefa of fila.tarefas) await despachante.despachar(tarefa.id);

    expect((await auth.getUser(uid)).customClaims).toEqual({
      [NOME_CLAIM_PERFIL]: 'admin',
    });
    expect(transporte.enviadas.map((m) => m.para)).toEqual([
      ['auan@lexintegra.test'],
    ]);
  });

  it('remocoes cruzadas: uma passa, a outra ve o ultimo administrador', async () => {
    const a = await administrador('a@lexintegra.test');
    const b = await administrador('b@lexintegra.test');
    await servico.listar(a);
    await servico.listar(b);

    const resultados = await Promise.allSettled([
      servico.remover(b.uid, a),
      servico.remover(a.uid, b),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const ativos = await banco
      .collection(COLECAO_ADMINISTRADORES)
      .where('ativo', '==', true)
      .get();
    expect(ativos.size).toBe(1);
  });

  it('a remocao tira a claim e revoga os tokens', async () => {
    const henrique = await administrador('henrique@lexintegra.test');
    const auan = await administrador('auan@lexintegra.test');
    await servico.listar(auan);

    await servico.remover(auan.uid, henrique);

    const usuario = await auth.getUser(auan.uid);
    expect(usuario.customClaims?.[NOME_CLAIM_PERFIL]).toBeUndefined();
    expect(usuario.tokensValidAfterTime).toBeDefined();
  });
});
