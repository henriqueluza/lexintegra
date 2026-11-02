import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  MARCAS_ACEITAS,
  NOME_DA_MARCA,
  type MarcaDePagamento,
} from 'shared/formas-de-pagamento';

/**
 * As marcas das formas de pagamento aceitas: rodape publico e checkout.
 *
 * A LISTA NAO MORA AQUI. O padrao e `MARCAS_ACEITAS`, de
 * `shared/formas-de-pagamento`, a mesma fonte do checkout e do esquema do
 * produto; quem usa o componente so recorta (o checkout mostra o Pix na opcao
 * Pix e as bandeiras na opcao cartao).
 *
 * OS DESENHOS SAO OS ARQUIVOS OFICIAIS, sem redesenho: os paths foram copiados
 * dos SVG de cada marca, e so o atributo `fill` virou classe, para a cor vir de
 * token (regra inviolavel 8). Origem e regras de uso de cada um no `LEIA-ME.md`
 * desta pasta. SVG inline, e nao `<img>` nem sprite, pelo mesmo motivo de
 * `ui/icone`: o rodape e pre-renderizado em toda rota publica.
 *
 * ACESSIBILIDADE: e uma lista (`role="list"` explicito, porque o Safari tira a
 * semantica de lista de `ul` sem marcador), e cada marca e uma imagem com nome
 * ("Pix", "Visa"...). O leitor de tela le "Formas de pagamento aceitas, lista,
 * 5 itens".
 */
@Component({
  selector: 'app-marcas-pagamento',
  templateUrl: './marcas-pagamento.html',
  styleUrl: './marcas-pagamento.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarcasPagamento {
  readonly marcas = input<readonly MarcaDePagamento[]>(MARCAS_ACEITAS);
  readonly rotulo = input('Formas de pagamento aceitas');
  /** `p` (24 px) dentro de controle de formulario; `m` (32 px) no rodape. */
  readonly tamanho = input<'p' | 'm'>('m');

  protected readonly nomes = NOME_DA_MARCA;
}
