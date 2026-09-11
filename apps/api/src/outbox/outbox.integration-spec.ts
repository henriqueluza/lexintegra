import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { NOME_CLAIM_PERFIL } from 'shared';
import { AlertaFalso, ALERTAS } from '../alertas/alerta.js';
import { AppModule } from '../app.module.js';
import { configurar } from '../configurar.js';
import { EMAIL_TRANSPORT } from '../email/email-transport.js';
import type { EmailFalsoTransport } from '../email/email-falso.transport.js';
import { authDeTeste, idTokenDe, limparEmuladores } from '../emulador.js';
import { FilaFalsa } from '../tarefas/fila.js';
import {
  VERIFICADOR_DE_TOKEN,
  VerificadorFalso,
} from '../tarefas/verificador.js';
import { FILA_DE_EVENTOS, type TarefaDeEvento } from './fila.js';
import { POLITICA } from './politica.js';

/**
 * O CRITERIO DE ACEITE DA ETAPA 7, fim a fim e sem intervencao no banco:
 *
 * > Com a chave do transporte de e-mail invalida, o envio falha, aparece como
 * > pendente no painel, e e entregue corretamente apos a correcao.
 *
 * Sobre a aplicacao INTEIRA, por HTTP, contra os emuladores. Os testes de unidade
 * cobrem cada peca com dublê; o que so aparece aqui e o que dublê nao imita:
 * contencao de transacao de verdade — que e o que faz o arrendamento valer —,
 * carimbo de servidor, e os quatro guards globais na cadeia.
 *
 * APLICACAO NOVA A CADA TESTE porque o contador do limitador vive na instancia, e
 * porque a fila falsa e a de cada aplicacao.
 */

const CLIENTE = {
  uid: 'uid-cliente-outbox',
  email: 'cliente@exemplo.test',
};
const ADMIN = { uid: 'uid-admin-outbox', email: 'admin@escritorio.test' };

let app: INestApplication;
let fila: FilaFalsa<TarefaDeEvento>;
let transporte: EmailFalsoTransport;
let alertas: AlertaFalso;
let tokenDoAdmin: string;

function http(): request.Agent {
  return request(app.getHttpServer());
}

/** Uma chamada com a credencial que o Cloud Tasks anexaria. */
function comoTarefa(caminho: string): request.Test {
  return http()
    .post(caminho)
    .set('authorization', `Bearer ${TOKEN_DE_TAREFA}`);
}

/**
 * O GUARD DAS ROTAS INTERNAS CONTINUA NA CADEIA, e continua sendo o de producao.
 *
 * O que se troca e so quem valida a ASSINATURA do token OIDC — isso depende das
 * chaves publicas do Google e nao ha como produzir um token valido offline. O
 * decorador, a conferencia de audiencia e de emissor, a posicao na cadeia e a
 * recusa por configuracao ausente sao os mesmos.
 *
 * O verificador falso aceita UM token combinado, e nao qualquer um: um
 * verificador permissivo faria as assercoes de 401 deste arquivo passarem sem
 * significar nada.
 */
const TOKEN_DE_TAREFA = 'token-oidc-de-teste';
const CONTA_DE_TAREFAS = 'tarefas@projeto.iam.gserviceaccount.com';

async function montarAplicacao(): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ALERTAS)
    .useValue(new AlertaFalso())
    .overrideProvider(VERIFICADOR_DE_TOKEN)
    .useValue(
      new VerificadorFalso(TOKEN_DE_TAREFA, {
        email: CONTA_DE_TAREFAS,
        email_verified: true,
      }),
    )
    .compile();
  const criada = modulo.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configurar(criada);
  await criada.init();
  return criada;
}

/** Faz o papel do Cloud Tasks: tira da fila e chama o endpoint interno. */
async function entregarFila(): Promise<number[]> {
  const tarefas = [...fila.tarefas];
  fila.limpar();

  const status: number[] = [];
  for (const tarefa of tarefas) {
    const resposta = await comoTarefa('/api/interno/outbox').send({
      id: tarefa.id,
    });
    status.push(resposta.status);
  }
  return status;
}

async function pedirRedefinicao(): Promise<void> {
  await http()
    .post('/api/auth/redefinicao-senha')
    .send({ email: CLIENTE.email })
    .expect(202);
}

