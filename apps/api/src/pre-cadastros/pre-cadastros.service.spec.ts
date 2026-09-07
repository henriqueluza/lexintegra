import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { NovoPreCadastro } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { idDoPreCadastro, segredoConfere, separarToken } from './liberacao.js';
import {
  COLECAO_PRE_CADASTROS,
  PreCadastrosService,
} from './pre-cadastros.service.js';

const ANA: NovoPreCadastro = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '61990000000',
};

function montar(): { servico: PreCadastrosService; banco: FirestoreFalso } {
  const banco = new FirestoreFalso();
  return {
    servico: new PreCadastrosService(banco as unknown as Firestore),
    banco,
  };
}

function caminhoDe(email: string): string {
  return `${COLECAO_PRE_CADASTROS}/${idDoPreCadastro(email)}`;
}

describe('PreCadastrosService.registrar', () => {
  it('grava os tres campos e a contagem de envios', async () => {
    const { servico, banco } = montar();

    await servico.registrar(ANA);

    expect(banco.documentos.get(caminhoDe(ANA.email))).toMatchObject({
      nome: 'Ana Ribeiro Salgado',
      email: 'ana@empresa.com.br',
      telefone: '61990000000',
      envios: 1,
    });
  });

  /**
   * O documento guarda o que a arquitetura mandou guardar e mais nada. IP,
   * user-agent e referenciador sao o que um formulario de captacao coleta por
   * reflexo — e sao dado pessoal de quem ainda nao tem relacao contratual
   * nenhuma (arquitetura, secao 13). Este teste existe para que acrescentar um
   * deles seja uma decisao, e nao um acidente.
   */
  it('nao guarda nada alem do declarado', async () => {
    const { servico, banco } = montar();

    await servico.registrar(ANA);

    const gravado = banco.documentos.get(caminhoDe(ANA.email)) ?? {};
    expect(Object.keys(gravado).sort()).toEqual([
      'atualizadoEm',
      'criadoEm',
      'email',
      'envios',
      'liberacaoExpiraEm',
      'liberacaoHash',
      'nome',
      'telefone',
    ]);
  });

  /**
   * O segredo em claro nunca chega ao banco (regra inviolavel 9). Quem ler o
   * Firestore inteiro — um backup, um vazamento, um administrador curioso — nao
   * consegue destravar a vitrine de ninguem.
   */
  it('grava o hash do segredo, nunca o segredo', async () => {
    const { servico, banco } = montar();

    const { token } = await servico.registrar(ANA);
    const partes = separarToken(token);
    const gravado = banco.documentos.get(caminhoDe(ANA.email));

    expect(partes).not.toBeNull();
    expect(JSON.stringify(gravado)).not.toContain(partes?.segredo);
    expect(
      segredoConfere(partes?.segredo ?? '', String(gravado?.['liberacaoHash'])),
    ).toBe(true);
  });

  it('devolve token que casa com o id deterministico do e-mail', async () => {
    const { servico } = montar();

    const { token } = await servico.registrar(ANA);

    expect(separarToken(token)?.id).toBe(idDoPreCadastro(ANA.email));
  });

  describe('reenvio do mesmo e-mail', () => {
    it('ocupa um documento so', async () => {
      const { servico, banco } = montar();

      await servico.registrar(ANA);
      await servico.registrar(ANA);

      expect(banco.documentos.size).toBe(1);
    });

    it('soma os envios', async () => {
      const { servico, banco } = montar();

      await servico.registrar(ANA);
      await servico.registrar(ANA);
      await servico.registrar(ANA);

      expect(banco.documentos.get(caminhoDe(ANA.email))?.['envios']).toBe(3);
    });

    /**
     * `criadoEm` e a unica informacao que diz ha quanto tempo aquela pessoa
     * apareceu. Um `set` com `serverTimestamp()` a cada envio reescreveria a data
     * de criacao e a base de leads passaria a registrar o ultimo contato duas
     * vezes, em vez de o primeiro e o ultimo.
     */
    it('preserva a data de criacao', async () => {
      const { servico, banco } = montar();

      await servico.registrar(ANA);
      const primeiroCarimbo = banco.documentos.get(caminhoDe(ANA.email))?.[
        'criadoEm'
      ];
      banco.documentos.set(caminhoDe(ANA.email), {
        ...banco.documentos.get(caminhoDe(ANA.email)),
        criadoEm: 'carimbo-materializado',
      });

      await servico.registrar(ANA);

      expect(banco.documentos.get(caminhoDe(ANA.email))?.['criadoEm']).toBe(
        'carimbo-materializado',
      );
      expect(primeiroCarimbo).toBeDefined();
    });

    /**
     * Segredo novo a cada envio. Quem trocou de navegador precisa disso para
     * voltar a ver a vitrine, e a rotacao limita a janela de um token que tenha
     * ficado num dispositivo compartilhado.
     */
    it('rotaciona o segredo e invalida o anterior', async () => {
      const { servico, banco } = montar();

      const primeiro = await servico.registrar(ANA);
      const segundo = await servico.registrar(ANA);
      const hash = String(
        banco.documentos.get(caminhoDe(ANA.email))?.['liberacaoHash'],
      );

      expect(primeiro.token).not.toBe(segundo.token);
      expect(
        segredoConfere(separarToken(primeiro.token)?.segredo ?? '', hash),
      ).toBe(false);
      expect(
        segredoConfere(separarToken(segundo.token)?.segredo ?? '', hash),
      ).toBe(true);
    });
  });

  /**
   * Le antes de escrever, dentro da transacao. Nao e estilo: `criadoEm` e
   * `envios` dependem do estado anterior, e o Firestore recusa transacao que
   * escreve antes de ler.
   */
  it('le antes de escrever', async () => {
    const { servico, banco } = montar();

    await servico.registrar(ANA);

    expect(banco.ordemDeEscrita[0]).toMatch(/^get /);
    expect(banco.ordemDeEscrita[1]).toMatch(/^set /);
  });

  it('nao dispara efeito colateral nenhum', async () => {
    const { servico, banco } = montar();

    await servico.registrar(ANA);

    expect(banco.escritas).toEqual([`set ${caminhoDe(ANA.email)}`]);
  });
});

