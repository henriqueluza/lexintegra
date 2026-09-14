import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { TETO_ITENS_CARRINHO } from 'shared/carrinho';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';

/** Mesmo prefixo da liberacao do pre-cadastro. */
export const CHAVE_CARRINHO = 'lexintegra:carrinho';

/**
 * O que o carrinho lembra de cada item.
 *
 * NOME E PRECO SAO SO PARA A TELA. O preco que vale e o que o servidor congela no
 * checkout (regra inviolavel 5): o navegador pode ter guardado um valor de ontem,
 * e `localStorage` e editavel por quem quiser. Guardar os dois aqui evita uma ida a
 * API so para desenhar o resumo — e a home nao chama a API a toa (regra 10).
 */
export type ItemGuardado = {
  readonly produtoId: string;
  readonly nome: string;
  readonly precoCentavos: number;
};

interface CarrinhoGuardado {
  /**
   * Identifica ESTE carrinho perante o servidor, e nao a pessoa.
   *
   * O checkout usa a chave para reconhecer a retentativa do mesmo carrinho e
   * devolver a cobranca ja criada em vez de abrir outra. Ela nasce no primeiro
   * item e so muda quando o carrinho e esvaziado — a compra seguinte e outra
   * compra.
   */
  readonly chave: string;
  readonly itens: readonly ItemGuardado[];
}

/**
 * O carrinho do lado do navegador (Etapa 8).
 *
 * NAO CHAMA A API. So existe depois de a vitrine abrir, e mesmo assim guarda tudo
 * localmente: quem monta o carrinho ainda nao decidiu comprar, e cada requisicao a
 * mais e cold start do Cloud Run pago por quem so esta olhando (regra 10).
 *
 * `localStorage` pela mesma razao do pre-cadastro: o carrinho sobrevive a fechar a
 * aba, que e o comportamento esperado de quem compara servicos com calma. E a
 * leitura acontece DEPOIS da hidratacao, pela mesma razao tambem — a pagina e
 * pre-renderizada em Node, onde o armazenamento nao existe.
 */
@Injectable({ providedIn: 'root' })
export class CarrinhoService {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly estado = signal<CarrinhoGuardado | null>(null);

  readonly itens = computed(() => this.estado()?.itens ?? []);
  readonly quantidade = computed(() => this.itens().length);
  readonly cheio = computed(() => this.quantidade() >= TETO_ITENS_CARRINHO);
  readonly totalIndicativoCentavos = computed(() =>
    this.itens().reduce((soma, item) => soma + item.precoCentavos, 0),
  );

  constructor() {
    afterNextRender(() => this.estado.set(this.ler()));
  }

  /**
   * A chave do carrinho corrente, ou `null` com o carrinho vazio. O checkout so a
   * pede com item no carrinho, e um carrinho vazio nao tem o que identificar.
   */
  chave(): string | null {
    return this.estado()?.chave ?? null;
  }

  /** Devolve `false` quando o teto ja foi atingido e nada foi acrescentado. */
  adicionar(produto: ProdutoVitrine): boolean {
    if (this.cheio()) return false;

    const atual = this.estado();
    this.salvar({
      chave: atual?.chave ?? novaChave(),
      itens: [
        ...(atual?.itens ?? []),
        {
          produtoId: produto.id,
          nome: produto.nome,
          precoCentavos: produto.precoCentavos,
        },
      ],
    });
    return true;
  }

  /** Por POSICAO, e nao por produto: dois itens iguais sao dois pedidos. */
  remover(indice: number): void {
    const atual = this.estado();
    if (atual === null) return;

    const itens = atual.itens.filter((_item, posicao) => posicao !== indice);
    if (itens.length === 0) {
      this.esvaziar();
      return;
    }
    this.salvar({ chave: atual.chave, itens });
  }

  /** Depois do pagamento, ou quando a pessoa tira o ultimo item. A chave morre junto. */
  esvaziar(): void {
    this.estado.set(null);
    if (!this.navegador) return;
    try {
      localStorage.removeItem(CHAVE_CARRINHO);
    } catch {
      /* Armazenamento bloqueado: o carrinho some no recarregamento de qualquer jeito. */
    }
  }

  private salvar(carrinho: CarrinhoGuardado): void {
    this.estado.set(carrinho);
    if (!this.navegador) return;
    try {
      localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
    } catch {
      /*
       * Cota estourada ou navegacao privada. O carrinho vale para esta visita — o
       * sinal ja foi atualizado — e nao sobrevive ao recarregamento.
       */
    }
  }

  private ler(): CarrinhoGuardado | null {
    if (!this.navegador) return null;

    let bruto: string | null;
    try {
      bruto = localStorage.getItem(CHAVE_CARRINHO);
    } catch {
      return null;
    }
    return bruto === null ? null : analisar(bruto);
  }
}

/**
 * Le e valida item a item. Um item malformado DESCARTA o carrinho inteiro, em vez
 * de ser pulado: um carrinho guardado por outra versao da pagina, com um item a
 * menos em silencio, levaria a pessoa a pagar por uma lista diferente da que ela
 * montou.
 */
function analisar(bruto: string): CarrinhoGuardado | null {
  try {
    const objeto = JSON.parse(bruto) as Partial<CarrinhoGuardado>;
    if (typeof objeto.chave !== 'string' || objeto.chave === '') return null;
    if (!Array.isArray(objeto.itens) || objeto.itens.length === 0) return null;

    const itens = objeto.itens.slice(0, TETO_ITENS_CARRINHO);
    return itens.every(ehItem) ? { chave: objeto.chave, itens } : null;
  } catch {
    return null;
  }
}

function ehItem(valor: unknown): valor is ItemGuardado {
  if (typeof valor !== 'object' || valor === null) return false;
  const item = valor as Record<string, unknown>;
  return (
    typeof item['produtoId'] === 'string' &&
    item['produtoId'] !== '' &&
    typeof item['nome'] === 'string' &&
    typeof item['precoCentavos'] === 'number' &&
    Number.isInteger(item['precoCentavos'])
  );
}

/** `crypto.randomUUID` existe em todo navegador suportado e no jsdom dos testes. */
function novaChave(): string {
  return crypto.randomUUID();
}
