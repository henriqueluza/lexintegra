import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { TIPO_DOCX } from 'shared';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { DOCX, TIPOS_DOCM, zip } from '../arnes-docx.js';
import { FirestoreFalso } from '../firestore-falso.js';
import type { TarefaDeVarredura } from './fila.js';
import { ScannerFalso } from './scanner.js';
import { VarreduraService } from './varredura.service.js';

/** Cabecalhos de verdade. NAO ha EICAR aqui — ver a nota em `scanner.ts`. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50]);

const TAREFA_ANEXO: TarefaDeVarredura = {
  fluxo: 'anexo-cliente',
  pedidoId: 'pedido-1',
  alvoId: 'anexo-1',
  caminho: 'anexos/pedido-1/anexo-1',
};

const TAREFA_ENTREGAVEL: TarefaDeVarredura = {
  fluxo: 'entregavel-advogado',
  pedidoId: 'pedido-1',
  alvoId: '001',
  caminho: 'entregaveis/pedido-1/001/v1',
};

interface Arranjo {
  banco: FirestoreFalso;
  armazenamento: ArmazenamentoFalso;
  scanner: ScannerFalso;
  varredura: VarreduraService;
}

function montar(conteudo: Uint8Array = PDF, tipo = 'application/pdf'): Arranjo {
  const banco = new FirestoreFalso();

  banco.documentos.set('pedidos/pedido-1/anexos/anexo-1', {
    nome: 'doc.pdf',
    tipo,
    tamanhoBytes: 100,
    estado: 'pendente_scan',
    fluxo: 'anexo-cliente',
    caminho: TAREFA_ANEXO.caminho,
    enviadoPor: 'uid-clara',
    criadoEm: 1,
  });

  banco.documentos.set('pedidos/pedido-1/entregaveis/001', {
    nome: 'Parecer',
    ordem: 1,
    estado: 'em_elaboracao',
    revisoesUsadas: 0,
    transicoes: 1,
    arquivoAtual: {
      nome: 'parecer.pdf',
      tipo,
      tamanhoBytes: 100,
      versao: 1,
      estado: 'pendente_scan',
      caminho: TAREFA_ENTREGAVEL.caminho,
      enviadoPor: 'uid-ana',
      enviadoEm: 1,
    },
  });

  const armazenamento = new ArmazenamentoFalso();
  armazenamento.semear(
    { balde: 'quarentena', caminho: TAREFA_ANEXO.caminho },
    conteudo,
  );
  armazenamento.semear(
    { balde: 'quarentena', caminho: TAREFA_ENTREGAVEL.caminho },
    conteudo,
  );

  const scanner = new ScannerFalso();

  return {
    banco,
    armazenamento,
    scanner,
    varredura: new VarreduraService(
      banco as unknown as Firestore,
      armazenamento,
      scanner,
    ),
  };
}

describe('VarreduraService', () => {
  describe('arquivo limpo', () => {
    it('move da quarentena para o balde de arquivos', async () => {
      const { varredura, armazenamento } = montar();

      expect(await varredura.processar(TAREFA_ANEXO)).toBe('limpo');

      expect(armazenamento.caminhos).toContain(
        `arquivos:${TAREFA_ANEXO.caminho}`,
      );
      expect(armazenamento.caminhos).not.toContain(
        `quarentena:${TAREFA_ANEXO.caminho}`,
      );
    });

    it('grava o estado no anexo', async () => {
      const { varredura, banco } = montar();

      await varredura.processar(TAREFA_ANEXO);

      expect(
        banco.documentos.get('pedidos/pedido-1/anexos/anexo-1')?.['estado'],
      ).toBe('limpo');
    });

    /**
     * A assimetria entre os fluxos: o anexo E o documento, e o entregavel guarda
     * o arquivo em `arquivoAtual`. Vem do ADR-11 — o entregavel e uma maquina de
     * estados que carrega um arquivo, nao um arquivo.
     */
    it('grava no caminho certo do entregavel', async () => {
      const { varredura, banco } = montar();

      await varredura.processar(TAREFA_ENTREGAVEL);

      expect(
        banco.documentos.get('pedidos/pedido-1/entregaveis/001')?.[
          'arquivoAtual.estado'
        ],
      ).toBe('limpo');
    });
  });

  describe('as DUAS conferencias', () => {
    /** O ClamAV responde "tem malware conhecido?". */
    it('infectado e descartado e nunca sai da quarentena', async () => {
      const { varredura, scanner, armazenamento } = montar();
      scanner.responderCom({ veredito: 'infectado', assinatura: 'Eicar-Test' });

      expect(await varredura.processar(TAREFA_ANEXO)).toBe('infectado');

      // Nao esta na quarentena E nao chegou ao balde de arquivos: descartado.
      expect(armazenamento.caminhos).not.toContain(
        `quarentena:${TAREFA_ANEXO.caminho}`,
      );
      expect(armazenamento.caminhos).not.toContain(
        `arquivos:${TAREFA_ANEXO.caminho}`,
      );
      expect(armazenamento.operacoes).toContain(
        `excluir quarentena:${TAREFA_ANEXO.caminho}`,
      );
    });

    /**
     * Os magic bytes respondem outra pergunta: "isto e mesmo um PDF?". Um HTML
     * com extensao `.pdf` passa LIMPO pelo antivirus — nao ha malware nele — e,
     * servido de um dominio que compartilhe cookie com a aplicacao, vira XSS na
     * propria origem (arquitetura 7.3). Nenhuma das duas conferencias cobre a
     * outra.
     */
    it('conteudo que nao bate com o tipo e rejeitado, mesmo limpo', async () => {
      const { varredura, armazenamento } = montar(HTML);

      expect(await varredura.processar(TAREFA_ANEXO)).toBe('rejeitado');

      expect(armazenamento.caminhos).not.toContain(
        `arquivos:${TAREFA_ANEXO.caminho}`,
      );
      expect(armazenamento.caminhos).not.toContain(
        `quarentena:${TAREFA_ANEXO.caminho}`,
      );
    });

    it('o motivo da recusa fica gravado', async () => {
      const { varredura, banco } = montar(HTML);

      await varredura.processar(TAREFA_ANEXO);

      expect(
        String(
          banco.documentos.get('pedidos/pedido-1/anexos/anexo-1')?.['motivo'],
        ),
      ).toContain('nao corresponde');
    });

    /** So os primeiros bytes sao lidos — nao o objeto inteiro. */
    it('le apenas o cabecalho do arquivo', async () => {
      const grande = new Uint8Array(1_000_000);
      grande.set(PDF);
      const { varredura, armazenamento } = montar(grande);

      await varredura.processar(TAREFA_ANEXO);

      // Se lesse tudo, o falso teria que devolver o objeto inteiro; a assercao
      // real e que a chamada pede uma quantidade pequena.
      expect(armazenamento.caminhos).toContain(
        `arquivos:${TAREFA_ANEXO.caminho}`,
      );
    });
  });

  /** B2, decisoes.md 3.1: o DOCX tem uma TERCEIRA conferencia, estrutural. */
  describe('o DOCX do advogado', () => {
    const DOCX_TIPO = TIPO_DOCX;

    it('DOCX de verdade e liberado', async () => {
      const { varredura } = montar(zip(DOCX), DOCX_TIPO);

      expect(await varredura.processar(TAREFA_ENTREGAVEL)).toBe('limpo');
    });

    /** Todo ZIP passa pelo magic bytes; o DOCM cai na estrutura. */
    it('DOCM disfarcado de DOCX e rejeitado com o motivo', async () => {
      const { varredura, banco } = montar(
        zip([{ nome: '[Content_Types].xml', conteudo: TIPOS_DOCM }, DOCX[1]]),
        DOCX_TIPO,
      );

      expect(await varredura.processar(TAREFA_ENTREGAVEL)).toBe('rejeitado');
      expect(
        String(
          banco.documentos.get('pedidos/pedido-1/entregaveis/001')?.[
            'arquivoAtual.motivo'
          ],
        ),
      ).toMatch(/macro/);
    });

    it('PDF declarado como DOCX nao passa nem do magic bytes', async () => {
      const { varredura } = montar(PDF, DOCX_TIPO);

      expect(await varredura.processar(TAREFA_ENTREGAVEL)).toBe('rejeitado');
    });
  });

  describe('falhas de infraestrutura', () => {
    /**
     * Scanner fora do ar LANCA, para o Cloud Tasks reentregar. Marcar como
     * reprovado apagaria um arquivo legitimo por indisponibilidade — e a
     * diferenca entre "nao consegui verificar" e "verifiquei e esta ruim" e
     * exatamente o que nao se pode confundir aqui.
     */
    it('scanner indisponivel lanca em vez de reprovar', async () => {
      const { varredura, scanner, armazenamento } = montar();
      scanner.responderCom({ veredito: 'indisponivel' });

      await expect(varredura.processar(TAREFA_ANEXO)).rejects.toThrow(
        /indisponivel/,
      );

      // O arquivo continua na quarentena, intacto.
      expect(armazenamento.caminhos).toContain(
        `quarentena:${TAREFA_ANEXO.caminho}`,
      );
    });

    /**
     * Objeto ausente NAO e erro: o Cloud Tasks reentrega, e uma tarefa repetida
     * chega depois de o arquivo ja ter sido movido. Tratar como falha faria a
     * fila insistir para sempre num trabalho ja feito.
     */
    it('tarefa repetida sobre objeto ja movido nao falha', async () => {
      const { varredura } = montar();
      await varredura.processar(TAREFA_ANEXO);

      await expect(varredura.processar(TAREFA_ANEXO)).resolves.toBe(
        'pendente_scan',
      );
    });

    it('registro sumido nao derruba a tarefa', async () => {
      const { banco, varredura } = montar();
      banco.documentos.delete('pedidos/pedido-1/anexos/anexo-1');

      await expect(varredura.processar(TAREFA_ANEXO)).resolves.toBe(
        'pendente_scan',
      );
    });
  });

  /**
   * Lote de novembro, ajuste 13: uma linha `arquivo.varrido` por arquivo que
   * recebeu veredito, com a duracao de cada fase (`medicao.ts`). A conta de cada
   * duracao tem teste proprio la; aqui o que se confere e QUANDO a linha sai, de
   * onde vem cada instante e o que ela nao pode carregar.
   */
  describe('medicao', () => {
    const ANEXO = 'pedidos/pedido-1/anexos/anexo-1';
    const ENTREGAVEL = 'pedidos/pedido-1/entregaveis/001';

    let espia: jest.SpiedFunction<Logger['log']>;

    function linhas(): Record<string, unknown>[] {
      return espia.mock.calls
        .map((chamada) => chamada[1] as Record<string, unknown> | undefined)
        .filter(
          (campos): campos is Record<string, unknown> =>
            campos?.['sinal'] === 'arquivo.varrido',
        );
    }

    /** Os instantes como o Firestore os devolve: `Timestamp`, e nao numero. */
    function comInstantes(banco: FirestoreFalso): void {
      banco.documentos.set(ANEXO, {
        ...banco.documentos.get(ANEXO),
        criadoEm: Timestamp.fromMillis(1_000),
        confirmadoEm: Timestamp.fromMillis(4_000),
      });
      const entregavel = banco.documentos.get(ENTREGAVEL) as {
        arquivoAtual: Record<string, unknown>;
      };
      banco.documentos.set(ENTREGAVEL, {
        ...entregavel,
        arquivoAtual: {
          ...entregavel.arquivoAtual,
          enviadoEm: Timestamp.fromMillis(2_000),
          confirmadoEm: Timestamp.fromMillis(7_000),
        },
      });
    }

    beforeEach(() => {
      espia = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      espia.mockRestore();
    });

    it('arquivo limpo: uma linha, com o fluxo, o veredito e o que o scanner mediu', async () => {
      const { banco, scanner, varredura } = montar();
      comInstantes(banco);
      scanner.responderCom({
        veredito: 'limpo',
        medidas: { frio: true, bootMs: 41_000, downloadMs: 180, clamMs: 95 },
      });

      await varredura.processar(TAREFA_ANEXO, 3);

      expect(linhas()).toHaveLength(1);
      expect(linhas()[0]).toMatchObject({
        sinal: 'arquivo.varrido',
        fluxo: 'anexo-cliente',
        veredito: 'limpo',
        tamanhoBytes: 100,
        tentativa: 3,
        envioMs: 3_000,
        scannerFrio: true,
        bootMs: 41_000,
        downloadMs: 180,
        clamMs: 95,
      });
      for (const fase of ['scannerMs', 'conferenciaMs', 'moverMs']) {
        expect(linhas()[0][fase]).toEqual(expect.any(Number));
      }
    });

    /** O campo de emissao tem nome diferente no entregavel (`enviadoEm`). */
    it('no entregavel, o envio conta de `enviadoEm` ate a confirmacao', async () => {
      const { banco, varredura } = montar();
      comInstantes(banco);

      await varredura.processar(TAREFA_ENTREGAVEL);

      expect(linhas()[0]).toMatchObject({
        fluxo: 'entregavel-advogado',
        envioMs: 5_000,
        tentativa: null,
      });
    });

    it('infectado tambem deixa linha, sem conferencia nem movimentacao', async () => {
      const { banco, scanner, varredura } = montar();
      comInstantes(banco);
      scanner.responderCom({ veredito: 'infectado', assinatura: 'Eicar-Test' });

      await varredura.processar(TAREFA_ANEXO);

      expect(linhas()).toHaveLength(1);
      expect(linhas()[0]).toMatchObject({
        veredito: 'infectado',
        envioMs: 3_000,
        conferenciaMs: null,
        moverMs: null,
      });
    });

    it('conteudo que nao bate com o tipo: linha de rejeitado, com a conferencia medida', async () => {
      const { varredura } = montar(HTML);

      await varredura.processar(TAREFA_ANEXO);

      expect(linhas()).toHaveLength(1);
      expect(linhas()[0]).toMatchObject({
        veredito: 'rejeitado',
        moverMs: null,
      });
      expect(linhas()[0]['conferenciaMs']).toEqual(expect.any(Number));
    });

    /** Nada foi migrado: arquivo anterior aos campos nao ganha duracao inventada. */
    it('arquivo sem os instantes novos: o que depende deles sai null', async () => {
      const { varredura } = montar();

      await varredura.processar(TAREFA_ANEXO);

      expect(linhas()[0]).toMatchObject({
        envioMs: null,
        filaMs: null,
        totalMs: null,
      });
    });

    /** Sem veredito, sem linha: a tentativa seguinte e que vai medir. */
    it('scanner indisponivel nao deixa linha', async () => {
      const { scanner, varredura } = montar();
      scanner.responderCom({ veredito: 'indisponivel' });

      await expect(varredura.processar(TAREFA_ANEXO)).rejects.toThrow();

      expect(linhas()).toEqual([]);
    });

    it('tarefa repetida sobre objeto ja movido nao deixa segunda linha', async () => {
      const { varredura } = montar();

      await varredura.processar(TAREFA_ANEXO);
      await varredura.processar(TAREFA_ANEXO);

      expect(linhas()).toHaveLength(1);
    });

    it('medidas estranhas do scanner viram null, e a varredura vale do mesmo jeito', async () => {
      const { scanner, varredura } = montar();
      scanner.responderCom({
        veredito: 'limpo',
        medidas: { clamMs: -5, downloadMs: Number.NaN } as never,
      });

      expect(await varredura.processar(TAREFA_ANEXO)).toBe('limpo');

      expect(linhas()[0]).toMatchObject({
        clamMs: null,
        downloadMs: null,
        scannerFrio: null,
      });
    });

    /** Nome de arquivo e dado pessoal, e o caminho identifica o pedido. */
    it('a linha nao leva nome de arquivo nem caminho', async () => {
      const { varredura } = montar();

      await varredura.processar(TAREFA_ANEXO);

      const texto = JSON.stringify(linhas()[0]);
      expect(texto).not.toContain('doc.pdf');
      expect(texto).not.toContain(TAREFA_ANEXO.caminho);
      expect(texto).not.toContain('pedido-1');
    });

    it('grava `varridoEm` junto do veredito, nos dois fluxos', async () => {
      const { banco, varredura } = montar();

      await varredura.processar(TAREFA_ANEXO);
      await varredura.processar(TAREFA_ENTREGAVEL);

      expect(banco.documentos.get(ANEXO)).toHaveProperty('varridoEm');
      /*
       * O dublê guarda o caminho pontuado como CHAVE, sem aninhar; o campo
       * aninhado de verdade e conferido contra o emulador, na integracao.
       */
      expect(banco.documentos.get(ENTREGAVEL)).toHaveProperty([
        'arquivoAtual.varridoEm',
      ]);
    });

    it('reprovado tambem ganha `varridoEm`', async () => {
      const { banco, scanner, varredura } = montar();
      scanner.responderCom({ veredito: 'infectado' });

      await varredura.processar(TAREFA_ANEXO);

      expect(banco.documentos.get(ANEXO)).toHaveProperty('varridoEm');
    });
  });
});
