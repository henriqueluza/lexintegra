import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { PedidoDeUpload } from 'shared';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { FilaFalsa } from '../tarefas/fila.js';
import type { TarefaDeVarredura } from '../varredura/fila.js';
import { EntregaveisService } from './entregaveis.service.js';
import { UploadDeEntregavelService } from './upload.service.js';

const ADVOGADO = 'uid-ana';
const OUTRO = 'uid-carlos';

const PDF: PedidoDeUpload = {
  nome: 'parecer.pdf',
  tipo: 'application/pdf',
  tamanhoBytes: 2_000_000,
};

const ALVO = { pedidoId: 'pedido-1', entregavelId: '001' };

interface Arranjo {
  banco: FirestoreFalso;
  armazenamento: ArmazenamentoFalso;
  fila: FilaFalsa<TarefaDeVarredura>;
  upload: UploadDeEntregavelService;
}

function montar(estadoDoEntregavel = 'em_elaboracao'): Arranjo {
  const banco = new FirestoreFalso();

  banco.documentos.set('pedidos/pedido-1', {
    clienteId: 'uid-clara',
    advogadoId: ADVOGADO,
    distribuido: true,
    snapshot: { numeroRevisoesPermitidas: 2 },
  });

  banco.documentos.set('pedidos/pedido-1/entregaveis/001', {
    nome: 'Parecer',
    ordem: 1,
    estado: estadoDoEntregavel,
    revisoesUsadas: 0,
    arquivoAtual: null,
    transicoes: 1,
  });

  const armazenamento = new ArmazenamentoFalso();
  const fila = new FilaFalsa<TarefaDeVarredura>();

  return {
    banco,
    armazenamento,
    fila,
    upload: new UploadDeEntregavelService(
      banco as unknown as Firestore,
      armazenamento,
      fila,
      new EntregaveisService(banco as unknown as Firestore),
    ),
  };
}

