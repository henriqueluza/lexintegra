import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import type { NovaObservacao, ObservacaoResumo, Perfil } from 'shared';
import { AcessoPedidoService } from '../pedidos/acesso.service.js';
import { paraIso, SUBCOLECAO_OBSERVACOES } from '../pedidos/pedido.js';

export type Autor = { readonly uid: string; readonly perfil: Perfil };

interface DocumentoObservacao {
  texto: string;
  autorUid: string;
  autorPerfil: Perfil;
  criadoEm: FieldValue;
}

const TETO = 200;

/**
 * As observacoes do cartao do pedido (item 2.3.3).
 *
 * APPEND-ONLY, E NAO POR SIMPLICIDADE. O advogado trabalha a partir do que o
 * cliente escreveu: se o texto pudesse ser reescrito, "o cliente pediu X" viraria
 * "o cliente sempre pediu Y", sem trilha. Nao ha metodo de edicao nem de
 * exclusao neste servico, e ha teste que defende a ausencia — do mesmo jeito que
 * `ProdutosController` tem teste defendendo a ausencia de `DELETE`.
 *
 * LGPD: o texto pode trazer detalhe do caso juridico. Ele nao entra em log
 * nenhum, nem em mensagem de erro — este servico nao loga, e a ausencia do
 * `Logger` aqui e a decisao, nao esquecimento.
 */
@Injectable()
export class ObservacoesService {
  constructor(private readonly acesso: AcessoPedidoService) {}

  async registrar(
    pedidoId: string,
    autor: Autor,
    dados: NovaObservacao,
  ): Promise<ObservacaoResumo> {
    const { referencia: pedido } = await this.acesso.exigir(pedidoId, autor);

    /*
     * ID automatico, e nao deterministico. A regra inviolavel 4 pede id
     * deterministico onde a repeticao e reentrega da MESMA operacao — webhook,
     * slot de reuniao. Aqui a repeticao e outra observacao: alguem que escreve
     * duas vezes escreveu duas coisas, e colapsa-las perderia o segundo texto.
     */
    const documento = pedido.collection(SUBCOLECAO_OBSERVACOES).doc();
    await documento.set({
      texto: dados.texto,
      autorUid: autor.uid,
      autorPerfil: autor.perfil,
      criadoEm: FieldValue.serverTimestamp(),
    } satisfies DocumentoObservacao);

    return {
      id: documento.id,
      texto: dados.texto,
      autorUid: autor.uid,
      autorPerfil: autor.perfil,
      criadoEm: null,
    };
  }

  async listar(pedidoId: string, quem: Autor): Promise<ObservacaoResumo[]> {
    const { referencia: pedido } = await this.acesso.exigir(pedidoId, quem);

    const pagina = await pedido
      .collection(SUBCOLECAO_OBSERVACOES)
      .orderBy('criadoEm')
      .limit(TETO)
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoObservacao;
      return {
        id: documento.id,
        texto: dados.texto,
        autorUid: dados.autorUid,
        autorPerfil: dados.autorPerfil,
        criadoEm: paraIso(dados.criadoEm),
      };
    });
  }
}
