import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { UsuarioAutenticado } from '../autenticacao/usuario.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { PortaoDeArquivos } from '../arquivos/portao.js';
import { agora } from '../relogio.js';
import { InventarioTitular, type Inventario } from './inventario.service.js';
import {
  MAPA_AUTH,
  MAPA_OBJETOS,
  MAPA_TITULAR,
  REFERENCIAS_TITULAR,
  type RegistroTitular,
} from './mapa.js';
import { dadosLegiveis, pacoteTar, type EntradaPacote } from './pacote.js';
import { EliminacaoTitular } from './eliminacao.service.js';
import type { ResultadoDaExecucao } from './protocolo.js';
import {
  eliminaNoEscopo,
  escopoDaEliminacao,
  impedimentos,
  POLITICA_TITULAR,
  type Escopo,
  type Impedimento,
} from './politica.js';
import { COLECAO_RETENCOES_LEGAIS, lerRetencao } from './retencao-legal.js';

@Injectable()
export class LgpdService {
  private readonly log = new Logger('LGPD');
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly inventario: InventarioTitular,
    private readonly portao: PortaoDeArquivos,
    private readonly eliminacao: EliminacaoTitular,
  ) {}

  async exportar(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<Buffer> {
    const inicio = new Date(agora()).toISOString();
    const inventario = await this.inventario.reunir(tipo, id);
    const protocolo = `exportacao_${randomUUID()}`;
    const { entradas, arquivos } = await this.arquivos(inventario, ator);
    const conta = inventario.titular.conta;
    const dados = dadosLegiveis({
      versao: 1,
      protocolo,
      iniciadoEm: inicio,
      concluidoEm: new Date(agora()).toISOString(),
      consistencia:
        'Leituras sucessivas; dados podem mudar durante a exportacao.',
      mapa: MAPA_TITULAR,
      referencias: REFERENCIAS_TITULAR,
      objetos: MAPA_OBJETOS,
      auth: MAPA_AUTH,
      conta:
        conta === null
          ? null
          : Object.fromEntries(
              MAPA_AUTH.campos.map((campo) => [campo, conta[campo]]),
            ),
      registros: inventario.registros,
      inventarioDeObjetos: objetosDoPacote(inventario, arquivos),
      arquivos,
    });
    const pacote = pacoteTar([
      {
        nome: 'dados.json',
        bytes: Buffer.from(JSON.stringify(dados, null, 2)),
      },
      ...entradas,
    ]);
    await this.db
      .collection(MAPA_TITULAR.solicitacoes.colecao)
      .doc(protocolo)
      .create({
        titularUid: inventario.titular.uid,
        titularChave: inventario.titular.chave,
        acao: 'exportacao',
        solicitadoPor: ator.uid,
        criadoEm: FieldValue.serverTimestamp(),
        estado: 'pacote_preparado',
        bytes: pacote.length,
      });
    this.log.log({ message: 'Exportacao de titular preparada', protocolo });
    return pacote;
  }

  async simular(
    tipo: string,
    id: string,
  ): Promise<ReturnType<typeof simulacao>> {
    const inventario = await this.inventario.reunir(tipo, id);
    const retencao = await lerRetencao(this.db, inventario.titular.chave);
    return simulacao(inventario, retencao.exists);
  }

  /**
   * Cria ou reavalia o protocolo e, sem impedimento, escreve o aviso no outbox.
   * NADA E ELIMINADO AQUI: a execucao so anda 7 dias depois do envio
   * confirmado do aviso (`EliminacaoTitular`).
   */
  async solicitar(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<Record<string, unknown>> {
    const resultado = await this.eliminacao.solicitar(
      tipo,
      id,
      ator.uid,
      'titular',
    );
    return { ...(await this.simular(tipo, id)), ...resultado };
  }

  executar(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<ResultadoDaExecucao> {
    return this.eliminacao.executar(tipo, id, ator.uid);
  }

  private async arquivos(
    inventario: Inventario,
    ator: UsuarioAutenticado,
  ): Promise<{
    entradas: EntradaPacote[];
    arquivos: Record<string, unknown>[];
  }> {
    const entradas: EntradaPacote[] = [];
    const arquivos: Record<string, unknown>[] = [];
    let bytes = 0;
    for (const registro of inventario.registros) {
      const arquivo = arquivoDoRegistro(registro);
      if (arquivo === null) continue;
      if (arquivo['estado'] !== 'limpo') {
        arquivos.push({
          documento: registro.caminho,
          incluido: false,
          motivo: 'arquivo_nao_liberado',
        });
        continue;
      }
      const conteudo = await this.portao.exportar(
        registro.caminho,
        inventario.titular.uid as string,
        ator,
      );
      bytes += conteudo.length;
      if (bytes > 25 * 1024 * 1024)
        throw new PayloadTooLargeException('Exportacao excede 25 MiB.');
      const extensao = arquivo['tipo'] === 'application/pdf' ? 'pdf' : 'jpg';
      const nome = `arquivos/${String(entradas.length + 1)}.${extensao}`;
      entradas.push({ nome, bytes: conteudo });
      arquivos.push({
        documento: registro.caminho,
        objeto: arquivo['caminho'],
        nomeOriginal: arquivo['nome'],
        incluido: true,
        entrada: nome,
      });
    }
    return { entradas, arquivos };
  }
}

function objetosDoPacote(
  inventario: Inventario,
  arquivos: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const incluidos = new Set(
    arquivos.filter((a) => a['incluido'] === true).map((a) => a['objeto']),
  );
  return inventario.objetos.map((objeto) => ({
    ...objeto,
    incluido: objeto.balde === 'arquivos' && incluidos.has(objeto.caminho),
    motivoNaoInclusao:
      objeto.balde === 'quarentena'
        ? 'quarentena'
        : incluidos.has(objeto.caminho)
          ? null
          : 'sem_metadado_atual_liberado',
  }));
}

export function arquivoDoRegistro(
  registro: RegistroTitular,
): Record<string, unknown> | null {
  if (registro.grupo === 'anexos') return registro.dados;
  if (registro.grupo === 'entregaveis')
    return (
      (registro.dados['arquivoAtual'] as Record<string, unknown> | null) ?? null
    );
  return null;
}

function simulacao(
  inventario: Inventario,
  retencaoLegal: boolean,
): {
  politica: typeof POLITICA_TITULAR;
  executavel: boolean;
  impedimentos: Impedimento[];
  escopo: Escopo;
  guardaAte: string | null;
  documentos: Record<string, unknown>[];
  objetos: Inventario['objetos'];
  conta: { presente: boolean; guarda: string };
} {
  const agoraMs = agora();
  const lista = impedimentos(inventario.registros, agoraMs);
  if (retencaoLegal)
    lista.push({
      tipo: 'retencao_legal',
      caminho: `${COLECAO_RETENCOES_LEGAIS}/${inventario.titular.chave}`,
    });
  const { escopo, guardaAte } = escopoDaEliminacao(
    inventario.registros,
    agoraMs,
  );
  return {
    politica: POLITICA_TITULAR,
    executavel: lista.length === 0,
    impedimentos: lista,
    escopo,
    guardaAte: guardaAte === null ? null : guardaAte.toISOString(),
    documentos: inventario.registros.map((r) => ({
      caminho: r.caminho,
      grupo: r.grupo,
      guarda: MAPA_TITULAR[r.grupo].guarda,
      eliminadoNesteEscopo: eliminaNoEscopo(r.grupo, escopo),
    })),
    objetos: inventario.objetos,
    conta: {
      presente: inventario.titular.conta !== null,
      guarda: MAPA_AUTH.guarda,
    },
  };
}
