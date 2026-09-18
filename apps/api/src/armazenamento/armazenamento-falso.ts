import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type {
  Armazenamento,
  Objeto,
  PedidoDeUrlDeEscrita,
  PedidoDeUrlDeLeitura,
} from './armazenamento.js';

/**
 * Armazenamento em memoria, para desenvolvimento e para os testes.
 *
 * MESMO PAPEL DO `EmailFalsoTransport` (ADR-07.1): sem ele, exercitar o fluxo de
 * upload exigiria bucket de verdade, e o projeto nao tem emulador de Cloud
 * Storage. Aqui, a suite de integracao roda o ciclo inteiro — pedido de URL,
 * confirmacao, veredito, movimentacao, exclusao — sem tocar a rede.
 *
 * O QUE ELE IMITA: a existencia do objeto, o conteudo, a movimentacao entre
 * baldes e a leitura de faixa. O QUE NAO IMITA: assinatura de URL de verdade
 * (as URLs sao textos reconheciveis), expiracao, e as recusas que o proprio
 * Cloud Storage faz por tipo e tamanho assinados. Essas so aparecem contra o
 * servico real.
 *
 * DESDE A ETAPA 12 ELE PODE OUVIR HTTP (`ouvirEm`), e isso destravou o upload em
 * desenvolvimento. Ate aqui a URL devolvida era `https://falso.local/...`: o
 * navegador nao alcanca esse endereco, entao `pnpm dev` aceitava o pedido de URL
 * e falhava no envio — sem erro do lado do servidor, porque o servidor nunca
 * ficava sabendo. Com o ouvinte, o PUT do navegador escreve na mesma memoria que
 * a varredura le, e a jornada de arquivo passa a existir fora de producao.
 *
 * O PREFIXO `/armazenamento-falso` E RELATIVO e casa com a entrada de
 * `apps/web/proxy.conf.json`: assim o PUT sai na mesma origem do `ng serve` e nao
 * ha CORS no caminho. Mudar um dos dois sem o outro quebra o upload local, e o
 * sintoma e um PUT 404 que nao parece ter nada a ver com proxy.
 */
const PREFIXO_LOCAL = '/armazenamento-falso';

@Injectable()
export class ArmazenamentoFalso implements Armazenamento, OnModuleDestroy {
  private readonly objetos = new Map<string, Uint8Array>();
  private ouvinte: Server | null = null;

  /** Trilha das operacoes, para os testes afirmarem ORDEM — o mesmo papel de
   * `ordemDeEscrita` no `FirestoreFalso`. */
  readonly operacoes: string[] = [];

  urlDeEscrita(pedido: PedidoDeUrlDeEscrita): Promise<string> {
    const chave = chaveDe(pedido.objeto);
    this.operacoes.push(`escrita ${chave}`);
    return Promise.resolve(
      `${this.base()}/escrita/${chave}?tipo=${pedido.tipo}&max=${String(pedido.tamanhoMaximoBytes)}`,
    );
  }

  urlDeLeitura(pedido: PedidoDeUrlDeLeitura): Promise<string> {
    const chave = chaveDe(pedido.objeto);
    this.operacoes.push(`leitura ${chave}`);
    return Promise.resolve(
      `${this.base()}/leitura/${chave}?nome=${encodeURIComponent(pedido.nomeParaBaixar)}`,
    );
  }

