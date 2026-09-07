import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
  FieldValue,
} from 'firebase-admin/firestore';
import type {
  NovoPreCadastro,
  PreCadastroLiberado,
  PreCadastroResumo,
} from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  gerarSegredo,
  hashDoSegredo,
  idDoPreCadastro,
  JANELA_LIBERACAO_MS,
  montarToken,
  segredoConfere,
  separarToken,
} from './liberacao.js';

export const COLECAO_PRE_CADASTROS = 'pre-cadastros';

interface DocumentoPreCadastro {
  nome: string;
  email: string;
  telefone: string;
  envios: number;
  liberacaoHash: string;
  liberacaoExpiraEm: Timestamp;
  criadoEm: Timestamp | FieldValue;
  atualizadoEm: Timestamp | FieldValue;
}

/**
 * Pre-cadastro: a base de leads (item 2.1.4) e a chave que destrava a vitrine.
 *
 * O QUE ESTE DOCUMENTO NAO GUARDA e tao decidido quanto o que ele guarda. Nao ha
 * IP, nao ha user-agent, nao ha referenciador. Sao dados que um formulario de
 * captacao coleta por reflexo e que ninguem neste projeto vai usar — e a
 * arquitetura (secao 13) trata minimizacao como medida, nao como boa intencao. O
 * rastro de reenvio e a contagem `envios`, que responde "insistiu?" sem responder
 * "de onde?".
 *
 * NADA IDENTIFICAVEL ENTRA EM LOG, nem o e-mail, nem o ID — que e hash de e-mail,
 * e e-mail e enumeravel, entao o hash e pseudonimo, nao anonimo.
 */
@Injectable()
export class PreCadastrosService {
  private readonly log = new Logger('PreCadastros');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Registra ou atualiza, e devolve o token de liberacao.
   *
   * EM TRANSACAO, e nao em `set({ merge: true })`, por causa de dois campos que
   * dependem do estado anterior: `criadoEm`, que precisa sobreviver ao reenvio, e
   * `envios`, que precisa somar. Um `merge` com `serverTimestamp()` reescreveria
   * a data de criacao a cada envio, e a base de leads perderia a unica
   * informacao que diz ha quanto tempo aquela pessoa apareceu.
   *
   * A transacao le e escreve UM documento e nao dispara efeito colateral nenhum
   * (regra inviolavel 2) — nao ha e-mail nem chamada externa aqui.
   *
   * O SEGREDO E ROTADO A CADA ENVIO. Quem preenche de novo recebe token novo e o
   * anterior morre. E o comportamento certo para quem trocou de navegador, e
   * limita a janela de um token que tenha vazado de um dispositivo compartilhado.
   */
  async registrar(dados: NovoPreCadastro): Promise<PreCadastroLiberado> {
    const id = idDoPreCadastro(dados.email);
    const referencia = this.db.collection(COLECAO_PRE_CADASTROS).doc(id);

    const segredo = gerarSegredo();
    const expiraEm = new Date(Date.now() + JANELA_LIBERACAO_MS);

    const reenvio = await this.db.runTransaction(async (transacao) => {
      const existente = await transacao.get(referencia);
      const anterior = existente.data() as DocumentoPreCadastro | undefined;

      /*
       * Documento inteiro a cada escrita, com `criadoEm` relido do anterior. Isso
       * dispensa `{ merge: true }` e deixa o payload gravado igual ao payload
       * conferido — sem campo herdado de uma versao anterior do schema.
       */
      transacao.set(referencia, {
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        envios: (anterior?.envios ?? 0) + 1,
        liberacaoHash: hashDoSegredo(segredo),
        liberacaoExpiraEm: Timestamp.fromDate(expiraEm),
        criadoEm: anterior?.criadoEm ?? FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      return anterior !== undefined;
    });

    this.log.log(reenvio ? 'pre-cadastro reenviado' : 'pre-cadastro novo');

    return {
      token: montarToken(id, segredo),
      expiraEm: expiraEm.toISOString(),
    };
  }

  /**
   * Confere o token que o navegador apresenta. Usado pelo guard da vitrine.
   *
   * Devolve booleano e nao o documento: quem chama precisa saber se pode mostrar
   * o catalogo, nao quem esta olhando. A vitrine e a mesma para todo mundo, e
   * carregar a identidade do lead ate ela so criaria a tentacao de personalizar
   * o que nao precisa ser personalizado.
   */
  async liberado(token: string): Promise<boolean> {
    const partes = separarToken(token);
    if (partes === null) return false;

    const documento = await this.db
      .collection(COLECAO_PRE_CADASTROS)
      .doc(partes.id)
      .get();

    const dados = documento.data() as DocumentoPreCadastro | undefined;
    if (dados === undefined) return false;

    if (dados.liberacaoExpiraEm.toMillis() <= Date.now()) return false;

    return segredoConfere(partes.segredo, dados.liberacaoHash);
  }

  /**
   * Consulta administrativa (item 2.1.4: base consultavel).
   *
   * `orderBy('criadoEm')` sozinho e campo unico, indexado pelo Firestore sem
   * declaracao — nao ha indice composto novo a declarar no Terraform. A regra la
   * e um indice por consulta que existe; esta consulta nao precisa de nenhum.
   */
  async listar(limite: number): Promise<PreCadastroResumo[]> {
    const pagina = await this.db
      .collection(COLECAO_PRE_CADASTROS)
      .orderBy('criadoEm', 'desc')
      .limit(limite)
      .get();

    return pagina.docs.map((documento) => paraResumo(documento));
  }
}

function emIso(valor: unknown): string | null {
  return valor instanceof Timestamp ? valor.toDate().toISOString() : null;
}

/**
 * O resumo NAO carrega `liberacaoHash` nem `liberacaoExpiraEm`.
 *
 * Sao material de credencial. O administrador que consulta a base de leads
 * precisa de nome, contato e quando — nao do que destrava a vitrine de alguem.
 */
function paraResumo(documento: DocumentSnapshot): PreCadastroResumo {
  const dados = documento.data() as DocumentoPreCadastro;

  return {
    id: documento.id,
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    envios: dados.envios,
    criadoEm: emIso(dados.criadoEm),
    atualizadoEm: emIso(dados.atualizadoEm),
  };
}
