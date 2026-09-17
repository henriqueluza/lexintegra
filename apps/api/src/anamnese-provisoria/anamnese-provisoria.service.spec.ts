import { ConflictException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { MODELO_ANAMNESE_PROVISORIA } from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { AnamneseProvisoriaService } from './anamnese-provisoria.service.js';

function montar(): {
  banco: FirestoreFalso;
  servico: AnamneseProvisoriaService;
  clientes: ClientesService;
} {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  return {
    banco,
    servico: new AnamneseProvisoriaService(db),
    clientes: new ClientesService(db),
  };
}

const FICHA = {
  respostas: {
    contexto: 'Venda de participacao societaria.',
    prazos: '',
    documentos: 'Contrato social.',
  },
};

describe('AnamneseProvisoriaService (stub temporario)', () => {
  it('comeca sem ficha', async () => {
    const { servico } = montar();

    expect(await servico.situacao('uid-ana')).toEqual({ preenchida: false });
  });

  /**
   * O formato gravado e o definitivo: pares rotulo/valor que a tela do advogado
   * ja le por `ClientesService.anamneseDe`, sem conhecer nome de campo.
   */
  it('grava pares rotulo/valor que a leitura do advogado ja entende', async () => {
    const { servico, clientes, banco } = montar();

    await servico.registrar('uid-ana', FICHA);

    const [lida] = await clientes.anamneseDe('uid-ana');
    expect(lida.campos.map((c) => c.valor)).toEqual([
      'Venda de participacao societaria.',
      '',
      'Contrato social.',
    ]);
    expect(lida.campos[0].rotulo).toMatch(/situação/);
    expect(
      banco.documentos.get(
        `clientes/uid-ana/anamnese/${MODELO_ANAMNESE_PROVISORIA}`,
      )?.['modelo'],
    ).toBe(MODELO_ANAMNESE_PROVISORIA);
  });

  it('depois de enviada, aparece como preenchida', async () => {
    const { servico } = montar();

    await servico.registrar('uid-ana', FICHA);

    expect(await servico.situacao('uid-ana')).toEqual({ preenchida: true });
    expect(await servico.situacao('uid-bruno')).toEqual({ preenchida: false });
  });

  /** Uma ficha por cliente: reescrever o que o advogado ja leu apagaria a trilha. */
  it('recusa o segundo envio com 409', async () => {
    const { servico } = montar();
    await servico.registrar('uid-ana', FICHA);

    await expect(servico.registrar('uid-ana', FICHA)).rejects.toThrow(
      ConflictException,
    );
  });

  it('falha de escrita que nao e duplicata sobe', async () => {
    const { servico, banco } = montar();
    const original = banco.collection.bind(banco);
    banco.collection = ((caminho: string) => {
      const colecao = original(caminho);
      const doc = colecao.doc.bind(colecao);
      return Object.assign(colecao, {
        doc: (id: string) => {
          const referencia = doc(id);
          const sub = referencia.collection.bind(referencia);
          return Object.assign(referencia, {
            collection: (nome: string) => {
              const interna = sub(nome);
              const docInterno = interna.doc.bind(interna);
              return Object.assign(interna, {
                doc: (idInterno: string) =>
                  Object.assign(docInterno(idInterno), {
                    create: () => Promise.reject(new Error('UNAVAILABLE')),
                  }),
              });
            },
          });
        },
      });
    }) as typeof banco.collection;

    await expect(servico.registrar('uid-ana', FICHA)).rejects.toThrow(
      'UNAVAILABLE',
    );
  });
});