async function linhasDoPainel(situacao?: string): Promise<
  {
    id: string;
    estado: string;
    tentativas: number;
    ultimoErro: string | null;
  }[]
> {
  const resposta = await http()
    .get(`/api/admin/outbox${situacao === undefined ? '' : `?situacao=${situacao}`}`)
    .set('authorization', `Bearer ${tokenDoAdmin}`)
    .expect(200);
  return resposta.body as never;
}

beforeEach(async () => {
  await limparEmuladores();

  /*
   * Sem espera de relogio. O varredor so encosta em registro cujo `varrerApos` ja
   * venceu, e em producao isso e minutos — aqui a decisao que importa e "o
   * varredor alcanca ou nao alcanca", e nao quanto tempo ela demora.
   */
  process.env['VARREDOR_ATRASO_MINUTOS'] = '0';
  process.env['OUTBOX_ARRENDAMENTO_SEGUNDOS'] = '60';
  /* O guard cobra os dois, e recusa tudo se faltar um. */
  process.env['URL_APLICACAO'] = 'https://lexintegra.com.br';
  process.env['SERVICE_ACCOUNT_TAREFAS'] = CONTA_DE_TAREFAS;

  const auth = authDeTeste();
  await auth.createUser({ uid: CLIENTE.uid, email: CLIENTE.email });
  await auth.createUser({ uid: ADMIN.uid, email: ADMIN.email });
  await auth.setCustomUserClaims(ADMIN.uid, { [NOME_CLAIM_PERFIL]: 'admin' });
  tokenDoAdmin = await idTokenDe(ADMIN.uid);

  app = await montarAplicacao();
  fila = app.get(FILA_DE_EVENTOS);
  transporte = app.get(EMAIL_TRANSPORT);
  alertas = app.get(ALERTAS);
});

afterEach(async () => {
  await app.close();
  /*
   * O ambiente e do PROCESSO, e a integracao roda com `maxWorkers: 1` — um
   * arquivo que sujasse `URL_APLICACAO` mudaria o link que outro arquivo afirma
   * ter recebido, e a falha apareceria longe da causa.
   */
  for (const chave of [
    'VARREDOR_ATRASO_MINUTOS',
    'OUTBOX_ARRENDAMENTO_SEGUNDOS',
    'URL_APLICACAO',
    'SERVICE_ACCOUNT_TAREFAS',
  ]) {
    delete process.env[chave];
  }
});

describe('resiliencia da entrega, fim a fim', () => {
  /**
   * O CENARIO DO CRITERIO DE ACEITE, do inicio ao fim, num teste so — porque o
   * que se afirma e uma SEQUENCIA: falha, aparece no painel, e e entregue depois
   * da correcao. Partido em sete testes, cada pedaco passaria sem que a sequencia
   * inteira jamais tivesse sido percorrida.
   */
  it('falha com o transporte quebrado e entrega depois da correcao', async () => {
    transporte.falharCom('API key is invalid');

    await pedirRedefinicao();
    expect(fila.tarefas).toHaveLength(1);

    // 1. A entrega falha, e o 503 e o que faz o Cloud Tasks tentar de novo.
    await expect(entregarFila()).resolves.toEqual([503]);

    // 2. Aparece no painel, com o motivo e a tentativa gasta.
    const [comFalha] = await linhasDoPainel();
    expect(comFalha).toMatchObject({
      estado: 'falhou',
      tentativas: 1,
      ultimoErro: 'API key is invalid',
    });
    expect(transporte.enviadas).toEqual([]);

    // 3. O varredor o reenfileira sozinho.
    await comoTarefa('/api/interno/outbox/varredura').expect(200);
    expect(fila.tarefas).toHaveLength(1);

    // 4. Corrigido o transporte, a entrega acontece.
    transporte.voltarAFuncionar();
    await expect(entregarFila()).resolves.toEqual([200]);

    expect(transporte.enviadas).toHaveLength(1);
    expect(transporte.enviadas[0].modelo?.alias).toBe('password-reset');
    await expect(linhasDoPainel()).resolves.toMatchObject([
      { estado: 'enviado' },
    ]);

    // 5. E o varredor nao volta a mexer no que ja foi entregue.
    await comoTarefa('/api/interno/outbox/varredura').expect(200);
    expect(fila.tarefas).toEqual([]);
  });

  /**
   * O caminho feliz tambem precisa de teste proprio: um cenario que so exercita a
   * recuperacao passaria verde mesmo que a entrega normal estivesse quebrada.
   */
  it('entrega de primeira quando o transporte esta bom', async () => {
    await pedirRedefinicao();

    await expect(entregarFila()).resolves.toEqual([200]);

    expect(transporte.enviadas).toHaveLength(1);
  });
});

