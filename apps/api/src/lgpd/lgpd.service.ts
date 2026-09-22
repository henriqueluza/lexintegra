import { randomUUID } from 'node:crypto';
import {
  ConflictException,
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
import { impedimentos, POLITICA_TITULAR } from './politica.js';

@Injectable()
export class LgpdService {
  private readonly log = new Logger('LGPD');
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly inventario: InventarioTitular,
    private readonly portao: PortaoDeArquivos,
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
    return simulacao(await this.inventario.reunir(tipo, id));
  }

  /** Retoma o mesmo protocolo e recalcula impedimentos. Nunca apaga, anonimiza,
   * suspende conta ou anuncia exclusao antes de haver politica aprovada.
   */
  async solicitar(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<Record<string, unknown>> {
    const inventario = await this.inventario.reunir(tipo, id);
    const plano = simulacao(inventario);
    const protocolo = `eliminacao_${inventario.titular.chave}`;
    const referencia = this.db
      .collection(MAPA_TITULAR.solicitacoes.colecao)
      .doc(protocolo);
    const estado =
      plano.impedimentos.length > 0 ? 'impedida' : 'aguardando_politica';
    await this.db.runTransaction(async (transacao) => {
      const anterior = await transacao.get(referencia);
      const atualizacao = {
        estado,
        politicaVersao: POLITICA_TITULAR.versao,
        reavaliadoPor: ator.uid,
        reavaliadoEm: FieldValue.serverTimestamp(),
      };
      if (anterior.exists) transacao.update(referencia, atualizacao);
      else
        transacao.create(referencia, {
          ...atualizacao,
          titularUid: inventario.titular.uid,
          titularChave: inventario.titular.chave,
          acao: 'eliminacao',
          solicitadoPor: ator.uid,
          criadoEm: FieldValue.serverTimestamp(),
        });
    });
    this.log.log({
      message: 'Solicitacao de eliminacao registrada',
      protocolo,
      estado,
    });
    return { protocolo, estado, ...plano };
  }

  async executar(
    tipo: string,
    id: string,
    ator: UsuarioAutenticado,
  ): Promise<never> {
    const resultado = await this.solicitar(tipo, id, ator);
    throw new ConflictException({
      message:
        'Eliminacao bloqueada. Consulte os impedimentos e a politica de guarda pendente.',
      ...resultado,
    });
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

function simulacao(inventario: Inventario): {
  politica: typeof POLITICA_TITULAR;
  executavel: false;
  impedimentos: ReturnType<typeof impedimentos>;
  documentos: Record<string, unknown>[];
  objetos: Inventario['objetos'];
  conta: { presente: boolean; guarda: string };
} {
  return {
    politica: POLITICA_TITULAR,
    executavel: false,
    impedimentos: impedimentos(inventario.registros, agora()),
    documentos: inventario.registros.map((r) => ({
      caminho: r.caminho,
      grupo: r.grupo,
      guardaProposta: MAPA_TITULAR[r.grupo].guarda,
    })),
    objetos: inventario.objetos,
    conta: {
      presente: inventario.titular.conta !== null,
      guarda: MAPA_AUTH.guarda,
    },
  };
}
