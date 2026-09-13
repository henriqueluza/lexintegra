import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { PedidoDeUpload } from 'shared';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FirestoreFalso } from '../firestore-falso.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { FilaFalsa } from '../varredura/fila.js';
import { AnexosService } from './anexos.service.js';

const CLIENTE: QuemAcessa = { uid: 'uid-clara', perfil: 'cliente' };
const ADVOGADO: QuemAcessa = { uid: 'uid-ana', perfil: 'advogado' };
const ADMIN: QuemAcessa = { uid: 'uid-admin', perfil: 'admin' };
const INTRUSO: QuemAcessa = { uid: 'uid-bruno', perfil: 'cliente' };

const PDF: PedidoDeUpload = {
  nome: 'contrato.pdf',
  tipo: 'application/pdf',
  tamanhoBytes: 1_000_000,
};

const JPG: PedidoDeUpload = {
  nome: 'rg.jpg',
  tipo: 'image/jpeg',
  tamanhoBytes: 200_000,
};

interface Arranjo {
  banco: FirestoreFalso;
  armazenamento: ArmazenamentoFalso;
  fila: FilaFalsa;
  anexos: AnexosService;
}

function montar(): Arranjo {
  const banco = new FirestoreFalso();
  banco.documentos.set('pedidos/pedido-1', {
    clienteId: CLIENTE.uid,
    advogadoId: ADVOGADO.uid,
    distribuido: true,
  });

  const armazenamento = new ArmazenamentoFalso();
  const fila = new FilaFalsa();

  return {
    banco,
    armazenamento,
    fila,
    anexos: new AnexosService(
      new AcessoPedidoService(banco as unknown as Firestore),
      armazenamento,
      fila,
    ),
  };
}