describe('UploadDeEntregavelService — o segundo fluxo', () => {
  describe('a politica DESTE fluxo, e nao a do cliente', () => {
    /**
     * O mesmo JPG que e anexo valido do cliente NAO e entregavel. E o ponto
     * inteiro de a politica ser por fluxo (arquitetura 7.3, e o item 6 da secao
     * 0.2 do plano).
     */
    it('recusa jpg, que o fluxo do cliente aceita', async () => {
      const { upload } = montar();

      await expect(
        upload.pedirEnvio(ALVO, ADVOGADO, {
          nome: 'foto.jpg',
          tipo: 'image/jpeg',
          tamanhoBytes: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    /** E aceita 6 MB, que o fluxo do cliente recusaria. */
    it('aceita acima de 5 MB, que o fluxo do cliente recusa', async () => {
      const { upload } = montar();

      await expect(
        upload.pedirEnvio(ALVO, ADVOGADO, {
          ...PDF,
          tamanhoBytes: 6 * 1024 * 1024,
        }),
      ).resolves.toBeDefined();
    });

    it('recusa acima do teto proprio', async () => {
      const { upload } = montar();

      await expect(
        upload.pedirEnvio(ALVO, ADVOGADO, {
          ...PDF,
          tamanhoBytes: 21 * 1024 * 1024,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('a atribuicao e conferida antes de a URL sair', () => {
    /**
     * `registrarArquivo` confere estado e ATRIBUICAO dentro da transacao, e por
     * isso ele roda antes de a URL ser emitida. Emitir primeiro entregaria uma
     * URL de escrita valida a um advogado que a transacao vai recusar.
     */
    it('advogado nao atribuido nao recebe URL nenhuma', async () => {
      const { upload, armazenamento } = montar();

      await expect(upload.pedirEnvio(ALVO, OUTRO, PDF)).rejects.toThrow(
        ForbiddenException,
      );

      expect(armazenamento.operacoes).toEqual([]);
    });

    it('recusa quando o entregavel nao esta em elaboracao', async () => {
      const { upload, armazenamento } = montar('solicitado');

      await expect(upload.pedirEnvio(ALVO, ADVOGADO, PDF)).rejects.toThrow(
        ConflictException,
      );
      expect(armazenamento.operacoes).toEqual([]);
    });
  });

  describe('versao e caminho', () => {
    it('a primeira versao e 1, e o caminho leva o prefixo do fluxo', async () => {
      const { upload, banco } = montar();

      const { versao } = await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      expect(versao).toBe(1);
      const arquivo = banco.documentos.get(
        'pedidos/pedido-1/entregaveis/001',
      )?.['arquivoAtual'] as { caminho: string };
      expect(arquivo.caminho).toBe('entregaveis/pedido-1/001/v1');
    });

    /**
     * VERSOES DIFERENTES SAO OBJETOS DIFERENTES. Sobrescrever apagaria o arquivo
     * que o cliente ja aceitou — e o aceite de termos e por versao, entao a
     * evidencia apontaria para bytes que sumiram.
     */
    it('a segunda versao vai para outro caminho', async () => {
      const { upload, banco } = montar();
      await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      const { versao } = await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      expect(versao).toBe(2);
      const arquivo = banco.documentos.get(
        'pedidos/pedido-1/entregaveis/001',
      )?.['arquivoAtual'] as { caminho: string };
      expect(arquivo.caminho).toBe('entregaveis/pedido-1/001/v2');
    });

    /** Regra inviolavel 6: nasce longe de `limpo`. */
    it('nasce em pendente_upload', async () => {
      const { upload, banco } = montar();

      await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      const arquivo = banco.documentos.get(
        'pedidos/pedido-1/entregaveis/001',
      )?.['arquivoAtual'] as { estado: string };
      expect(arquivo.estado).toBe('pendente_upload');
    });
  });

  describe('confirmacao', () => {
    it('passa a pendente_scan e enfileira com o caminho certo', async () => {
      const { upload, banco, fila } = montar();
      await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      await upload.confirmarEnvio(ALVO, ADVOGADO);

      expect(
        banco.documentos.get('pedidos/pedido-1/entregaveis/001')?.[
          'arquivoAtual.estado'
        ],
      ).toBe('pendente_scan');
      expect(fila.tarefas).toEqual([
        {
          fluxo: 'entregavel-advogado',
          pedidoId: 'pedido-1',
          alvoId: '001',
          caminho: 'entregaveis/pedido-1/001/v1',
        },
      ]);
    });

    /**
     * So quem enviou confirma. Sem isto, outro advogado — ou uma requisicao
     * repetida fora de ordem — enfileiraria varredura de um objeto que talvez nem
     * exista.
     */
    it('so quem enviou confirma', async () => {
      const { upload } = montar();
      await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

      await expect(upload.confirmarEnvio(ALVO, OUTRO)).rejects.toThrow(
        ConflictException,
      );
    });

    it('recusa confirmar sem envio pendente', async () => {
      const { upload } = montar();

      await expect(upload.confirmarEnvio(ALVO, ADVOGADO)).rejects.toThrow(
        ConflictException,
      );
    });

    it('recusa entregavel inexistente', async () => {
      const { upload } = montar();

      await expect(
        upload.confirmarEnvio(
          { pedidoId: 'pedido-1', entregavelId: '999' },
          ADVOGADO,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /** O prefixo do entregavel nunca colide com o do anexo (arquitetura 6.2). */
  it('o caminho nunca cai sob o prefixo de anexos', async () => {
    const { upload, banco } = montar();

    await upload.pedirEnvio(ALVO, ADVOGADO, PDF);

    const arquivo = banco.documentos.get('pedidos/pedido-1/entregaveis/001')?.[
      'arquivoAtual'
    ] as { caminho: string };
    expect(arquivo.caminho.startsWith('anexos/')).toBe(false);
  });
});
