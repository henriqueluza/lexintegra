import { NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { FirestoreFalso } from '../firestore-falso.js';
import { AcessoPedidoService } from '../pedidos/acesso.service.js';
import { ObservacoesService, type Autor } from './observacoes.service.js';

const CLIENTE: Autor = { uid: 'uid-clara', perfil: 'cliente' };
const OUTRO_CLIENTE: Autor = { uid: 'uid-bruno', perfil: 'cliente' };
const ADVOGADO: Autor = { uid: 'uid-ana', perfil: 'advogado' };
const OUTRO_ADVOGADO: Autor = { uid: 'uid-carlos', perfil: 'advogado' };
const ADMIN: Autor = { uid: 'uid-admin', perfil: 'admin' };

function montar(distribuido = true): {
  banco: FirestoreFalso;
  observacoes: ObservacoesService;
} {
  const banco = new FirestoreFalso();

  banco.documentos.set('pedidos/pedido-1', {
    clienteId: CLIENTE.uid,
    advogadoId: distribuido ? ADVOGADO.uid : null,
    distribuido,
  });

  return {
    banco,
    observacoes: new ObservacoesService(
      new AcessoPedidoService(banco as unknown as Firestore),
    ),
  };
}

describe('ObservacoesService', () => {
  describe('quem alcanca o pedido', () => {
    it.each([
      ['o cliente dono', CLIENTE],
      ['o advogado atribuido', ADVOGADO],
      ['o administrador', ADMIN],
    ])('%s escreve e le', async (_nome, quem) => {
      const { observacoes } = montar();

      await observacoes.registrar('pedido-1', quem, { texto: 'anotacao' });

      expect(await observacoes.listar('pedido-1', quem)).toHaveLength(1);
    });

    /**
     * 404 e nao 403, pela mesma razao de `ConsultaPedidosService`: a diferenca
     * entre "nao existe" e "existe e nao e seu" e o que alguem varrendo ids
     * procura.
     */
    it.each([
      ['outro cliente', OUTRO_CLIENTE],
      ['advogado nao atribuido', OUTRO_ADVOGADO],
    ])('%s nem le nem escreve', async (_nome, quem) => {
      const { observacoes } = montar();

      await expect(
        observacoes.registrar('pedido-1', quem, { texto: 'x' }),
      ).rejects.toThrow(NotFoundException);
      await expect(observacoes.listar('pedido-1', quem)).rejects.toThrow(
        NotFoundException,
      );
    });

    /** Pedido na caixa de entrada nao e de advogado nenhum. */
    it('advogado nao alcanca pedido sem distribuicao', async () => {
      const { observacoes } = montar(false);

      await expect(observacoes.listar('pedido-1', ADVOGADO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('recusa pedido inexistente', async () => {
      const { observacoes } = montar();

      await expect(observacoes.listar('nao-existe', CLIENTE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('append-only', () => {
    /**
     * A ausencia de edicao e exclusao E a decisao (item 2.3.3): o advogado
     * trabalha a partir do que o cliente escreveu, e texto reescrito faz "o
     * cliente pediu X" virar "o cliente sempre pediu Y", sem trilha. Decisao que
     * so existe como ausencia ninguem defende numa revisao futura — por isso o
     * teste.
     */
    it('nao expoe editar nem excluir', () => {
      const metodos = ObservacoesService.prototype as unknown as Record<
        string,
        unknown
      >;

      expect(metodos['editar']).toBeUndefined();
      expect(metodos['atualizar']).toBeUndefined();
      expect(metodos['excluir']).toBeUndefined();
      expect(metodos['remover']).toBeUndefined();
    });

    it('duas observacoes do mesmo autor sao dois documentos', async () => {
      const { observacoes } = montar();

      await observacoes.registrar('pedido-1', CLIENTE, { texto: 'primeira' });
      await observacoes.registrar('pedido-1', CLIENTE, { texto: 'segunda' });

      const lista = await observacoes.listar('pedido-1', CLIENTE);
      expect(lista.map((o) => o.texto)).toEqual(['primeira', 'segunda']);
    });

    it('so escreve, nunca atualiza', async () => {
      const { banco, observacoes } = montar();

      await observacoes.registrar('pedido-1', CLIENTE, { texto: 'primeira' });

      expect(banco.escritas.every((linha) => linha.startsWith('set '))).toBe(
        true,
      );
    });
  });

  /** A tela precisa distinguir o que o cliente escreveu do que o advogado
   * respondeu; derivar isso do uid exigiria uma consulta por linha. */
  it('guarda o perfil do autor junto do texto', async () => {
    const { observacoes } = montar();

    await observacoes.registrar('pedido-1', ADVOGADO, { texto: 'em analise' });

    const [registro] = await observacoes.listar('pedido-1', CLIENTE);
    expect(registro).toMatchObject({
      autorUid: ADVOGADO.uid,
      autorPerfil: 'advogado',
    });
  });
});
