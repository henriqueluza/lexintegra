import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  normalizarParaBusca,
  type AnamneseResumo,
  type BuscaClientes,
  type ClienteResumo,
} from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { paraIso } from '../pedidos/pedido.js';
import {
  COLECAO_CLIENTES,
  SUBCOLECAO_ANAMNESE,
  type DocumentoAnamnese,
  type DocumentoCliente,
} from './cliente.js';

/**
 * Teto da varredura da busca textual.
 *
 * A arquitetura 5.5 autoriza resolver busca por substring "carregando e
 * filtrando no servidor" enquanto o volume estiver na casa das centenas. O teto
 * e o que impede essa frase de envelhecer em silencio: passando dele, a busca
 * comeca a devolver resultado incompleto, e isso precisa aparecer como decisao a
 * tomar — indice de busca de verdade — e nao como consulta que ficou lenta.
 *
 * O que NAO se faz e mandar a base inteira para o navegador filtrar: seria
 * transferir a lista de clientes de um escritorio de advocacia para a tela.
 */
const TETO_DA_VARREDURA = 500;

/**
 * Leitura de clientes: a pagina "Clientes" do administrador (item 2.5.8) e o
 * cliente que acompanha a demanda do advogado (item 2.6.2).
 *
 * SO LEITURA. O documento e escrito no checkout, que e a Etapa 8. Um metodo de
 * escrita aqui seria superficie sem chamador, e o `produtosContratados` que ele
 * mantivesse divergiria do que o checkout real vier a gravar.
 */
@Injectable()
export class ClientesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Busca por nome ou e-mail, com filtro por produto contratado.
   *
   * O filtro por produto vira consulta INDEXADA (`array-contains` mais
   * `orderBy`, com indice declarado em `infra/terraform/firestore.tf`); o termo
   * textual e aplicado depois, em memoria, porque o Firestore nao tem substring.
   * A ordem importa: filtrar no banco primeiro reduz o que a varredura textual
   * precisa percorrer.
   */
  async buscar(filtro: BuscaClientes): Promise<ClienteResumo[]> {
    const colecao = this.db.collection(COLECAO_CLIENTES);

    const consulta: Query =
      filtro.produto === undefined
        ? colecao.orderBy('nomeNormalizado')
        : colecao
            .where('produtosContratados', 'array-contains', filtro.produto)
            .orderBy('nomeNormalizado');

    const pagina = await consulta.limit(TETO_DA_VARREDURA).get();
    const clientes = pagina.docs.map((documento) =>
      paraResumo(documento.id, documento.data() as DocumentoCliente),
    );

    return this.filtrarPorTermo(clientes, pagina.docs, filtro.busca);
  }

  /**
   * O termo passa pela MESMA normalizacao que gerou os campos gravados. Comparar
   * o termo cru contra o campo normalizado nunca casaria com quem tem acento no
   * nome — e o defeito apareceria so para uma parte dos clientes.
   */
  private filtrarPorTermo(
    clientes: readonly ClienteResumo[],
    documentos: readonly { data(): unknown }[],
    termo: string | undefined,
  ): ClienteResumo[] {
    if (termo === undefined || termo === '') return [...clientes];

    const alvo = normalizarParaBusca(termo);
    return clientes.filter((_cliente, indice) => {
      const dados = documentos[indice].data() as DocumentoCliente;
      return (
        dados.nomeNormalizado.includes(alvo) ||
        dados.emailNormalizado.includes(alvo)
      );
    });
  }

  async obter(uid: string): Promise<ClienteResumo> {
    const documento = await this.db.collection(COLECAO_CLIENTES).doc(uid).get();

    if (!documento.exists) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    return paraResumo(uid, documento.data() as DocumentoCliente);
  }

  /**
   * Os nomes de varios clientes de uma vez, para a listagem de demandas e a
   * caixa de entrada.
   *
   * Uma leitura por uid, em paralelo, e nao uma consulta `in`: o `in` do
   * Firestore aceita no maximo 30 valores e obrigaria a fatiar a lista, e o
   * ganho seria de round-trips que ja acontecem em paralelo aqui. Os uids sao
   * deduplicados antes — dez pedidos do mesmo cliente sao uma leitura, nao dez.
   */
  async nomesDe(uids: readonly string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(uids)];
    const documentos = await Promise.all(
      unicos.map((uid) => this.db.collection(COLECAO_CLIENTES).doc(uid).get()),
    );

    return new Map(
      documentos.map((documento, indice) => [
        unicos[indice],
        /*
         * Cliente ausente vira texto, nao excecao. A alternativa seria a lista de
         * demandas inteira falhar porque um cadastro sumiu — e o advogado ficaria
         * sem ver nenhuma demanda por causa de uma.
         */
        documento.exists
          ? (documento.data() as DocumentoCliente).nome
          : '(cliente nao encontrado)',
      ]),
    );
  }

  /**
   * A anamnese do cliente (item 2.6.2).
   *
   * LGPD: o conteudo NAO entra em log, nem aqui nem em quem chama. E a mesma
   * regra que vale para o corpo da requisicao de anamnese na Etapa 8.
   */
  async anamneseDe(clienteId: string): Promise<AnamneseResumo[]> {
    const pagina = await this.db
      .collection(COLECAO_CLIENTES)
      .doc(clienteId)
      .collection(SUBCOLECAO_ANAMNESE)
      .orderBy('criadoEm')
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoAnamnese;
      return {
        id: documento.id,
        campos: dados.campos,
        criadoEm: paraIso(dados.criadoEm),
      };
    });
  }
}

function paraResumo(uid: string, dados: DocumentoCliente): ClienteResumo {
  return {
    uid,
    nome: dados.nome,
    email: dados.email,
    produtosContratados: dados.produtosContratados,
    criadoEm: paraIso(dados.criadoEm),
  };
}
