import {
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import type { NovoPreCadastro } from 'shared';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { idDoPreCadastro, separarToken } from './liberacao.js';
import {
  COLECAO_PRE_CADASTROS,
  PreCadastrosService,
} from './pre-cadastros.service.js';

const ANA: NovoPreCadastro = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '61990000000',
};

let banco: Firestore;
let servico: PreCadastrosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  servico = new PreCadastrosService(banco);
});

function documento(email: string): DocumentReference {
  return banco.collection(COLECAO_PRE_CADASTROS).doc(idDoPreCadastro(email));
}

/**
 * O que so o emulador prova. O duble em memoria nao materializa carimbo de
 * servidor, nao tem tipo `Timestamp` de verdade e nao impoe a regra de "toda
 * leitura antes de toda escrita" — as tres coisas que decidem se `criadoEm`
 * sobrevive ao reenvio e se a ordenacao da consulta administrativa e a que o
 * administrador espera.
 */
describe('PreCadastrosService contra o Firestore', () => {
  it('materializa criadoEm como Timestamp do servidor', async () => {
    await servico.registrar(ANA);

    const dados = (await documento(ANA.email).get()).data();
    expect(dados?.['criadoEm']).toBeInstanceOf(Timestamp);
    expect(dados?.['atualizadoEm']).toBeInstanceOf(Timestamp);
  });

  /**
   * O caso que motivou a transacao. Com `set({ merge: true })` e
   * `serverTimestamp()`, `criadoEm` seria reescrito a cada envio e a base de
   * leads perderia ha quanto tempo a pessoa apareceu — que e justamente o que
   * distingue um lead frio de um quente.
   */
  it('preserva criadoEm e avanca atualizadoEm no reenvio', async () => {
    await servico.registrar(ANA);
    const primeiro = (await documento(ANA.email).get()).data();

    await servico.registrar({ ...ANA, nome: 'Ana R. Salgado' });
    const segundo = (await documento(ANA.email).get()).data();

    expect((segundo?.['criadoEm'] as Timestamp).toMillis()).toBe(
      (primeiro?.['criadoEm'] as Timestamp).toMillis(),
    );
    expect(
      (segundo?.['atualizadoEm'] as Timestamp).toMillis(),
    ).toBeGreaterThanOrEqual(
      (primeiro?.['atualizadoEm'] as Timestamp).toMillis(),
    );
    expect(segundo?.['nome']).toBe('Ana R. Salgado');
    expect(segundo?.['envios']).toBe(2);
  });

  it('o mesmo e-mail nunca cria um segundo documento', async () => {
    await servico.registrar(ANA);
    await servico.registrar(ANA);
    await servico.registrar(ANA);

    const colecao = await banco.collection(COLECAO_PRE_CADASTROS).get();
    expect(colecao.size).toBe(1);
  });

  it('libera com o token emitido e recusa depois da rotacao', async () => {
    const primeiro = await servico.registrar(ANA);
    await expect(servico.liberado(primeiro.token)).resolves.toBe(true);

    const segundo = await servico.registrar(ANA);
    await expect(servico.liberado(primeiro.token)).resolves.toBe(false);
    await expect(servico.liberado(segundo.token)).resolves.toBe(true);
  });

  it('recusa token cujo prazo ja passou, conferindo no servidor', async () => {
    const { token } = await servico.registrar(ANA);

    await documento(ANA.email).update({
      liberacaoExpiraEm: Timestamp.fromMillis(Date.now() - 1),
    });

    await expect(servico.liberado(token)).resolves.toBe(false);
  });

  it('o token emitido aponta para o documento do proprio e-mail', async () => {
    const { token } = await servico.registrar(ANA);

    const id = separarToken(token)?.id ?? '';
    expect(
      (await banco.collection(COLECAO_PRE_CADASTROS).doc(id).get()).exists,
    ).toBe(true);
  });

  /**
   * `orderBy('criadoEm', 'desc')` e campo unico: o Firestore o indexa sozinho e
   * nao ha indice composto a declarar no Terraform. O emulador nao exige indice
   * nenhum, entao este teste nao prova a existencia do indice — prova a ORDEM,
   * que e o que a consulta promete ao administrador.
   */
  describe('consulta administrativa', () => {
    async function semearTres(): Promise<void> {
      for (const email of ['a@x.test', 'b@x.test', 'c@x.test']) {
        await servico.registrar({ ...ANA, email });
      }
    }

    it('devolve do mais recente para o mais antigo', async () => {
      await semearTres();

      const leads = await servico.listar(10);

      expect(leads.map((lead) => lead.email)).toEqual([
        'c@x.test',
        'b@x.test',
        'a@x.test',
      ]);
    });

    it('respeita o limite', async () => {
      await semearTres();

      await expect(servico.listar(2)).resolves.toHaveLength(2);
    });

    it('devolve os carimbos em ISO 8601', async () => {
      await servico.registrar(ANA);

      const [lead] = await servico.listar(1);

      expect(lead.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(lead.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
