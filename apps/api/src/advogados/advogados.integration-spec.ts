import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { NOME_CLAIM_PERFIL } from 'shared';
import { AutenticacaoGuard } from '../autenticacao/autenticacao.guard.js';
import { Perfis } from '../autenticacao/decoradores.js';
import { PerfisGuard } from '../autenticacao/perfis.guard.js';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { EmailFalsoTransport } from '../email/email-falso.transport.js';
import {
  authDeTeste,
  firestoreDeTeste,
  idTokenDe,
  limparEmuladores,
  passarUmSegundo,
} from '../emulador.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { AdvogadosService } from './advogados.service.js';

/**
 * O caminho inteiro contra os emuladores de Auth e Firestore de verdade.
 *
 * Os testes de unidade cobrem a ORDEM das operacoes com dubles; o que so aparece
 * aqui e o que os dubles nao sabem imitar: como o Auth trata claim e revogacao,
 * como o Firestore trata `create` em documento existente e carimbo de servidor,
 * e o que `verifyIdToken(token, true)` responde depois de uma suspensao.
 */
let auth: Auth;
let banco: Firestore;
let transporte: EmailFalsoTransport;
let servico: AdvogadosService;
let autenticacao: AutenticacaoGuard;

const ANA = { nome: 'Ana Souza', email: 'ana@escritorio.test' };
const UID_ADMIN = 'uid-do-administrador';

beforeAll(() => {
  auth = authDeTeste();
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  transporte = new EmailFalsoTransport();

  const outbox = new OutboxService(banco);
  servico = new AdvogadosService(
    auth,
    banco,
    outbox,
    new DespachanteOutbox(outbox, auth, transporte),
  );
  autenticacao = new AutenticacaoGuard(new Reflector(), auth);
});

/* -------------------------------------------------------------------------- */

class RotaAberta {
  metodo(): void {}
}

@Perfis('admin')
class RotaAdministrativa {
  metodo(): void {}
}

function contexto(
  classe: new () => object,
  token?: string,
): { contexto: ExecutionContext; requisicao: { usuario?: UsuarioAutenticado } } {
  const requisicao: {
    headers: Record<string, string>;
    usuario?: UsuarioAutenticado;
  } = { headers: token === undefined ? {} : { authorization: `Bearer ${token}` } };

  return {
    contexto: {
      getHandler: () => (classe.prototype as Record<string, unknown>)['metodo'],
      getClass: () => classe,
      switchToHttp: () => ({ getRequest: () => requisicao }),
    } as unknown as ExecutionContext,
    requisicao,
  };
}

/* -------------------------------------------------------------------------- */

describe('provisionamento de advogado', () => {
  it('escreve a claim, o documento e o registro de outbox, e entrega o e-mail', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);

    const usuario = await auth.getUser(resumo.uid);
    expect(usuario.customClaims?.[NOME_CLAIM_PERFIL]).toBe('advogado');
    expect(usuario.email).toBe(ANA.email);

    const documento = await banco.collection('advogados').doc(resumo.uid).get();
    expect(documento.data()).toMatchObject({
      nome: ANA.nome,
      email: ANA.email,
      status: 'ativo',
      criadoPor: UID_ADMIN,
    });
    // Carimbo de servidor: so existe de verdade contra o Firestore.
    expect(documento.data()?.['criadoEm']).toBeDefined();

    const registro = await banco
      .collection('outbox')
      .doc(`definir-senha_${resumo.uid}`)
      .get();
    expect(registro.data()).toMatchObject({
      tipo: 'definir-senha',
      destinatarioUid: resumo.uid,
      estado: 'enviado',
    });

    expect(transporte.enviadas).toHaveLength(1);
    expect(transporte.enviadas[0].modelo?.alias).toBe('password-reset');
    expect(transporte.enviadas[0].para).toEqual([ANA.email]);
  });

  /**
   * O link e gerado pelo Admin SDK e reescrito para a nossa pagina. Aqui prova-se
   * que ele chega ao transporte com um `oobCode` de verdade, vindo do emulador —
   * o teste de unidade so mostra que a funcao de reescrita faz a conta certa.
   */
  it('entrega um oobCode real, apontando para a nossa pagina', async () => {
    await servico.criar(ANA, UID_ADMIN);

    const link = transporte.enviadas[0].modelo?.variaveis['LINK'] ?? '';
    const url = new URL(link);
    expect(url.pathname).toBe('/definir-senha');
    expect(url.searchParams.get('oobCode')).toMatch(/.+/);
  });

  /**
   * O documento do outbox NAO pode conter o link nem o e-mail: link e credencial
   * viva em repouso, e endereco e dado pessoal replicado no backup e no PITR.
   */
  it('nao guarda link nem endereco no outbox', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);

    const registro = await banco
      .collection('outbox')
      .doc(`definir-senha_${resumo.uid}`)
      .get();
    const serializado = JSON.stringify(registro.data());

    expect(serializado).not.toMatch(/oobCode/);
    expect(serializado).not.toMatch(/ana@escritorio\.test/);
  });

  it('recusa o segundo cadastro do mesmo e-mail', async () => {
    await servico.criar(ANA, UID_ADMIN);
    await expect(servico.criar(ANA, UID_ADMIN)).rejects.toThrow(/Ja existe/);
  });

  /**
   * Retomada de verdade: um usuario existe no Auth de uma tentativa que morreu
   * antes do Firestore. E o cenario que justifica a criacao ser idempotente em
   * vez de compensar apagando conta.
   */
  it('retoma criacao interrompida depois do Auth', async () => {
    const orfao = await auth.createUser({ email: ANA.email });

    const resumo = await servico.criar(ANA, UID_ADMIN);

    expect(resumo.uid).toBe(orfao.uid);
    const usuario = await auth.getUser(orfao.uid);
    expect(usuario.customClaims?.[NOME_CLAIM_PERFIL]).toBe('advogado');
  });
});