  /**
   * Sobe o ouvinte local. So fora de producao, e so em 127.0.0.1.
   *
   * A fabrica ja recusa o armazenamento falso em producao; a guarda aqui e a
   * segunda tranca, porque o que este ouvinte faz — aceitar escrita sem
   * autenticacao nenhuma — nao pode depender de uma condicao so.
   */
  ouvirEm(porta: number): void {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        'O armazenamento falso nao ouve HTTP em producao. Configure os buckets.',
      );
    }
    if (this.ouvinte !== null) return;

    this.ouvinte = createServer((requisicao, resposta) => {
      this.atender(requisicao, resposta);
    });

    this.ouvinte.listen(porta, '127.0.0.1', () => {
      new Logger('Armazenamento').warn(
        `Armazenamento falso ouvindo em 127.0.0.1:${String(porta)} — ` +
          'upload de desenvolvimento, sem autenticacao e em memoria.',
      );
    });
  }

  onModuleDestroy(): void {
    this.ouvinte?.close();
    this.ouvinte = null;
  }

  private base(): string {
    return this.ouvinte === null ? 'https://falso.local' : PREFIXO_LOCAL;
  }

  /** PUT escreve, GET le. Sem lista, sem exclusao: o que a tela precisa e so isso. */
  private atender(
    requisicao: IncomingMessage,
    resposta: ServerResponse<IncomingMessage>,
  ): void {
    const caminho = decodeURIComponent((requisicao.url ?? '').split('?')[0]);

    /*
     * O PREFIXO DO PROXY VEM JUNTO. O `ng serve` encaminha o caminho COMPLETO —
     * `/armazenamento-falso/escrita/...` —, e nao so o que vem depois do
     * prefixo. Recortar apenas `^/escrita/` gravava o objeto sob uma chave
     * diferente da que a varredura le depois: o PUT respondia 200, a
     * confirmacao respondia 202, e o arquivo ficava `pendente_scan` para sempre
     * sem erro em lugar nenhum. Quem pegou isso foi a jornada de arquivos.
     */
    const chave = caminho.replace(/^.*?\/(escrita|leitura)\//, '');

    if (requisicao.method === 'PUT') {
      const partes: Buffer[] = [];
      requisicao.on('data', (parte: Buffer) => partes.push(parte));
      requisicao.on('end', () => {
        this.objetos.set(chave, new Uint8Array(Buffer.concat(partes)));
        resposta.writeHead(200).end();
      });
      return;
    }

    const conteudo = this.objetos.get(chave);
    if (conteudo === undefined) {
      resposta.writeHead(404).end();
      return;
    }

    resposta
      .writeHead(200, { 'content-type': 'application/octet-stream' })
      .end(Buffer.from(conteudo));
  }

  lerPrimeirosBytes(objeto: Objeto, quantidade: number): Promise<Uint8Array> {
    const conteudo = this.objetos.get(chaveDe(objeto));
    if (conteudo === undefined) {
      return Promise.reject(new Error(`Objeto ausente: ${chaveDe(objeto)}`));
    }
    return Promise.resolve(conteudo.slice(0, quantidade));
  }

  mover(origem: Objeto, destino: Objeto): Promise<void> {
    const conteudo = this.objetos.get(chaveDe(origem));
    if (conteudo === undefined) {
      return Promise.reject(new Error(`Objeto ausente: ${chaveDe(origem)}`));
    }

    this.operacoes.push(`mover ${chaveDe(origem)} -> ${chaveDe(destino)}`);
    this.objetos.set(chaveDe(destino), conteudo);
    this.objetos.delete(chaveDe(origem));
    return Promise.resolve();
  }

  excluir(objeto: Objeto): Promise<void> {
    this.operacoes.push(`excluir ${chaveDe(objeto)}`);
    this.objetos.delete(chaveDe(objeto));
    return Promise.resolve();
  }

  existe(objeto: Objeto): Promise<boolean> {
    return Promise.resolve(this.objetos.has(chaveDe(objeto)));
  }

  /* -------- arnes de teste: simula o que o navegador teria enviado -------- */

  semear(objeto: Objeto, conteudo: Uint8Array): void {
    this.objetos.set(chaveDe(objeto), conteudo);
  }

  get caminhos(): string[] {
    return [...this.objetos.keys()].sort();
  }
}

function chaveDe(objeto: Objeto): string {
  return `${objeto.balde}:${objeto.caminho}`;
}