describe('AnexosService — fluxo do cliente', () => {
  describe('so o cliente do pedido envia', () => {
    it('emite uma URL por arquivo', async () => {
      const { anexos } = montar();

      const emitidas = await anexos.pedirEnvio('pedido-1', CLIENTE, [PDF, JPG]);

      expect(emitidas).toHaveLength(2);
      expect(emitidas[0].url).toContain('escrita');
      expect(emitidas[0].validoPorSegundos).toBeGreaterThan(0);
    });

    /**
     * `exigir` deixa passar o advogado atribuido e o administrador, que PODEM LER
     * o cartao. Anexar em nome do cliente e outra coisa: o arquivo apareceria na
     * tela dele como se ele mesmo tivesse enviado.
     */
    it.each([
      ['o advogado atribuido', ADVOGADO],
      ['o administrador', ADMIN],
    ])('%s le, mas nao envia', async (_nome, quem) => {
      const { anexos } = montar();

      await expect(anexos.pedirEnvio('pedido-1', quem, [PDF])).rejects.toThrow(
        ForbiddenException,
      );
      expect(await anexos.listar('pedido-1', quem)).toEqual([]);
    });

    it('quem nao alcanca o pedido nem le', async () => {
      const { anexos } = montar();

      await expect(anexos.listar('pedido-1', INTRUSO)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('a politica e conferida no servidor', () => {
    it.each([
      ['tipo nao aceito', { ...PDF, tipo: 'application/zip' }],
      ['acima de 5 MB', { ...PDF, tamanhoBytes: 6 * 1024 * 1024 }],
    ])('recusa %s', async (_nome, arquivo) => {
      const { anexos, armazenamento } = montar();

      await expect(
        anexos.pedirEnvio('pedido-1', CLIENTE, [arquivo]),
      ).rejects.toThrow(BadRequestException);

      // Nao emite URL nem cria registro quando recusa.
      expect(armazenamento.operacoes).toEqual([]);
    });

    it('recusa mais de tres por envio', async () => {
      const { anexos } = montar();

      await expect(
        anexos.pedirEnvio('pedido-1', CLIENTE, [PDF, PDF, PDF, PDF]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('o registro nasce antes do arquivo', () => {
    /**
     * Um objeto no bucket sem documento correspondente e um arquivo que ninguem
     * sabe de quem e — e que nenhum job de retencao alcanca. Na ordem inversa,
     * uma falha entre as duas escritas deixaria lixo permanente na quarentena.
     */
    it('grava o documento antes de emitir a URL', async () => {
      const { banco, armazenamento, anexos } = montar();

      await anexos.pedirEnvio('pedido-1', CLIENTE, [PDF]);

      expect(banco.escritas[0]).toMatch(/^set pedidos\/pedido-1\/anexos\//);
      expect(armazenamento.operacoes).toHaveLength(1);
    });

    /** Regra inviolavel 6: o arquivo nasce longe de `limpo`. */
    it('nasce em pendente_upload', async () => {
      const { anexos } = montar();

      await anexos.pedirEnvio('pedido-1', CLIENTE, [PDF]);

      const [anexo] = await anexos.listar('pedido-1', CLIENTE);
      expect(anexo.estado).toBe('pendente_upload');
    });

    /** O caminho leva o prefixo DESTE fluxo (arquitetura 6.2). */
    it('o caminho fica sob o prefixo de anexos', async () => {
      const { banco, anexos } = montar();

      const [emitida] = await anexos.pedirEnvio('pedido-1', CLIENTE, [PDF]);
      const documento = banco.documentos.get(
        `pedidos/pedido-1/anexos/${emitida.id}`,
      );

      expect(documento?.['caminho']).toBe(`anexos/pedido-1/${emitida.id}`);
      expect(String(documento?.['caminho'])).not.toContain('entregaveis/');
    });
  });

  describe('confirmacao do envio', () => {
    async function ateConfirmar(): Promise<Arranjo & { anexoId: string }> {
      const arranjo = montar();
      const [emitida] = await arranjo.anexos.pedirEnvio('pedido-1', CLIENTE, [
        PDF,
      ]);
      return { ...arranjo, anexoId: emitida.id };
    }

    it('passa a pendente_scan e enfileira a varredura', async () => {
      const { anexos, fila, anexoId } = await ateConfirmar();

      await anexos.confirmarEnvio('pedido-1', anexoId, CLIENTE);

      const [anexo] = await anexos.listar('pedido-1', CLIENTE);
      expect(anexo.estado).toBe('pendente_scan');
      expect(fila.tarefas).toEqual([
        {
          fluxo: 'anexo-cliente',
          pedidoId: 'pedido-1',
          alvoId: anexoId,
          caminho: `anexos/pedido-1/${anexoId}`,
        },
      ]);
    });

    /** `pendente_scan` tambem nao serve: "ainda nao varrido" nao e
     * "provavelmente seguro". */
    it('nem depois de confirmado o arquivo fica servivel', async () => {
      const { anexos, anexoId } = await ateConfirmar();
      await anexos.confirmarEnvio('pedido-1', anexoId, CLIENTE);

      const [anexo] = await anexos.listar('pedido-1', CLIENTE);
      expect(anexo.estado).not.toBe('limpo');
    });

    it('so o cliente confirma', async () => {
      const { anexos, anexoId } = await ateConfirmar();

      await expect(
        anexos.confirmarEnvio('pedido-1', anexoId, ADVOGADO),
      ).rejects.toThrow(ForbiddenException);
    });

    it('recusa anexo inexistente', async () => {
      const { anexos } = await ateConfirmar();

      await expect(
        anexos.confirmarEnvio('pedido-1', 'nao-existe', CLIENTE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('a listagem nao devolve URL nenhuma', async () => {
    const { anexos } = montar();
    await anexos.pedirEnvio('pedido-1', CLIENTE, [PDF]);

    const lista = await anexos.listar('pedido-1', CLIENTE);

    expect(JSON.stringify(lista)).not.toMatch(/https?:/);
  });
});