/* -------------------------------------------------------------------------- */

describe('fronteira de autorizacao', () => {
  const perfis = new PerfisGuard(new Reflector());

  it('o advogado recem-criado passa pelo guard com o perfil dele', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);
    const { contexto: alvo, requisicao } = contexto(
      RotaAberta,
      await idTokenDe(resumo.uid),
    );

    await expect(autenticacao.canActivate(alvo)).resolves.toBe(true);
    expect(requisicao.usuario?.perfil).toBe('advogado');
  });

  /**
   * A demonstracao que a etapa pede, no servidor e com um token de verdade:
   * o advogado nao alcanca rota de administrador.
   */
  it('o advogado nao acessa rota administrativa', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);
    const { contexto: alvo } = contexto(
      RotaAdministrativa,
      await idTokenDe(resumo.uid),
    );

    await autenticacao.canActivate(alvo);
    expect(() => perfis.canActivate(alvo)).toThrow(ForbiddenException);
  });

  it('sem token, nem a rota aberta responde', async () => {
    const { contexto: alvo } = contexto(RotaAberta);
    await expect(autenticacao.canActivate(alvo)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * Usuario autenticado e sem claim — a janela real entre `createUser` e
   * `setCustomUserClaims`. 403, e nao 401: a identidade esta provada.
   */
  it('token valido sem perfil recebe 403', async () => {
    const semPerfil = await auth.createUser({ email: 'ninguem@escritorio.test' });
    const { contexto: alvo } = contexto(
      RotaAberta,
      await idTokenDe(semPerfil.uid),
    );

    await expect(autenticacao.canActivate(alvo)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe('suspensao', () => {
  /**
   * O TESTE CENTRAL DA ETAPA. Marcar um campo nao suspende ninguem: o que prova a
   * suspensao e um token emitido ANTES dela deixar de ser aceito depois. Sem
   * `revokeRefreshTokens` no servico e sem `checkRevoked` no guard, este teste
   * passa a falhar — e as duas metades vivem em arquivos diferentes.
   */
  it('derruba a sessao que ja estava aberta', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);
    const token = await idTokenDe(resumo.uid);

    // O guard aceita o token agora.
    const antes = contexto(RotaAberta, token);
    await expect(autenticacao.canActivate(antes.contexto)).resolves.toBe(true);

    await passarUmSegundo();
    await servico.suspender(resumo.uid, UID_ADMIN);

    // O MESMO token, agora recusado.
    const depois = contexto(RotaAberta, token);
    await expect(
      autenticacao.canActivate(depois.contexto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('desabilita a conta e grava o status', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);

    await servico.suspender(resumo.uid, UID_ADMIN);

    expect((await auth.getUser(resumo.uid)).disabled).toBe(true);
    const documento = await banco.collection('advogados').doc(resumo.uid).get();
    expect(documento.data()?.['status']).toBe('suspenso');
  });

  /**
   * Suspenso continua sendo advogado. O que muda e o acesso, e mexer na claim
   * faria a reativacao precisar reescreve-la — uma escrita de claim a mais.
   */
  it('mantem a claim do suspenso', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);

    await servico.suspender(resumo.uid, UID_ADMIN);

    const usuario = await auth.getUser(resumo.uid);
    expect(usuario.customClaims?.[NOME_CLAIM_PERFIL]).toBe('advogado');
  });

  it('a reativacao devolve o acesso a um token novo', async () => {
    const resumo = await servico.criar(ANA, UID_ADMIN);
    await servico.suspender(resumo.uid, UID_ADMIN);

    await servico.reativar(resumo.uid, UID_ADMIN);

    expect((await auth.getUser(resumo.uid)).disabled).toBe(false);
    const { contexto: alvo } = contexto(
      RotaAberta,
      await idTokenDe(resumo.uid),
    );
    await expect(autenticacao.canActivate(alvo)).resolves.toBe(true);
  });

  it('recusa suspender uid que nao tem documento de advogado', async () => {
    const admin = await auth.createUser({ email: 'admin@escritorio.test' });

    await expect(servico.suspender(admin.uid, UID_ADMIN)).rejects.toThrow(
      /nao encontrado/i,
    );
    expect((await auth.getUser(admin.uid)).disabled).toBe(false);
  });
});
