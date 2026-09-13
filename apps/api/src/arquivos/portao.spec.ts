import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { ESTADOS_ARQUIVO, type EstadoArquivo } from 'shared';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FirestoreFalso } from '../firestore-falso.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { TermosService } from '../termos/termos.service.js';
import { EmissorDeLinkDeLeitura } from './leitura.js';
import { PortaoDeArquivos } from './portao.js';

const CLIENTE: QuemAcessa = { uid: 'uid-clara', perfil: 'cliente' };
const ADVOGADO: QuemAcessa = { uid: 'uid-ana', perfil: 'advogado' };
const INTRUSO: QuemAcessa = { uid: 'uid-bruno', perfil: 'cliente' };

interface Arranjo {
  banco: FirestoreFalso;
  armazenamento: ArmazenamentoFalso;
  termos: TermosService;
  portao: PortaoDeArquivos;
}

function montar(estado: EstadoArquivo = 'limpo', versao = 1): Arranjo {
  const banco = new FirestoreFalso();

  banco.documentos.set('pedidos/pedido-1', {
    clienteId: CLIENTE.uid,
    advogadoId: ADVOGADO.uid,
    distribuido: true,
  });

  banco.documentos.set('pedidos/pedido-1/entregaveis/001', {
    nome: 'Parecer',
    ordem: 1,
    estado: 'em_elaboracao',
    revisoesUsadas: 0,
    transicoes: 1,
    arquivoAtual: {
      nome: 'parecer.pdf',
      tipo: 'application/pdf',
      tamanhoBytes: 1000,
      versao,
      estado,
      caminho: 'entregaveis/pedido-1/001/v1',
      enviadoPor: ADVOGADO.uid,
      enviadoEm: 1,
    },
  });

  banco.documentos.set('pedidos/pedido-1/anexos/anexo-1', {
    nome: 'rg.jpg',
    tipo: 'image/jpeg',
    tamanhoBytes: 100,
    estado,
    fluxo: 'anexo-cliente',
    caminho: 'anexos/pedido-1/anexo-1',
    enviadoPor: CLIENTE.uid,
    criadoEm: 1,
  });

  const armazenamento = new ArmazenamentoFalso();
  const termos = new TermosService(banco as unknown as Firestore);

  return {
    banco,
    armazenamento,
    termos,
    portao: new PortaoDeArquivos(
      banco as unknown as Firestore,
      new AcessoPedidoService(banco as unknown as Firestore),
      termos,
      new EmissorDeLinkDeLeitura(armazenamento),
    ),
  };
}

const ALVO = { pedidoId: 'pedido-1', entregavelId: '001' };

async function aceitar(termos: TermosService, versao = 1): Promise<void> {
  await termos.registrar({
    usuarioUid: CLIENTE.uid,
    pedidoId: 'pedido-1',
    entregavelId: '001',
    versaoArquivo: versao,
  });
}

