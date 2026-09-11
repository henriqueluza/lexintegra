import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { EstadoArquivo, FluxoUpload } from 'shared';

/**
 * A forma do documento de arquivo, comum aos DOIS fluxos.
 *
 * A forma e comum; os CAMINHOS nao sao. O anexo do cliente vive em
 * `pedidos/{id}/anexos/{id}` e o entregavel do advogado em
 * `pedidos/{id}/entregaveis/{id}` (no campo `arquivoAtual`). A arquitetura 6.2
 * separa os fluxos por autorizacao, endpoint, prefixo de objeto e retencao — nao
 * pelo formato do registro, que seria separacao sem ganho e com duas listas de
 * campos para manter em dia.
 */
export interface DocumentoArquivo {
  nome: string;
  tipo: string;
  tamanhoBytes: number;
  /** Ver `ESTADOS_ARQUIVO`, em `packages/shared`. So `limpo` e servivel. */
  estado: EstadoArquivo;
  fluxo: FluxoUpload;
  /** Caminho do objeto, SEM o balde — o balde sai do estado. */
  caminho: string;
  enviadoPor: string;
  criadoEm: Timestamp | FieldValue;
  atualizadoEm?: Timestamp | FieldValue;
  /** Preenchido quando o veredito recusa. Vai para o painel, nao para o titular. */
  motivo?: string;
}

/**
 * Em que balde o objeto esta, dado o estado.
 *
 * Uma funcao, e nao um campo no documento: o balde e DERIVADO do estado, e
 * guardar os dois abriria a possibilidade de discordarem — um documento `limpo`
 * apontando para a quarentena seria um link que sempre falha, e um `pendente_scan`
 * apontando para o bucket limpo seria pior.
 */
export function baldeDoEstado(
  estado: EstadoArquivo,
): 'quarentena' | 'arquivos' {
  return estado === 'limpo' ? 'arquivos' : 'quarentena';
}
