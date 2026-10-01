import { ConflictException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  MODELO_ANAMNESE,
  MODELO_ANAMNESE_PROVISORIA,
  camposDaFicha,
  esquemaAnamnese,
  type FichaAnamnese,
} from 'shared';
import { respostasMinimasDaFicha } from '../arnes-anamnese.js';
import { CLIENTES_FICTICIOS } from '../../../../scripts/dados-ficticios/clientes-pedidos.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { AnamneseService } from './anamnese.service.js';

function montar(): {
  banco: FirestoreFalso;
  servico: AnamneseService;
  clientes: ClientesService;
} {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  return {
    banco,
    servico: new AnamneseService(db),
    clientes: new ClientesService(db),
  };
}

function fichaMinima(): FichaAnamnese {
  return esquemaAnamnese.parse({
    respostas: {
      ...respostasMinimasDaFicha(),
      razaoSocial: 'Clinica Exemplo Ltda',
    },
  });
}

describe('AnamneseService', () => {
  it('comeca sem ficha, com o preenchimento vindo do cadastro e do pre-cadastro', async () => {
    const { servico, banco } = montar();
    banco.documentos.set('clientes/uid-ana', {
      nome: 'Ana Souza',
      email: 'ana@exemplo.test',
    });
    banco.documentos.set(
      `pre-cadastros/${idDoPreCadastro('ana@exemplo.test')}`,
      { telefone: '61990000000' },
    );

    expect(await servico.situacao('uid-ana')).toEqual({
      preenchida: false,
      preenchimento: {
        nome: 'Ana Souza',
        email: 'ana@exemplo.test',
        telefone: '61990000000',
      },
    });
  });

  it('sem pre-cadastro e sem cadastro, o preenchimento vem vazio', async () => {
    const { servico, banco } = montar();

    expect((await servico.situacao('uid-x')).preenchimento).toEqual({
      nome: '',
      email: '',
      telefone: '',
    });

    banco.documentos.set('clientes/uid-ana', {
      nome: 'Ana',
      email: 'ana@exemplo.test',
    });
    expect((await servico.situacao('uid-ana')).preenchimento.telefone).toBe('');
  });

  /**
   * O formato lido e o de sempre: pares rotulo/valor que a tela do advogado ja
   * le por `ClientesService.anamneseDe`, sem conhecer nome de campo. As
   * respostas estruturadas vao junto, para a exportacao do titular.
   */
  it('grava pares rotulo/valor e as respostas estruturadas', async () => {
    const { servico, clientes, banco } = montar();

    await servico.registrar('uid-ana', fichaMinima());

    const [lida] = await clientes.anamneseDe('uid-ana');
    expect(lida.id).toBe(MODELO_ANAMNESE);
    expect(lida.campos).toContainEqual({
      rotulo: 'Razão social',
      valor: 'Clinica Exemplo Ltda',
    });
    const gravado = banco.documentos.get(
      `clientes/uid-ana/anamnese/${MODELO_ANAMNESE}`,
    );
    expect(gravado?.['modelo']).toBe(MODELO_ANAMNESE);
    expect(gravado?.['respostas']).toMatchObject({ cargo: 'socio' });
  });

  it('depois de enviada, aparece como preenchida so para quem enviou', async () => {
    const { servico } = montar();

    await servico.registrar('uid-ana', fichaMinima());

    expect((await servico.situacao('uid-ana')).preenchida).toBe(true);
    expect((await servico.situacao('uid-bruno')).preenchida).toBe(false);
  });

  /**
   * Quem so respondeu o stub da Etapa 8 ainda nao preencheu a definitiva —
   * e o stub continua legivel ao lado dela.
   */
  it('a ficha provisoria nao conta como preenchida e continua legivel', async () => {
    const { servico, banco, clientes } = montar();
    banco.documentos.set(
      `clientes/uid-ana/anamnese/${MODELO_ANAMNESE_PROVISORIA}`,
      {
        campos: [{ rotulo: 'Contexto', valor: 'Venda de cotas.' }],
        modelo: MODELO_ANAMNESE_PROVISORIA,
        criadoEm: new Date(),
      },
    );

    expect((await servico.situacao('uid-ana')).preenchida).toBe(false);

    await servico.registrar('uid-ana', fichaMinima());
    const fichas = await clientes.anamneseDe('uid-ana');
    expect(fichas.map((f) => f.id).sort()).toEqual(
      [MODELO_ANAMNESE, MODELO_ANAMNESE_PROVISORIA].sort(),
    );
  });

  /** Uma ficha por cliente: reescrever o que o advogado ja leu apagaria a trilha. */
  it('recusa o segundo envio com 409', async () => {
    const { servico } = montar();
    await servico.registrar('uid-ana', fichaMinima());

    await expect(servico.registrar('uid-ana', fichaMinima())).rejects.toThrow(
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

    await expect(servico.registrar('uid-ana', fichaMinima())).rejects.toThrow(
      'UNAVAILABLE',
    );
  });

  /**
   * A semente passa os exemplos pelo schema e derruba se um for recusado; este
   * teste pega o mesmo defeito sem precisar subir os emuladores.
   */
  it.each(CLIENTES_FICTICIOS.map((c) => [c.chave, c.anamnese] as const))(
    'a ficha ficticia de %s passa pelo schema sem mudar',
    (_chave, anamnese) => {
      const ficha = { outros: {}, ...anamnese };
      const lida = esquemaAnamnese.parse(ficha);
      expect(camposDaFicha(lida)).toEqual(camposDaFicha(ficha));
    },
  );
});