describe('PortaoDeArquivos', () => {
  /* ====================================================================== */
  /* O CRITERIO DE ACEITE DA ETAPA 11                                        */
  /* ====================================================================== */

  /**
   * "Nenhum caminho de codigo serve arquivo com status diferente de limpo."
   *
   * A tabela roda TODOS os estados, e nao uma amostra: um estado novo que alguem
   * acrescente a `ESTADOS_ARQUIVO` entra aqui automaticamente, e se ele for
   * servivel por acidente, este teste falha.
   */
  describe('nada e servido fora de `limpo`', () => {
    it.each(ESTADOS_ARQUIVO.filter((e) => e !== 'limpo'))(
      'recusa o entregavel em %s',
      async (estado) => {
        const { portao, termos } = montar(estado);
        await aceitar(termos);

        await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow(
          ConflictException,
        );
      },
    );

    it.each(ESTADOS_ARQUIVO.filter((e) => e !== 'limpo'))(
      'recusa o anexo em %s',
      async (estado) => {
        const { portao } = montar(estado);

        await expect(
          portao.linkDoAnexo(
            { pedidoId: 'pedido-1', anexoId: 'anexo-1' },
            CLIENTE,
          ),
        ).rejects.toThrow(ConflictException);
      },
    );

    /** E nenhuma URL e emitida no caminho da recusa — nem "por engano". */
    it('nao chama o armazenamento quando recusa', async () => {
      const { portao, termos, armazenamento } = montar('pendente_scan');
      await aceitar(termos);

      await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow();

      expect(armazenamento.operacoes).toEqual([]);
    });

    /**
     * A mensagem nao diz QUAL estado. Para quem esta do outro lado, "infectado" e
     * "ainda nao varrido" sao a mesma resposta — a diferenca entre as duas
     * informa sobre o conteudo de um arquivo que a pessoa nao deveria alcancar.
     */
    it('a recusa nao revela o estado', async () => {
      const { portao, termos } = montar('infectado');
      await aceitar(termos);

      await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow(
        /ainda nao esta disponivel/,
      );
    });
  });

  /* ====================================================================== */
  /* O gate de termos                                                        */
  /* ====================================================================== */

  describe('gate de aceite dos termos', () => {
    it('recusa o download sem aceite registrado', async () => {
      const { portao } = montar('limpo');

      await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('libera depois do aceite', async () => {
      const { portao, termos } = montar('limpo');
      await aceitar(termos);

      const { url, validoPorSegundos } = await portao.linkDoEntregavel(
        ALVO,
        CLIENTE,
      );

      expect(url).toContain('leitura');
      expect(validoPorSegundos).toBeGreaterThan(0);
    });

    /**
     * O ACEITE E POR VERSAO DO ARQUIVO. Cada upload do advogado produz uma versao
     * nova, potencialmente com conteudo diferente — reaproveitar o aceite da
     * anterior faria a evidencia de conformidade apontar para um arquivo que o
     * cliente nunca viu.
     */
    it('o aceite da versao 1 nao vale para a versao 2', async () => {
      const { portao, termos } = montar('limpo', 2);
      await aceitar(termos, 1);

      await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow(
        ForbiddenException,
      );

      await aceitar(termos, 2);
      await expect(
        portao.linkDoEntregavel(ALVO, CLIENTE),
      ).resolves.toBeDefined();
    });

    /** O aceite e de QUEM baixa: o do cliente nao libera o advogado. */
    it('o aceite e por usuario', async () => {
      const { portao, termos } = montar('limpo');
      await aceitar(termos);

      await expect(portao.linkDoEntregavel(ALVO, ADVOGADO)).rejects.toThrow(
        ForbiddenException,
      );
    });

    /**
     * O ANEXO NAO TEM GATE, e a assimetria e da arquitetura 7.3: o gate existe
     * "antes de baixar um entregavel". Exigir que o cliente aceite termos para
     * rebaixar o proprio RG seria cerimonia sem conformidade por tras.
     */
    it('o anexo do proprio cliente nao exige aceite', async () => {
      const { portao } = montar('limpo');

      await expect(
        portao.linkDoAnexo(
          { pedidoId: 'pedido-1', anexoId: 'anexo-1' },
          CLIENTE,
        ),
      ).resolves.toBeDefined();
    });
  });

  /* ====================================================================== */
  /* Acesso ao pedido                                                        */
  /* ====================================================================== */

  describe('acesso ao pedido', () => {
    it('quem nao alcanca o pedido nao baixa nada', async () => {
      const { portao, termos } = montar('limpo');
      await aceitar(termos);

      await expect(portao.linkDoEntregavel(ALVO, INTRUSO)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        portao.linkDoAnexo(
          { pedidoId: 'pedido-1', anexoId: 'anexo-1' },
          INTRUSO,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('entregavel sem arquivo nenhum responde 404', async () => {
      const { banco, portao } = montar('limpo');
      banco.documentos.set('pedidos/pedido-1/entregaveis/001', {
        nome: 'Parecer',
        ordem: 1,
        estado: 'solicitado',
        revisoesUsadas: 0,
        transicoes: 1,
        arquivoAtual: null,
      });

      await expect(portao.linkDoEntregavel(ALVO, CLIENTE)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('anexo inexistente responde 404', async () => {
      const { portao } = montar('limpo');

      await expect(
        portao.linkDoAnexo(
          { pedidoId: 'pedido-1', anexoId: 'nao-existe' },
          CLIENTE,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /** O link vale minutos, nao horas: e credencial, e link longo vaza por
   * historico, log de proxy e mensagem encaminhada. */
  it('o link e de curta duracao', async () => {
    const { portao, termos } = montar('limpo');
    await aceitar(termos);

    const { validoPorSegundos } = await portao.linkDoEntregavel(ALVO, CLIENTE);

    expect(validoPorSegundos).toBeLessThanOrEqual(600);
  });
});
