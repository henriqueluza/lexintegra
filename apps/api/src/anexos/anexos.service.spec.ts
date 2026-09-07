import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { STATUS_ANEXO_SEM_ARQUIVO, type EnvioDeAnexos } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { AnexosService } from './anexos.service.js';

const CLIENTE: QuemAcessa = { uid: 'uid-clara', perfil: 'cliente' };
const ADVOGADO: QuemAcessa = { uid: 'uid-ana', perfil: 'advogado' };
const ADMIN: QuemAcessa = { uid: 'uid-admin', perfil: 'admin' };
const INTRUSO: QuemAcessa = { uid: 'uid-bruno', perfil: 'cliente' };

const ENVIO: EnvioDeAnexos = {
  anexos: [
    { nome: 'rg.jpg', tipo: 'image/jpeg', tamanhoBytes: 200_000 },
    { nome: 'contrato.pdf', tipo: 'application/pdf', tamanhoBytes: 1_000_000 },
  ],
};

function montar(): { banco: FirestoreFalso; anexos: AnexosService } {
  const banco = new FirestoreFalso();

  banco.documentos.set('pedidos/pedido-1', {
    clienteId: CLIENTE.uid,
    advogadoId: ADVOGADO.uid,
    distribuido: true,
  });

  return {
    banco,
    anexos: new AnexosService(
      new AcessoPedidoService(banco as unknown as Firestore),
    ),
  };
}

describe('AnexosService (placeholder da Etapa 9)', () => {
  describe('so o cliente anexa', () => {
    it('o cliente do pedido consegue', async () => {
      const { anexos } = montar();

      const gravados = await anexos.registrar('pedido-1', CLIENTE, ENVIO);

      expect(gravados.map((anexo) => anexo.nome)).toEqual([
        'rg.jpg',
        'contrato.pdf',
      ]);
    });

    /**
     * `exigir` deixa passar o advogado atribuido e o administrador — eles PODEM
     * LER o cartao. Anexar em nome do cliente e outra coisa: o arquivo apareceria
     * na tela dele como se ele mesmo tivesse enviado.
     */
    it.each([
      ['o advogado atribuido', ADVOGADO],
      ['o administrador', ADMIN],
    ])('%s le, mas nao anexa', async (_nome, quem) => {
      const { anexos } = montar();
      await anexos.registrar('pedido-1', CLIENTE, ENVIO);

      await expect(anexos.registrar('pedido-1', quem, ENVIO)).rejects.toThrow(
        ForbiddenException,
      );
      expect(await anexos.listar('pedido-1', quem)).toHaveLength(2);
    });

    it('quem nao alcanca o pedido nao chega nem a ler', async () => {
      const { anexos } = montar();

      await expect(anexos.listar('pedido-1', INTRUSO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * A regra inviolavel 6 diz que nada e servido com status diferente de `limpo`.
   * O anexo desta etapa nao tem arquivo nenhum, e o status precisa refletir isso
   * de um jeito que a emissao de link da Etapa 11 recuse sem caso especial.
   */
  describe('nada aqui e servivel', () => {
    it('grava o status de metadado sem arquivo', async () => {
      const { anexos } = montar();

      const [anexo] = await anexos.registrar('pedido-1', CLIENTE, ENVIO);

      expect(anexo.status).toBe(STATUS_ANEXO_SEM_ARQUIVO);
      expect(anexo.status).not.toBe('limpo');
    });

    it('nao devolve URL nenhuma', async () => {
      const { anexos } = montar();

      const [anexo] = await anexos.registrar('pedido-1', CLIENTE, ENVIO);

      expect(JSON.stringify(anexo)).not.toMatch(/https?:|url/i);
    });

    /** Nenhum caminho deste servico fala com o Cloud Storage. */
    it('so escreve no Firestore', async () => {
      const { banco, anexos } = montar();

      await anexos.registrar('pedido-1', CLIENTE, ENVIO);

      expect(
        banco.escritas.every((linha) =>
          linha.includes('pedidos/pedido-1/anexos/'),
        ),
      ).toBe(true);
    });
  });

  it('registra quem enviou', async () => {
    const { anexos } = montar();

    const [anexo] = await anexos.registrar('pedido-1', CLIENTE, ENVIO);

    expect(anexo.enviadoPor).toBe(CLIENTE.uid);
  });

  it('lista vazia quando nada foi anexado', async () => {
    const { anexos } = montar();

    expect(await anexos.listar('pedido-1', CLIENTE)).toEqual([]);
  });
});
