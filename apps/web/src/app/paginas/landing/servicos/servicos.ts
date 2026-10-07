import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  afterNextRender,
  afterRenderEffect,
  DestroyRef,
  ElementRef,
} from '@angular/core';
import type { ProdutoVitrine } from 'shared/esquemas/vitrine';
import { paraReais } from '../../../comum/moeda';
import { CarrinhoService } from '../../../publico/carrinho.service';
import { CatalogoService } from '../../../publico/catalogo.service';
import { Botao } from '../../../ui/botao/botao';
import { EstadoVazio } from '../../../ui/estado-vazio/estado-vazio';
import { Icone } from '../../../ui/icone/icone';
import { LinkAcao } from '../../../ui/link-acao/link-acao';
import { MensagemErro } from '../../../ui/mensagem-erro/mensagem-erro';
import { apresentar, normalizar } from './apresentacao';
import { TransicaoBusca } from './transicao-busca';
import { MovimentoCatalogo } from './movimento-catalogo';
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
  imports: [Botao, EstadoVazio, Icone, LinkAcao, MensagemErro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './servicos.html',
  styleUrls: ['./servicos.css', './servicos-movimento.css'],
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
  private readonly termoAplicado = signal('');
  private readonly transicaoBusca = new TransicaoBusca();
  private readonly elemento = inject(ElementRef<HTMLElement>);
  protected readonly fichas = computed(() =>
    (this.produtos() ?? []).map(apresentar),
  );
  protected readonly filtrados = computed(() => {
    const termo = normalizar(this.termoAplicado().trim());
    return this.fichas().filter((ficha) => ficha.busca.includes(termo));
  });
  protected readonly abertos = signal<ReadonlySet<string>>(new Set());
  protected readonly aviso = signal<{ nome: string; indice: number } | null>(
    null,
  );
  protected readonly descricoesLongas = signal<ReadonlySet<string>>(new Set());
  private movimento?: MovimentoCatalogo;

  private medirDescricoes(raiz: HTMLElement): void {
    const ids = new Set(this.descricoesLongas());
    for (const ficha of this.filtrados()) {
      if (this.abertos().has(ficha.produto.id)) continue;
      const corpo = raiz.ownerDocument.getElementById(
        'detalhes-' + ficha.produto.id,
      );
      const descricao = corpo?.querySelector<HTMLElement>(
        '.produto__descricao',
      );
      if (descricao && descricao.scrollHeight > descricao.clientHeight + 1)
        ids.add(ficha.produto.id);
      else ids.delete(ficha.produto.id);
    }
    const atual = this.descricoesLongas();
    if (ids.size !== atual.size || [...ids].some((id) => !atual.has(id)))
      this.descricoesLongas.set(ids);
  }

  protected pesquisar(termo: string): void {
    this.busca.set(termo);
    const normalizado = normalizar(termo.trim());
    const ids = new Set(
      this.fichas()
        .filter((ficha) => ficha.busca.includes(normalizado))
        .map((ficha) => ficha.produto.id),
    );
    this.transicaoBusca.aplicar(this.elemento.nativeElement, ids, () => {
      this.movimento?.capturar('.produto');
      this.termoAplicado.set(termo);
    });
  }

  protected alternar(id: string): void {
    this.movimento?.capturar('.produto__rodape');
    this.abertos.update((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  protected quantidade(id: string): number {
    return this.carrinho.itens().filter((item) => item.produtoId === id).length;
  }

  protected desfazer(): void {
    const aviso = this.aviso();
    if (aviso) this.carrinho.remover(aviso.indice);
    this.aviso.set(null);
  }

  private readonly tentado = signal(false);

  constructor() {
    const elemento = inject(ElementRef<HTMLElement>);
    afterRenderEffect(() => {
      this.filtrados();
      this.medirDescricoes(elemento.nativeElement);
    });
    let medidas: ResizeObserver | undefined;
    afterNextRender(() => {
      if (typeof ResizeObserver !== 'undefined') {
        medidas = new ResizeObserver(() =>
          this.medirDescricoes(elemento.nativeElement),
        );
        medidas.observe(elemento.nativeElement);
      }
      this.movimento = new MovimentoCatalogo(elemento.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      medidas?.disconnect();
      this.movimento?.destruir();
      this.transicaoBusca.cancelar();
    });
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

  protected adicionar(produto: ProdutoVitrine, evento: Event): void {
    if (this.carrinho.adicionar(produto)) {
      this.aviso.set({
        nome: produto.nome,
        indice: this.carrinho.quantidade() - 1,
      });
      this.movimento?.adicionar(evento.currentTarget as HTMLElement);
    }
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