describe('PreCadastrosService.liberado', () => {
  it('aceita o token que acabou de emitir', async () => {
    const { servico } = montar();

    const { token } = await servico.registrar(ANA);

    await expect(servico.liberado(token)).resolves.toBe(true);
  });

  it.each([
    ['malformado', 'sem-ponto-nenhum'],
    ['de documento inexistente', `${idDoPreCadastro('ninguem@x.test')}.abc`],
  ])('recusa token %s', async (_nome, token) => {
    const { servico } = montar();
    await servico.registrar(ANA);

    await expect(servico.liberado(token)).resolves.toBe(false);
  });

  it('recusa segredo trocado para o documento certo', async () => {
    const { servico } = montar();

    const { token } = await servico.registrar(ANA);
    const id = separarToken(token)?.id ?? '';

    await expect(servico.liberado(`${id}.outro-segredo`)).resolves.toBe(false);
  });

  /**
   * A expiracao e conferida no SERVIDOR, nao so no navegador. O `expiraEm` que
   * viaja na resposta serve para a tela esquecer o token na hora certa; se ele
   * fosse a unica checagem, bastaria editar o armazenamento local para ter uma
   * liberacao permanente.
   */
  it('recusa token expirado', async () => {
    const { servico, banco } = montar();

    const { token } = await servico.registrar(ANA);
    banco.documentos.set(caminhoDe(ANA.email), {
      ...banco.documentos.get(caminhoDe(ANA.email)),
      liberacaoExpiraEm: Timestamp.fromMillis(Date.now() - 1000),
    });

    await expect(servico.liberado(token)).resolves.toBe(false);
  });
});

describe('PreCadastrosService.listar', () => {
  /**
   * O carimbo e semeado como numero porque o `FirestoreFalso` nao imita os tipos
   * do Firestore — o que ele imita e a ORDEM, que e o que este teste verifica. O
   * `Timestamp` de verdade, e o `criadoEm` materializado pelo servidor, sao
   * exercitados no `.integration-spec.ts`.
   */
  async function semear(banco: FirestoreFalso): Promise<void> {
    const pessoas = [
      { email: 'antiga@x.test', criadoEm: 1 },
      { email: 'media@x.test', criadoEm: 2 },
      { email: 'recente@x.test', criadoEm: 3 },
    ];

    for (const pessoa of pessoas) {
      banco.documentos.set(caminhoDe(pessoa.email), {
        nome: 'Fulana de Tal',
        email: pessoa.email,
        telefone: '61990000000',
        envios: 1,
        liberacaoHash: 'x',
        criadoEm: pessoa.criadoEm,
        atualizadoEm: pessoa.criadoEm,
      });
    }
    await Promise.resolve();
  }

  it('devolve o mais recente primeiro', async () => {
    const { servico, banco } = montar();
    await semear(banco);

    const leads = await servico.listar(10);

    expect(leads.map((lead) => lead.email)).toEqual([
      'recente@x.test',
      'media@x.test',
      'antiga@x.test',
    ]);
  });

  it('respeita o limite', async () => {
    const { servico, banco } = montar();
    await semear(banco);

    await expect(servico.listar(2)).resolves.toHaveLength(2);
  });

  /**
   * O resumo nao carrega material de credencial. Um administrador consultando a
   * base de leads nao tem por que receber o que destrava a vitrine de alguem — e
   * um campo que nunca sai do servidor nao vaza em log de cliente nem em captura
   * de tela.
   */
  it('nao devolve o hash nem a expiracao da liberacao', async () => {
    const { servico, banco } = montar();
    await semear(banco);

    const [lead] = await servico.listar(1);

    expect(Object.keys(lead).sort()).toEqual([
      'atualizadoEm',
      'criadoEm',
      'email',
      'envios',
      'id',
      'nome',
      'telefone',
    ]);
  });
});