describe('entrega acontece no maximo uma vez', () => {
  /**
   * O TESTE QUE SO O EMULADOR CONSEGUE FAZER.
   *
   * Ha dois mecanismos de retentativa independentes — a fila e o varredor — mais
   * o reenvio manual, e nada impede que dois cheguem ao mesmo registro na mesma
   * janela. `enviar` nao e idempotente: duas entregas sao dois e-mails.
   *
   * A trava e `reivindicar`, que e uma transacao. O dublê em memoria nao imita
   * contencao, entao aqui — e so aqui — se prova que duas tarefas simultaneas
   * produzem uma entrega so. E a mesma razao pela qual as duas fases de
   * `PedidosService` so foram pegas na integracao.
   */
  it('duas tarefas simultaneas para o mesmo registro entregam uma vez', async () => {
    await pedirRedefinicao();
    const id = fila.tarefas[0].id;

    const respostas = await Promise.all([
      comoTarefa('/api/interno/outbox').send({ id }),
      comoTarefa('/api/interno/outbox').send({ id }),
    ]);

    expect(transporte.enviadas).toHaveLength(1);

    const situacoes = respostas.map(
      (resposta) => (resposta.body as { situacao: string }).situacao,
    );
    expect(situacoes).toContain('entregue');
    /* A perdedora ou viu o arrendamento, ou ja viu o registro entregue. */
    expect(situacoes).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(em-andamento|ja-entregue)$/),
      ]),
    );

    const [linha] = await linhasDoPainel();
    expect(linha).toMatchObject({ estado: 'enviado', tentativas: 1 });
  });

  /** Entrega ao-menos-uma-vez e o contrato da fila: a MESMA tarefa pode chegar de
   * novo depois de ter dado certo. */
  it('a mesma tarefa entregue de novo e um no-op', async () => {
    await pedirRedefinicao();
    const id = fila.tarefas[0].id;

    await comoTarefa('/api/interno/outbox').send({ id }).expect(200);
    const segunda = await comoTarefa('/api/interno/outbox')
      .send({ id })
      .expect(200);

    expect(segunda.body).toEqual({ situacao: 'ja-entregue' });
    expect(transporte.enviadas).toHaveLength(1);
  });

  /**
   * DUAS PASSAGENS DO VARREDOR NAO PRODUZEM DUAS TAREFAS. O Cloud Tasks deduplica
   * por nome, e o nome carrega ciclo e tentativa — que so mudam quando algo de
   * fato aconteceu com o registro. E a camada que impede o job de um minuto de
   * empilhar tarefas sobre um registro parado.
   */
  it('o varredor nao empilha tarefas sobre o mesmo registro parado', async () => {
    transporte.falharCom('provedor fora do ar');
    await pedirRedefinicao();
    await entregarFila();

    await comoTarefa('/api/interno/outbox/varredura').expect(200);
    await comoTarefa('/api/interno/outbox/varredura').expect(200);

    expect(fila.tarefas).toHaveLength(1);
  });
});

