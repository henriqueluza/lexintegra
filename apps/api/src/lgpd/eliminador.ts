import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import type { Inventario } from './inventario.service.js';
import type { RegistroTitular } from './mapa.js';
import { eliminaNoEscopo, type Escopo } from './politica.js';
import { usuarioAusente, type Titular } from './titular.js';

/**
 * Os passos DESTRUTIVOS da eliminacao, cada um idempotente: apagar o que ja nao
 * existe nao falha, e repetir um passo e o mesmo que faze-lo uma vez. Quem
 * decide QUANDO e O QUE e `EliminacaoTitular`; aqui so se executa.
 */
@Injectable()
export class Eliminador {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  /**
   * A trava contra escrita nova do cliente durante o processamento: sem login
   * e sem sessao, ele nao envia anexo nem marca reuniao no meio da eliminacao.
   * Advogado nao escreve: pedido em andamento e impedimento.
   */
  async bloquearConta(titular: Titular): Promise<void> {
    if (titular.uid === null || titular.conta === null) return;
    if (titular.conta.disabled === true) return;
    await this.auth.updateUser(titular.uid, { disabled: true });
    await this.auth.revokeRefreshTokens(titular.uid);
  }

  /**
   * Os arquivos sao sempre `eliminavel`. Na PARCIAL os documentos ficam, entao
   * a trilha precisa dizer que o arquivo saiu — como faz a retencao — e o
   * pedido sai da fila da retencao, que senao avisaria uma conta que nao existe
   * mais.
   */
  async eliminarObjetos(
    inventario: Inventario,
    escopo: Escopo,
  ): Promise<number> {
    for (const objeto of inventario.objetos)
      await this.armazenamento.excluir(objeto);
    if (escopo === 'parcial') {
      for (const registro of inventario.registros) {
        const marca = marcaDeArquivoExcluido(registro);
        if (marca !== null) await this.db.doc(registro.caminho).update(marca);
      }
    }
    return inventario.objetos.length;
  }

  /** Filhos antes dos pais; a grade do advogado so perde a referencia. */
  async eliminarDocumentos(
    inventario: Inventario,
    escopo: Escopo,
  ): Promise<number> {
    if (escopo === 'total') {
      for (const registro of inventario.registros)
        if (registro.grupo === 'disponibilidades')
          await this.db.doc(registro.caminho).update({ reserva: null });
    }
    const alvos = inventario.registros
      .filter((r) => eliminaNoEscopo(r.grupo, escopo))
      .sort(
        (a, b) =>
          b.caminho.split('/').length - a.caminho.split('/').length ||
          a.caminho.localeCompare(b.caminho),
      );
    for (const registro of alvos) await this.db.doc(registro.caminho).delete();
    return alvos.length;
  }

  /** Por ultimo, com checkpoint antes (quem chama). Ausente nao e erro. */
  async eliminarConta(uid: string): Promise<boolean> {
    try {
      await this.auth.deleteUser(uid);
      return true;
    } catch (erro) {
      if (usuarioAusente(erro)) return false;
      throw erro;
    }
  }
}

/** A trilha que fica no documento quando o arquivo dele sai. */
function marcaDeArquivoExcluido(
  registro: RegistroTitular,
): Record<string, unknown> | null {
  const dados = registro.dados;
  const agora = FieldValue.serverTimestamp();
  if (registro.grupo === 'entregaveis' && temArquivo(dados['arquivoAtual']))
    return { arquivoAtual: null, arquivoExcluidoEm: agora };
  if (registro.grupo === 'anexos' && dados['estado'] !== 'excluido')
    return { estado: 'excluido', arquivoExcluidoEm: agora };
  if (registro.grupo === 'pedidos' && dados['retencaoPendente'] === true)
    return { retencaoPendente: false, arquivosExcluidosEm: agora };
  return null;
}

function temArquivo(valor: unknown): boolean {
  return valor !== null && valor !== undefined;
}
