import type { Logger } from '@nestjs/common';
import type { TipoEvento } from 'shared';
import type { EmailResultado } from '../email/email-transport.js';
import type { ConvitesService } from '../reunioes/convites.service.js';
import type { RegistroOutbox } from './evento.js';

/**
 * Os tres eventos da SALA DO TEAMS, do lado do despachante: criar (Etapa 10,
 * arquitetura 7.2), remarcar e remover (`feat/ligar-teams`). Nenhum e e-mail,
 * como o estorno — sao chamadas ao Graph, e quem as faz e o servico de convites.
 *
 * Fora de `despachante.service.ts` porque sao um ramo so do despachante, com
 * regras proprias, e o arquivo dele ja passava do limite de tamanho.
 */

const DA_SALA = [
  'criar-sala-reuniao',
  'atualizar-sala-reuniao',
  'remover-sala-reuniao',
] as const;

export function ehDaSala(tipo: TipoEvento): tipo is (typeof DA_SALA)[number] {
  return (DA_SALA as readonly TipoEvento[]).includes(tipo);
}

/**
 * O CONVITE NAO NASCE AQUI: ele nasce na transacao que grava o link, dentro do
 * servico — junto com a releitura que decide se a reuniao ainda vale. Escrever
 * os convites daqui os poria fora daquela transacao, e uma falha entre as duas
 * escritas deixaria a reuniao confirmada sem convite nenhum.
 *
 * O PATCH e o DELETE podem concluir sem chamar ninguem — reuniao sem sala, ou
 * PATCH superado por remarcacao mais nova —, e isso e SUCESSO, nao falha a
 * reentregar.
 */
export async function despacharSala(
  registro: RegistroOutbox,
  convites: ConvitesService,
  log: Logger,
): Promise<EmailResultado> {
  if (registro.reuniao === undefined) {
    return { sucesso: false, motivo: 'registro de reuniao sem referencia' };
  }

  if (registro.tipo === 'criar-sala-reuniao') {
    const criada = await convites.criarSala(registro.reuniao);
    if (!criada.sucesso) return { sucesso: false, motivo: criada.motivo };
    if (criada.jaExistia) {
      log.warn(
        `sala da reuniao ${registro.reuniao.reuniaoId} ja existia no provedor`,
      );
    }
    return { sucesso: true, idProvedor: criada.idExterno };
  }

  const alterada =
    registro.tipo === 'remover-sala-reuniao'
      ? await convites.removerSala(registro.reuniao)
      : await convites.atualizarSala(registro.reuniao);
  if (!alterada.sucesso) return alterada;

  return { sucesso: true, idProvedor: alterada.pulado ?? 'graph' };
}
