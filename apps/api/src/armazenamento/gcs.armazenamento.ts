import { Injectable } from '@nestjs/common';
import type { Bucket, File } from '@google-cloud/storage';
import type {
  Armazenamento,
  Balde,
  Objeto,
  PedidoDeUrlDeEscrita,
  PedidoDeUrlDeLeitura,
} from './armazenamento.js';

export type Baldes = Readonly<Record<Balde, Bucket>>;

/**
 * Adaptador de producao (ADR-17). Unico arquivo do projeto que conhece o SDK do
 * Cloud Storage.
 *
 * ASSINATURA SEM CHAVE JSON. O Cloud Run usa credencial de ambiente, sem chave
 * privada em disco — entao `getSignedUrl` assina pela API de IAM
 * (`signBlob`), o que exige `roles/iam.serviceAccountTokenCreator` da service
 * account SOBRE SI MESMA. A concessao esta em `infra/terraform/iam.tf`; sem ela
 * a emissao falha em producao e funciona na maquina do desenvolvedor, que tem
 * credencial de usuario. E o modo de falha mais confuso deste modulo, e por isso
 * esta escrito aqui.
 *
 * `version: 'v4'` em tudo: a v2 nao suporta o cabecalho de tamanho maximo, que e
 * o que impede uma URL de escrita de virar upload ilimitado.
 */
@Injectable()
export class GcsArmazenamento implements Armazenamento {
  constructor(private readonly baldes: Baldes) {}

  async urlDeEscrita(pedido: PedidoDeUrlDeEscrita): Promise<string> {
    const [url] = await this.arquivo(pedido.objeto).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + pedido.validadeSegundos * 1000,
      /*
       * O tipo entra na ASSINATURA: um PUT com `Content-Type` diferente e
       * recusado pelo proprio Cloud Storage, antes de o objeto existir. Sem isso,
       * a validacao de tipo do servidor seria conselho, nao regra — o navegador
       * pediria URL para um PDF e mandaria um executavel.
       */
      contentType: pedido.tipo,
      extensionHeaders: {
        'x-goog-content-length-range': `1,${String(pedido.tamanhoMaximoBytes)}`,
      },
    });

    return url;
  }

  async urlDeLeitura(pedido: PedidoDeUrlDeLeitura): Promise<string> {
    const [url] = await this.arquivo(pedido.objeto).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + pedido.validadeSegundos * 1000,
      /*
       * `attachment` SEMPRE (arquitetura 7.3). Com `inline`, um PDF ou um SVG
       * abre no navegador — e um arquivo de conteudo desconhecido que ABRE e
       * exatamente o que a varredura existe para evitar servir. O download
       * acontece de um dominio que nao compartilha cookie com a aplicacao, o que
       * fecha a outra metade do risco.
       */
      responseDisposition: `attachment; filename="${pedido.nomeParaBaixar.replace(/"/g, '')}"`,
    });

    return url;
  }

  async lerPrimeirosBytes(
    objeto: Objeto,
    quantidade: number,
  ): Promise<Uint8Array> {
    /*
     * `start`/`end` viram um `Range` na requisicao: sao os primeiros N bytes, nao
     * o objeto inteiro. Baixar tudo para olhar cinco bytes desfaria a economia de
     * a API nao tocar no arquivo.
     */
    const [conteudo] = await this.arquivo(objeto).download({
      start: 0,
      end: quantidade - 1,
    });

    return new Uint8Array(conteudo);
  }

  async mover(origem: Objeto, destino: Objeto): Promise<void> {
    /*
     * COPIA E APAGA, e nao `move`: os dois objetos estao em BALDES diferentes —
     * quarentena e arquivos —, e o `move` do SDK so opera dentro do mesmo bucket.
     */
    await this.arquivo(origem).copy(this.arquivo(destino));
    await this.arquivo(origem).delete();
  }

  async excluir(objeto: Objeto): Promise<void> {
    // `ignoreNotFound`: o job de retencao pode reprocessar um pedido cujo objeto
    // ja saiu, e isso e repeticao esperada, nao erro.
    await this.arquivo(objeto).delete({ ignoreNotFound: true });
  }

  async existe(objeto: Objeto): Promise<boolean> {
    const [existe] = await this.arquivo(objeto).exists();
    return existe;
  }

  private arquivo(objeto: Objeto): File {
    return this.baldes[objeto.balde].file(objeto.caminho);
  }
}
