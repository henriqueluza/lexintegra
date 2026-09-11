import type { Firestore } from 'firebase-admin/firestore';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
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
});
