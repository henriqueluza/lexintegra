import { Injectable } from '@nestjs/common';
import type { Objeto } from '../armazenamento/armazenamento.js';

/**
 * A porta do scanner (ADR-18).
 *
 * O SCANNER RECEBE UM CAMINHO E DEVOLVE UM VEREDITO. So isso. Ele nao le
 * Firestore, nao conhece pedido, entregavel nem cliente, e nao decide o que fazer
 * com o resultado — quem decide e `VarreduraService`, na API.
 *
 * E o que mantem a excecao da arquitetura 3.2 honesta: o ClamAV vive num
 * contentor proprio porque carrega ~1 GB de assinaturas em memoria e inflaria o
 * cold start da API inteira; a excecao "se justifica porque o scanner nao contem
 * regra de negocio". Um scanner que escrevesse status no banco recriaria
 * exatamente o problema que a Cloud Function tinha — logica de dominio num
 * segundo artefato de deploy.
 *
 * A CONFERENCIA DE MAGIC BYTES NAO ESTA AQUI, e e deliberado: ela mora na API,
 * que le os primeiros bytes por faixa. Poe-la no scanner economizaria uma leitura
 * e traria conhecimento de politica de upload para dentro do contentor burro.
 */
export type Veredito = 'limpo' | 'infectado' | 'indisponivel';

export interface ResultadoDaVarredura {
  readonly veredito: Veredito;
  /** Nome da assinatura que casou, quando infectado. Vai para o painel. */
  readonly assinatura?: string;
  /** Quando a base do ClamAV foi atualizada. Alimenta o alerta de base velha
   * (arquitetura, secao 9). */
  readonly baseAtualizadaEm?: string;
}

export interface Scanner {
  varrer(objeto: Objeto): Promise<ResultadoDaVarredura>;
}

export const SCANNER = Symbol('SCANNER');

/**
 * Scanner falso, para desenvolvimento e testes.
 *
 * NAO USA EICAR. O arquivo de teste EICAR e uma cadeia de bytes que antivirus
 * reconhecem, e o plano de execucao reserva o teste com ele para uma validacao
 * humana ("testar com o arquivo EICAR voce mesmo, e confirmar que ele nunca ficou
 * acessivel"). Aqui, o veredito e CONFIGURADO pelo teste — o que se exercita e o
 * que a API faz com cada resposta possivel, que e o que codigo pode verificar.
 */
/**
 * O marcador que faz o scanner falso REPROVAR, em desenvolvimento.
 *
 * NAO E EICAR, e a distincao importa. EICAR e uma cadeia que antivirus de
 * verdade reconhecem, e o plano de execucao reserva o teste com ela para
 * validacao humana ("testar com o arquivo EICAR voce mesmo") — nenhum byte dela
 * existe neste repositorio, decisao da Etapa 11 mantida na 12.
 *
 * Isto aqui e outra coisa: um marcador do PROJETO, que so este dublê conhece,
 * para a jornada de upload conseguir exercitar o caminho "reprovado nunca e
 * servido" (regra inviolavel 6) de ponta a ponta, com navegador. Em producao o
 * scanner falso nao existe — `criarScanner` recusa subir sem `URL_SCANNER` —,
 * entao nao ha o que desligar.
 */
export const MARCADOR_DE_REPROVACAO = 'LEXINTEGRA-ARQUIVO-DE-TESTE-REPROVAR';

/** Quanto do arquivo o dublê olha atras do marcador. */
const BYTES_OLHADOS = 512;

@Injectable()
export class ScannerFalso implements Scanner {
  private resposta: ResultadoDaVarredura = { veredito: 'limpo' };
  readonly varridos: string[] = [];

  /**
   * O armazenamento so entra em desenvolvimento, e e ele que habilita o
   * marcador. Nos testes de unidade o dublê e construido sem ele, e o veredito
   * continua vindo de `responderCom` — o que se exercita ali e o que a API faz
   * com cada resposta possivel, e isso nao depende de conteudo nenhum.
   */
  constructor(private readonly armazenamento?: LeitorDeObjeto) {}

  responderCom(resultado: ResultadoDaVarredura): void {
    this.resposta = resultado;
  }

  async varrer(objeto: Objeto): Promise<ResultadoDaVarredura> {
    this.varridos.push(`${objeto.balde}:${objeto.caminho}`);

    if (this.armazenamento !== undefined && (await this.temMarcador(objeto))) {
      return {
        veredito: 'infectado',
        assinatura: 'Lexintegra.MarcadorDeTeste',
      };
    }

    return this.resposta;
  }

  private async temMarcador(objeto: Objeto): Promise<boolean> {
    try {
      const inicio = await this.armazenamento!.lerPrimeirosBytes(
        objeto,
        BYTES_OLHADOS,
      );
      return Buffer.from(inicio)
        .toString('latin1')
        .includes(MARCADOR_DE_REPROVACAO);
    } catch {
      return false;
    }
  }
}

/** So o que o dublê usa do armazenamento. */
export interface LeitorDeObjeto {
  lerPrimeirosBytes(objeto: Objeto, quantidade: number): Promise<Uint8Array>;
}