describe('orcamento de tentativas', () => {
  /**
   * O TETO E O QUE PARA O VARREDOR. Sem ele, um registro permanentemente quebrado
   * voltaria para a fila a cada minuto, para sempre — e o alerta nunca sairia,
   * porque nunca haveria um momento em que o sistema desistisse.
   */
  it('abandona depois do teto, alerta, e o varredor larga', async () => {
    transporte.falharCom('destinatario invalido');
    await pedirRedefinicao();
    const id = fila.tarefas[0].id;

    const teto = POLITICA['redefinir-senha'].maxTentativas;
    for (let tentativa = 0; tentativa < teto; tentativa += 1) {
      await comoTarefa('/api/interno/outbox').send({ id });
    }

    await expect(linhasDoPainel()).resolves.toMatchObject([
      { estado: 'abandonado', tentativas: teto },
    ]);

    expect(alertas.emitidos).toEqual([
      {
        nivel: 'critico',
        assunto: 'outbox.abandonado',
        detalhe: expect.stringContaining(id),
      },
    ]);

    fila.limpar();
    await comoTarefa('/api/interno/outbox/varredura').expect(200);
    expect(fila.tarefas).toEqual([]);
  });

  /**
   * O REENVIO MANUAL E A SAIDA DO ABANDONO, e a chave de idempotencia precisa
   * mudar junto. Sem o ciclo novo, o provedor veria a mesma chave da entrega que
   * falhou e trataria como duplicata: o botao nao mandaria nada, e nada no
   * sistema diria por que.
   */
  it('o reenvio manual tira do abandono e entrega com chave nova', async () => {
    transporte.falharCom('destinatario invalido');
    await pedirRedefinicao();
    const id = fila.tarefas[0].id;

    const teto = POLITICA['redefinir-senha'].maxTentativas;
    for (let tentativa = 0; tentativa < teto; tentativa += 1) {
      await comoTarefa('/api/interno/outbox').send({ id });
    }

    transporte.voltarAFuncionar();
    fila.limpar();

    await http()
      .post(`/api/admin/outbox/${encodeURIComponent(id)}/reenvio`)
      .set('authorization', `Bearer ${tokenDoAdmin}`)
      .expect(200);

    await expect(entregarFila()).resolves.toEqual([200]);

    expect(transporte.enviadas).toHaveLength(1);
    expect(transporte.enviadas[0].chaveIdempotencia).toBe(`${id}-c1`);
    await expect(linhasDoPainel()).resolves.toMatchObject([
      { estado: 'enviado' },
    ]);
  });

  /** O que ainda anda sozinho nao se reenvia: o arrendamento recusaria adiante, e
   * o botao nao faria nada sem dizer por que. */
  it('recusa reenvio manual de registro pendente', async () => {
    await pedirRedefinicao();
    const id = fila.tarefas[0].id;

    await http()
      .post(`/api/admin/outbox/${encodeURIComponent(id)}/reenvio`)
      .set('authorization', `Bearer ${tokenDoAdmin}`)
      .expect(409);
  });
});

describe('fronteiras das rotas', () => {
  it('o painel de entregas recusa quem nao e admin', async () => {
    const tokenDoCliente = await idTokenDe(CLIENTE.uid);

    await http().get('/api/admin/outbox').expect(401);
    await http()
      .get('/api/admin/outbox')
      .set('authorization', `Bearer ${tokenDoCliente}`)
      .expect(403);
  });

  /**
   * A CONTRAPARTIDA DOS TESTES ACIMA. Eles chamam as rotas internas com a
   * credencial; sem este par, estariam exercitando um endpoint que em producao
   * seria um gatilho de e-mail aberto a qualquer um.
   */
  it('as rotas internas recusam quem nao apresenta credencial', async () => {
    await http().post('/api/interno/outbox').send({ id: 'x' }).expect(401);
    await http().post('/api/interno/outbox/varredura').expect(401);
  });

  it('as rotas internas recusam token que nao e da conta declarada', async () => {
    await http()
      .post('/api/interno/outbox')
      .set('authorization', 'Bearer token-de-outro-servico')
      .send({ id: 'x' })
      .expect(401);
  });

  /**
   * CONFIGURACAO AUSENTE RECUSA, e nao deixa passar. Uma rota interna que aceita
   * qualquer token porque a variavel nao foi definida e uma rota aberta que
   * PARECE protegida — e o sintoma seria nenhum.
   */
  it('recusa quando a conta de tarefas nao esta configurada', async () => {
    const guardado = process.env['SERVICE_ACCOUNT_TAREFAS'];
    delete process.env['SERVICE_ACCOUNT_TAREFAS'];

    await comoTarefa('/api/interno/outbox').send({ id: 'x' }).expect(401);

    process.env['SERVICE_ACCOUNT_TAREFAS'] = guardado;
  });
});
