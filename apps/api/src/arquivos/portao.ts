import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { podeSerServido, type EstadoArquivo } from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { COLECAO_PEDIDOS, SUBCOLECAO_ANEXOS } from '../pedidos/pedido.js';
import { TermosService } from '../termos/termos.service.js';
import { baldeDoEstado, type DocumentoArquivo } from './arquivo.js';
import { EmissorDeLinkDeLeitura } from './leitura.js';

/**
 * Cinco minutos. Curto de proposito (arquitetura 7.3): o link e credencial, e um
 * link de horas vaza por historico de navegador, log de proxy e mensagem
 * encaminhada. Cinco minutos cobrem "clicar e o download comecar" e pouco mais.
 */
const VALIDADE_SEGUNDOS = 300;

/**
 * ===================================================================
 * O PORTAO. Regra inviolavel 6, num lugar so.
 * ===================================================================
 *
 * "Nenhum arquivo e servido com status diferente de `limpo`. Essa checagem vive
 * em um unico lugar."
 *
 * Este e o lugar. Nenhum outro modulo emite link de leitura — `arquivos/leitura.ts`
 * e o unico que chama `urlDeLeitura`, e uma regra de `dependency-cruiser` impede
 * que qualquer coisa alem deste arquivo o importe. A regra deixa de depender de
 * quem escrever o proximo endpoint lembrar dela.
 *
 * SAO TRES CONFERENCIAS, EM ORDEM, e a ordem importa:
 *
 *   1. O pedido e alcancavel por quem esta pedindo (404 se nao for — nunca 403,
 *      que confirmaria a existencia do id).
 *   2. O arquivo esta `limpo`. Qualquer outro estado recusa, inclusive
 *      `pendente_scan`: "ainda nao varrido" nao e "provavelmente seguro".
 *   3. Para ENTREGAVEL, o aceite dos termos daquela versao esta registrado.
 *
 * A terceira nao vale para o anexo do cliente, e a assimetria e da arquitetura
 * 7.3: o gate de termos existe "antes de baixar um entregavel". O anexo e o
 * arquivo que o proprio cliente enviou — exigir que ele aceite termos para
 * rebaixar o proprio RG seria cerimonia sem conformidade por tras.
 */
@Injectable()
export class PortaoDeArquivos {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly acesso: AcessoPedidoService,
    private readonly termos: TermosService,
    private readonly emissor: EmissorDeLinkDeLeitura,
  ) {}

  /**
   * Link para o ENTREGAVEL, com gate de termos.
   *
   * Alcancavel pelo cliente do pedido e pelo advogado atribuido: o advogado
   * precisa reler o que enviou, e `AcessoPedidoService` ja limita os dois.
   */
  async linkDoEntregavel(
    alvo: { pedidoId: string; entregavelId: string },
    quem: QuemAcessa,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    const arquivo = await this.arquivoDoEntregavel(alvo, quem);

    /*
     * O GATE. Antes de emitir, e nao depois: emitir e registrar em seguida
     * deixaria o link valido no caso de a gravacao do aceite falhar — e o aceite
     * e a evidencia de conformidade, nao um passo de interface.
     */
    const aceitou = await this.termos.jaAceitou({
      usuarioUid: quem.uid,
      pedidoId: alvo.pedidoId,
      entregavelId: alvo.entregavelId,
      versaoArquivo: arquivo.versao,
    });

    if (!aceitou) {
      throw new ForbiddenException(
        'Aceite os termos de servico antes de baixar este entregavel.',
      );
    }

    return this.emitir(arquivo.estado, arquivo.caminho, arquivo.nome);
  }

  /** Link para o ANEXO de apoio. Sem gate de termos — ver a nota da classe. */
  async linkDoAnexo(
    alvo: { pedidoId: string; anexoId: string },
    quem: QuemAcessa,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    const { referencia } = await this.acesso.exigir(alvo.pedidoId, quem);

    const documento = await referencia
      .collection(SUBCOLECAO_ANEXOS)
      .doc(alvo.anexoId)
      .get();

    if (!documento.exists) {
      throw new NotFoundException('Anexo nao encontrado.');
    }

    const anexo = documento.data() as DocumentoArquivo;
    return this.emitir(anexo.estado, anexo.caminho, anexo.nome);
  }

  /**
   * O ponto por onde TUDO passa. Recebe o estado e decide.
   *
   * `podeSerServido` vem de `packages/shared` — a mesma funcao que a tela usa
   * para decidir se mostra o botao. A tela usando-a nao a torna a fronteira;
   * aqui e que a regra e cumprida.
   */
  private async emitir(
    estado: EstadoArquivo,
    caminho: string,
    nome: string,
  ): Promise<{ url: string; validoPorSegundos: number }> {
    if (!podeSerServido(estado)) {
      /*
       * A mensagem nao diz QUAL estado. Quem depura tem o log e o painel; para
       * quem esta do outro lado, "infectado" e "ainda nao varrido" sao a mesma
       * resposta — e a diferenca entre as duas informa sobre o conteudo de um
       * arquivo que a pessoa nao deveria alcancar.
       */
      throw new ConflictException(
        'Este arquivo ainda nao esta disponivel para download.',
      );
    }

    const url = await this.emissor.emitir({
      balde: baldeDoEstado(estado),
      caminho,
      nomeParaBaixar: nome,
      validadeSegundos: VALIDADE_SEGUNDOS,
    });

    return { url, validoPorSegundos: VALIDADE_SEGUNDOS };
  }

  /** Le o `arquivoAtual` do entregavel, ja conferido o acesso ao pedido. */
  private async arquivoDoEntregavel(
    alvo: { pedidoId: string; entregavelId: string },
    quem: QuemAcessa,
  ): Promise<{
    estado: EstadoArquivo;
    caminho: string;
    nome: string;
    versao: number;
  }> {
    await this.acesso.exigir(alvo.pedidoId, quem);

    const documento = await this.db
      .collection(COLECAO_PEDIDOS)
      .doc(alvo.pedidoId)
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .doc(alvo.entregavelId)
      .get();

    if (!documento.exists) {
      throw new NotFoundException('Entregavel nao encontrado.');
    }

    const arquivo = (documento.data() as DocumentoEntregavel).arquivoAtual;
    if (arquivo === null || arquivo === undefined) {
      throw new NotFoundException('Este entregavel ainda nao tem arquivo.');
    }

    return {
      estado: arquivo.estado,
      caminho: arquivo.caminho,
      nome: arquivo.nome,
      versao: arquivo.versao,
    };
  }
}
