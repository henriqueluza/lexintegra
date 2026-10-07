import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import {
  agruparEntregaveis,
  rotuloDoEntregavel,
} from '../../../comum/agrupar-entregaveis';
import { paraReais } from '../../../comum/moeda';
import { CarrinhoService } from '../../../publico/carrinho.service';
import { CatalogoService } from '../../../publico/catalogo.service';
import { Botao } from '../../../ui/botao/botao';
import { Carregando } from '../../../ui/carregando/carregando';
import { EstadoVazio } from '../../../ui/estado-vazio/estado-vazio';
import { Icone } from '../../../ui/icone/icone';
import { LinkAcao } from '../../../ui/link-acao/link-acao';
import { MensagemErro } from '../../../ui/mensagem-erro/mensagem-erro';
import { TEXTOS } from '../textos';

/**
 * A vitrine de servicos, travada ate o pre-cadastro (item 2.1.3) — ou ate a
 * sessao de quem ja tem conta, em qualquer perfil (05/10/2026, `CatalogoService`).
 *
 * A BUSCA SO ACONTECE DEPOIS DA LIBERACAO. Enquanto `liberado()` for falso nao ha
 * requisicao nenhuma — nem para contar quantos servicos existem, nem para
 * pre-carregar. E a regra inviolavel 10: a pagina publica nao toca a API antes do
 * pre-cadastro, porque com `min-instances = 0` a primeira chamada custa de um a
 * tres segundos de cold start, e a pessoa ainda nao decidiu ficar.
 *
 * O estado travado NAO E UM ESPACO VAZIO. Sao cartoes borrados atras do aviso de
 * cadeado: mostram que existe um catalogo do outro lado, sem mostrar o catalogo.
 * Eles sao `aria-hidden` porque nao ha nada ali para ler — quem usa leitor de tela
 * recebe o aviso e o botao, que e a informacao inteira.
 *
 * O CARRINHO (Etapa 8) mora aqui porque so existe com a vitrine aberta, e nao
 * chama a API: e estado do navegador ate o checkout.
 */
@Component({
  selector: 'app-servicos',
  imports: [Botao, Carregando, EstadoVazio, Icone, LinkAcao, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicos.html',
  styleUrl: './servicos.css',
})
export class Servicos {
  private readonly catalogo = inject(CatalogoService);
  protected readonly carrinho = inject(CarrinhoService);

  protected readonly textos = TEXTOS;
  protected readonly liberado = this.catalogo.liberado;
  protected readonly carregando = signal(false);
  protected readonly falhou = signal(false);
  protected readonly produtos = signal<readonly ProdutoVitrine[] | null>(null);

  /**
   * A trava do efeito, e ela e SEPARADA de "tem produtos".
   *
   * A primeira versao usava `produtos() === null` como condicao, e isso produzia
   * um laco infinito na falha: sem produtos e sem carregar, o efeito disparava de
   * novo, para sempre — requisicoes em rajada contra o Cloud Run vindas de uma
   * tela parada. Quem tenta de novo depois de uma falha e a pessoa, no botao.
   */
  /** Busca local, sobre o que ja veio: nenhuma chamada nova por tecla. */
  protected readonly busca = signal('');
  protected readonly filtrados = computed(() => {
    const termo = normalizar(this.busca().trim());
    const todos = this.produtos() ?? [];
    if (termo === '') return todos;
    return todos.filter((produto) =>
      normalizar(`${produto.nome} ${produto.descricao}`).includes(termo),
    );
  });

  private readonly tentado = signal(false);

  constructor() {
    /*
     * Dispara uma vez, quando a liberacao chega — pelo envio do formulario ou
     * pela restauracao do armazenamento depois da hidratacao.
     */
    effect(() => {
      if (this.liberado() && !this.tentado()) void this.buscar();
    });
  }

  protected preco(centavos: number): string {
    return paraReais(centavos);
  }

  /** "Contrato personalizado 24×" no lugar de vinte e quatro linhas iguais. */
  protected entregaveis(produto: ProdutoVitrine): string[] {
    return agruparEntregaveis(produto.entregaveis).map(rotuloDoEntregavel);
  }

  protected adicionar(produto: ProdutoVitrine): void {
    this.carrinho.adicionar(produto);
  }

  protected async buscar(): Promise<void> {
    this.tentado.set(true);
    this.carregando.set(true);
    this.falhou.set(false);

    try {
      this.produtos.set(await this.catalogo.listar());
    } catch {
      /*
       * A causa nao vai para a tela. Um 401 aqui significa token vencido, e a
       * mensagem util e a mesma de uma falha de rede: tente de novo. Distinguir os
       * casos so daria a quem sonda um mapa dos estados do servidor.
       */
      this.falhou.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}

/** Minusculas e sem acento: "revisao" encontra "Revisão". */
function normalizar(texto: string): string {
  return texto
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
