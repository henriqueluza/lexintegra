import { NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { COLECAO_PRODUTOS, ProdutosService } from './produtos.service.js';

const ADMIN = 'uid-admin';

const PARECER: NovoProduto = {
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: ['Reuna os contratos vigentes.'],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 7,
  numeroRevisoesPermitidas: 2,
};

function montar(): { servico: ProdutosService; banco: FirestoreFalso } {
  const banco = new FirestoreFalso();
  return {
    servico: new ProdutosService(banco as unknown as Firestore),
    banco,
  };
}

describe('ProdutosService', () => {
  describe('criacao', () => {
    it('grava o produto ativo, com autoria e os dois carimbos', async () => {
      const { servico, banco } = montar();

      const resumo = await servico.criar(PARECER, ADMIN);

      const gravado = banco.documentos.get(`${COLECAO_PRODUTOS}/${resumo.id}`);
      expect(gravado).toMatchObject({
        nome: PARECER.nome,
        precoCentavos: 250_000,
        numeroRevisoesPermitidas: 2,
        ativo: true,
        criadoPor: ADMIN,
        atualizadoPor: ADMIN,
      });
      expect(gravado?.['criadoEm']).toBeDefined();
      expect(gravado?.['atualizadoEm']).toBeDefined();
    });

    /**
     * Produto nasce na vitrine. Nascer inativo obrigaria um segundo passo que
     * ninguem faria, e o sintoma seria catalogo cadastrado que nao aparece.
     */
    it('devolve o produto ja ativo', async () => {
      const { servico } = montar();
      expect((await servico.criar(PARECER, ADMIN)).ativo).toBe(true);
    });

    it('escreve uma vez so, na colecao de produtos', async () => {
      const { servico, banco } = montar();
      const resumo = await servico.criar(PARECER, ADMIN);
      expect(banco.escritas).toEqual([`set ${COLECAO_PRODUTOS}/${resumo.id}`]);
    });
  });

  describe('listagem', () => {
    async function comTres(): Promise<{
      servico: ProdutosService;
      banco: FirestoreFalso;
    }> {
      const { servico, banco } = montar();
      const contrato = await servico.criar(
        { ...PARECER, nome: 'Contrato Social' },
        ADMIN,
      );
      await servico.criar({ ...PARECER, nome: 'Due Diligence' }, ADMIN);
      await servico.desativar(contrato.id, ADMIN);
      return { servico, banco };
    }

    it('lista tudo em ordem de nome quando a situacao e todos', async () => {
      const { servico } = await comTres();
      expect((await servico.listar('todos')).map((p) => p.nome)).toEqual([
        'Contrato Social',
        'Due Diligence',
      ]);
    });

    it('filtra por ativos', async () => {
      const { servico } = await comTres();
      expect((await servico.listar('ativos')).map((p) => p.nome)).toEqual([
        'Due Diligence',
      ]);
    });

    it('filtra por inativos', async () => {
      const { servico } = await comTres();
      expect((await servico.listar('inativos')).map((p) => p.nome)).toEqual([
        'Contrato Social',
      ]);
    });

    it('converte o carimbo do servidor em ISO 8601', async () => {
      const { servico, banco } = montar();
      const resumo = await servico.criar(PARECER, ADMIN);
      banco.documentos.set(`${COLECAO_PRODUTOS}/${resumo.id}`, {
        ...banco.documentos.get(`${COLECAO_PRODUTOS}/${resumo.id}`),
        criadoEm: Timestamp.fromDate(new Date('2026-09-05T12:00:00.000Z')),
      });

      expect((await servico.listar('todos'))[0].criadoEm).toBe(
        '2026-09-05T12:00:00.000Z',
      );
    });

    /** Enquanto o carimbo do servidor nao materializou, a API devolve `null` em
     * vez de inventar uma data — a tela mostra travessao, nao 1970. */
    it('devolve null enquanto o carimbo nao materializou', async () => {
      const { servico } = montar();
      await servico.criar(PARECER, ADMIN);
      expect((await servico.listar('todos'))[0].criadoEm).toBeNull();
    });
  });

  describe('edicao', () => {
    it('substitui os campos do produto e registra quem editou', async () => {
      const { servico, banco } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);

      await servico.editar(
        id,
        { ...PARECER, precoCentavos: 300_000 },
        'uid-outro',
      );

      expect(banco.documentos.get(`${COLECAO_PRODUTOS}/${id}`)).toMatchObject({
        precoCentavos: 300_000,
        criadoPor: ADMIN,
        atualizadoPor: 'uid-outro',
      });
    });

    /**
     * O caso que `congelarProduto` fecha: `ativo` nao esta entre os campos que a
     * edicao escreve, entao editar preco nao devolve a vitrine um produto que o
     * administrador tirou do ar. Sem isso, a desativacao seria desfeita pela
     * proxima correcao de texto, em silencio.
     */
    it('nao reativa um produto desativado', async () => {
      const { servico, banco } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);
      await servico.desativar(id, ADMIN);

      const editado = await servico.editar(
        id,
        { ...PARECER, nome: 'Parecer revisado' },
        ADMIN,
      );

      expect(editado.ativo).toBe(false);
      expect(banco.documentos.get(`${COLECAO_PRODUTOS}/${id}`)?.['ativo']).toBe(
        false,
      );
    });

    it('le antes de escrever', async () => {
      const { servico, banco } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);
      banco.ordemDeEscrita.length = 0;

      await servico.editar(id, PARECER, ADMIN);

      expect(banco.ordemDeEscrita).toEqual([
        `get ${COLECAO_PRODUTOS}/${id}`,
        `update ${COLECAO_PRODUTOS}/${id}`,
      ]);
    });

    it('recusa produto inexistente', async () => {
      const { servico } = montar();
      await expect(
        servico.editar('nao-existe', PARECER, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('vitrine', () => {
    it('desativa sem apagar o documento', async () => {
      const { servico, banco } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);

      const resumo = await servico.desativar(id, ADMIN);

      expect(resumo.ativo).toBe(false);
      expect(banco.documentos.has(`${COLECAO_PRODUTOS}/${id}`)).toBe(true);
    });

    it('reativa', async () => {
      const { servico } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);
      await servico.desativar(id, ADMIN);

      expect((await servico.ativar(id, ADMIN)).ativo).toBe(true);
    });

    it('registra quem tirou o produto do ar', async () => {
      const { servico, banco } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);

      await servico.desativar(id, 'uid-outro');

      expect(
        banco.documentos.get(`${COLECAO_PRODUTOS}/${id}`)?.['atualizadoPor'],
      ).toBe('uid-outro');
    });

    it.each([
      ['ativar', (s: ProdutosService) => s.ativar('nao-existe', ADMIN)],
      ['desativar', (s: ProdutosService) => s.desativar('nao-existe', ADMIN)],
      ['obter', (s: ProdutosService) => s.obter('nao-existe')],
    ])('%s recusa produto inexistente', async (_caso, operacao) => {
      const { servico } = montar();
      await expect(operacao(servico)).rejects.toThrow(NotFoundException);
    });
  });

  describe('leitura por id', () => {
    it('devolve o produto com o id do documento', async () => {
      const { servico } = montar();
      const { id } = await servico.criar(PARECER, ADMIN);

      expect(await servico.obter(id)).toMatchObject({
        id,
        nome: PARECER.nome,
        ativo: true,
      });
    });
  });
});
