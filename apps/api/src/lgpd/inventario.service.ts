import { Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import type {
  DocumentSnapshot,
  Firestore,
  Query,
} from 'firebase-admin/firestore';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import {
  ARMAZENAMENTO,
  type Armazenamento,
  type Objeto,
} from '../armazenamento/armazenamento.js';
import {
  MAPA_OBJETOS,
  MAPA_TITULAR,
  REFERENCIAS_TITULAR,
  prefixosDoPedido,
  type Grupo,
  type RegistroTitular,
} from './mapa.js';
import { resolverTitular, type Titular } from './titular.js';

export interface Inventario {
  readonly titular: Titular;
  readonly registros: RegistroTitular[];
  readonly objetos: Objeto[];
}

const LIMITE_DOCUMENTOS = 2000;

@Injectable()
export class InventarioTitular {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async reunir(tipo: string, id: string): Promise<Inventario> {
    const titular = await resolverTitular(this.db, this.auth, tipo, id);
    const encontrados = new Map<string, RegistroTitular>();
    let bytes = 0;
    const adicionar = (grupo: Grupo, doc: DocumentSnapshot): void => {
      if (!doc.exists || encontrados.has(doc.ref.path)) return;
      const dados = doc.data() as Record<string, unknown>;
      bytes += Buffer.byteLength(JSON.stringify(dados));
      if (bytes > 25 * 1024 * 1024)
        throw new PayloadTooLargeException('Dados do titular excedem 25 MiB.');
      encontrados.set(doc.ref.path, {
        grupo,
        caminho: doc.ref.path,
        dados,
      });
      if (encontrados.size > LIMITE_DOCUMENTOS)
        throw new PayloadTooLargeException(
          'Titular excede o limite de documentos por pacote.',
        );
    };
    await this.raizes(titular, adicionar);
    // A ordem do mapa segue a dependencia pai -> filhos.
    for (const [grupo, mapa] of Object.entries(MAPA_TITULAR)) {
      if (!('pai' in mapa)) continue;
      for (const pai of [...encontrados.values()].filter(
        (r) => r.grupo === mapa.pai,
      )) {
        await this.consultar(
          grupo as Grupo,
          this.db.collection(`${pai.caminho}/${mapa.colecao}`),
          adicionar,
        );
      }
    }
    await this.referencias(encontrados, adicionar);
    const registros = [...encontrados.values()].sort((a, b) =>
      a.caminho.localeCompare(b.caminho),
    );
    const objetos = await this.objetos(registros);
    return { titular, registros, objetos };
  }

  private async consultar(
    grupo: Grupo,
    query: Query,
    adicionar: Adicionar,
  ): Promise<void> {
    const documentos = query
      .limit(LIMITE_DOCUMENTOS + 1)
      .stream() as AsyncIterable<DocumentSnapshot>;
    for await (const doc of documentos) adicionar(grupo, doc);
  }

  private async raizes(titular: Titular, adicionar: Adicionar): Promise<void> {
    adicionar(
      'preCadastros',
      await this.db
        .collection(MAPA_TITULAR.preCadastros.colecao)
        .doc(titular.preCadastroId)
        .get(),
    );
    await this.consultar(
      'checkouts',
      this.db
        .collection(MAPA_TITULAR.checkouts.colecao)
        .where(MAPA_TITULAR.checkouts.campo, '==', titular.preCadastroId),
      adicionar,
    );
    await this.consultar(
      'solicitacoes',
      this.db
        .collection(MAPA_TITULAR.solicitacoes.colecao)
        .where(MAPA_TITULAR.solicitacoes.campo, '==', titular.chave),
      adicionar,
    );
    if (titular.uid === null) return;
    adicionar(
      'clientes',
      await this.db
        .collection(MAPA_TITULAR.clientes.colecao)
        .doc(titular.uid)
        .get(),
    );
    for (const grupo of [
      'pedidos',
      'pagamentos',
      'estornos',
      'outbox',
      'aceites',
    ] as const) {
      const mapa = MAPA_TITULAR[grupo];
      await this.consultar(
        grupo,
        this.db.collection(mapa.colecao).where(mapa.campo, '==', titular.uid),
        adicionar,
      );
    }
  }

  private async referencias(
    registros: ReadonlyMap<string, RegistroTitular>,
    adicionar: Adicionar,
  ): Promise<void> {
    for (const relacao of REFERENCIAS_TITULAR) {
      for (const registro of [...registros.values()].filter(
        (r) => r.grupo === relacao.origem,
      )) {
        const valor =
          relacao.campoOrigem === undefined
            ? registro.caminho.split('/')[1]
            : registro.dados[relacao.campoOrigem];
        if (typeof valor !== 'string') continue;
        await this.consultar(
          relacao.destino,
          this.db
            .collection(MAPA_TITULAR[relacao.destino].colecao)
            .where(relacao.campoDestino, '==', valor),
          adicionar,
        );
      }
    }
  }

  private async objetos(
    registros: readonly RegistroTitular[],
  ): Promise<Objeto[]> {
    const objetos: Objeto[] = [];
    for (const pedido of registros.filter((r) => r.grupo === 'pedidos')) {
      for (const prefixo of prefixosDoPedido(pedido.caminho.split('/')[1])) {
        for (const balde of MAPA_OBJETOS.baldes) {
          const caminhos = await this.armazenamento.listar(
            balde,
            prefixo,
            LIMITE_DOCUMENTOS + 1,
          );
          objetos.push(...caminhos.map((caminho) => ({ balde, caminho })));
          if (objetos.length > LIMITE_DOCUMENTOS)
            throw new PayloadTooLargeException(
              'Titular excede o limite de objetos por pacote.',
            );
        }
      }
    }
    return objetos;
  }
}

type Adicionar = (grupo: Grupo, documento: DocumentSnapshot) => void;
