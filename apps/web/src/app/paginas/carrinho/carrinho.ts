import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ROTULO_DO_TIPO_COBRANCA } from 'shared/tipo-cobranca';
import {
  CarrinhoService,
  type ItemGuardado,
} from '../../publico/carrinho.service';
import { paraReais } from '../../comum/moeda';
import {
  AVISO_AVULSO_SEM_PARCELAMENTO,
  descreverCondicaoNoCartao,
} from '../../comum/parcela';
import { Botao } from '../../ui/botao/botao';
import { LinkAcao } from '../../ui/link-acao/link-acao';
import { Icone } from '../../ui/icone/icone';
@Component({
  selector: 'app-carrinho',
  imports: [Botao, LinkAcao, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './carrinho.html',
  styleUrl: '../publicas.css',
})
export class Carrinho {
  protected readonly carrinho = inject(CarrinhoService);
  protected readonly preco = paraReais;
  protected readonly avisoSemParcelamento = AVISO_AVULSO_SEM_PARCELAMENTO;

  /**
   * "ou em até 12x de R$ 590,00 no cartão", da conta de `shared`. Vazio quando
   * a compra e a vista — inclusive por causa de um avulso no carrinho.
   *
   * O CARRINHO NAO SABE SE O CARTAO ESTA NO AR: perguntar seria chamar a API
   * numa pagina que vive sem ela (regra 10). O checkout confere e so anuncia o
   * que aceita.
   */
  protected readonly condicaoNoCartao = computed(() =>
    descreverCondicaoNoCartao(
      this.carrinho.totalIndicativoCentavos(),
      this.carrinho.parcelasNoCartao(),
    ),
  );

  /** "Assinatura" ou "Serviço avulso"; vazio no item guardado antes do campo. */
  protected tipo(item: ItemGuardado): string {
    const tipo = item.tipoCobranca ?? null;
    return tipo === null ? '' : ROTULO_DO_TIPO_COBRANCA[tipo];
  }
}
