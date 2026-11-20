import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  cabecalhosDaEscrita,
  type Armazenamento,
  type Balde,
  type Objeto,
  type PedidoDeUrlDeEscrita,
  type PedidoDeUrlDeLeitura,
  type UrlDeEscrita,
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
 * baldes, a leitura de faixa e — desde 19/11/2026 — AS RECUSAS DO `PUT`: o
 * ouvinte so aceita escrita numa URL que ele emitiu, com os cabecalhos
 * assinados iguais e o tamanho dentro da faixa. O QUE NAO IMITA: assinatura de
 * URL de verdade (as URLs sao textos reconheciveis) e expiracao.
 *
 * POR QUE AS RECUSAS ENTRARAM. O falso aceitava qualquer `PUT`, e foi assim que
 * um envio que nunca funcionou em producao passou por todas as jornadas: o
 * navegador nao mandava o cabecalho de tamanho que a URL real exige (ver
 * `UrlDeEscrita`). Um falso mais generoso que o real esconde defeito — a mesma
 * licao do gateway falso com o travessao.
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
  /** O que cada URL de escrita emitida exige do `PUT`, por chave do objeto. */
  private readonly escritas = new Map<
    string,
    Readonly<Record<string, string>>
  >();
  private ouvinte: Server | null = null;

  /** Trilha das operacoes, para os testes afirmarem ORDEM — o mesmo papel de
   * `ordemDeEscrita` no `FirestoreFalso`. */
  readonly operacoes: string[] = [];

  listar(balde: Balde, prefixo: string, limite: number): Promise<string[]> {
    const inicio = `${balde}:${prefixo}`;
    return Promise.resolve(
      this.caminhos
        .filter((c) => c.startsWith(inicio))
        .slice(0, limite)
        .map((c) => c.slice(balde.length + 1)),
    );
  }

  urlDeEscrita(pedido: PedidoDeUrlDeEscrita): Promise<UrlDeEscrita> {
    const chave = chaveDe(pedido.objeto);
    const cabecalhos = cabecalhosDaEscrita(pedido);
    this.operacoes.push(`escrita ${chave}`);
    this.escritas.set(chave, cabecalhos);
    return Promise.resolve({
      url: `${this.base()}/escrita/${chave}?tipo=${pedido.tipo}&max=${String(pedido.tamanhoMaximoBytes)}`,
      cabecalhos,
    });
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
        const conteudo = new Uint8Array(Buffer.concat(partes));
        const recusa = this.recusaDaEscrita(
          chave,
          requisicao.headers,
          conteudo.byteLength,
        );
        if (recusa !== null) {
          resposta.writeHead(recusa.status).end(recusa.motivo);
          return;
        }
        this.objetos.set(chave, conteudo);
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

  /**
   * Por que o Cloud Storage recusaria este `PUT`, ou `null` se aceitaria.
   *
   * Tres recusas, as do servico real:
   *
   * - 403 para URL que ninguem emitiu (la, assinatura invalida);
   * - 400 quando um cabecalho ASSINADO nao veio, ou veio com outro valor (la,
   *   `MalformedSecurityHeader` ou `SignatureDoesNotMatch`). E o caso que
   *   derrubou o envio em producao;
   * - 400 quando o corpo esta fora da faixa de `x-goog-content-length-range`
   *   (la, `EntityTooSmall` e `EntityTooLarge`).
   */
  private recusaDaEscrita(
    chave: string,
    recebidos: IncomingMessage['headers'],
    tamanho: number,
  ): { status: number; motivo: string } | null {
    const assinados = this.escritas.get(chave);
    if (assinados === undefined) {
      return { status: 403, motivo: 'URL de escrita nao emitida.' };
    }

    for (const [nome, valor] of Object.entries(assinados)) {
      if (recebidos[nome.toLowerCase()] !== valor) {
        return {
          status: 400,
          motivo: `MalformedSecurityHeader: ${nome} foi assinado e nao veio igual no PUT.`,
        };
      }
    }

    const [minimo, maximo] = (assinados['x-goog-content-length-range'] ?? '')
      .split(',')
      .map(Number);
    if (
      minimo !== undefined &&
      maximo !== undefined &&
      (tamanho < minimo || tamanho > maximo)
    ) {
      return {
        status: 400,
        motivo: tamanho < minimo ? 'EntityTooSmall' : 'EntityTooLarge',
      };
    }

    return null;
  }

  lerPrimeirosBytes(objeto: Objeto, quantidade: number): Promise<Uint8Array> {
    const conteudo = this.objetos.get(chaveDe(objeto));
    if (conteudo === undefined) {
      return Promise.reject(new Error(`Objeto ausente: ${chaveDe(objeto)}`));
    }
    return Promise.resolve(conteudo.slice(0, quantidade));
  }

  lerFaixa(
    objeto: Objeto,
    inicio: number,
    quantidade: number,
  ): Promise<Uint8Array> {
    const conteudo = this.objetos.get(chaveDe(objeto));
    if (conteudo === undefined) {
      return Promise.reject(new Error(`Objeto ausente: ${chaveDe(objeto)}`));
    }
    return Promise.resolve(conteudo.slice(inicio, inicio + quantidade));
  }

  tamanho(objeto: Objeto): Promise<number> {
    const conteudo = this.objetos.get(chaveDe(objeto));
    if (conteudo === undefined) {
      return Promise.reject(new Error(`Objeto ausente: ${chaveDe(objeto)}`));
    }
    return Promise.resolve(conteudo.length);
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
