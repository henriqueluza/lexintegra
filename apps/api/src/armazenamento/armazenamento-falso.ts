import { Injectable } from '@nestjs/common';
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
 */
@Injectable()
export class ArmazenamentoFalso implements Armazenamento {
  private readonly objetos = new Map<string, Uint8Array>();

  /** Trilha das operacoes, para os testes afirmarem ORDEM — o mesmo papel de
   * `ordemDeEscrita` no `FirestoreFalso`. */
  readonly operacoes: string[] = [];

  urlDeEscrita(pedido: PedidoDeUrlDeEscrita): Promise<string> {
    const chave = chaveDe(pedido.objeto);
    this.operacoes.push(`escrita ${chave}`);
    return Promise.resolve(
      `https://falso.local/escrita/${chave}?tipo=${pedido.tipo}&max=${String(pedido.tamanhoMaximoBytes)}`,
    );
  }

  urlDeLeitura(pedido: PedidoDeUrlDeLeitura): Promise<string> {
    const chave = chaveDe(pedido.objeto);
    this.operacoes.push(`leitura ${chave}`);
    return Promise.resolve(
      `https://falso.local/leitura/${chave}?nome=${encodeURIComponent(pedido.nomeParaBaixar)}`,
    );
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
