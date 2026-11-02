/**
 * O FORMATO REAL DA SALA DO TEAMS, para os testes do adaptador do Graph.
 *
 * `REUNIAO_NO_FORMATO_REAL` e a resposta de `POST /users/{id}/onlineMeetings`
 * da chamada de teste manual de 01/11/2026, feita no tenant do escritorio com a
 * conta organizadora, a application access policy `LexIntegra-Reunioes` e a
 * politica de reuniao `LexIntegra-Organizadora`. A FORMA e a real — os campos,
 * a ordem, os tipos e os valores das opcoes. TODO IDENTIFICADOR FOI TROCADO por
 * um ficticio no mesmo formato: tenant, organizador, UPN, id da reuniao, thread,
 * URLs, codigo e senha da reuniao, e o HTML de `joinInformation` (que repetia o
 * link e o codigo). O `subject` sai de quem chama.
 *
 * O QUE ELA PROVA que a documentacao nao provava: com a politica de reuniao da
 * conta organizadora, `allowRecording` e `allowTranscription` VEM `true` na
 * sala — por isso o PATCH as desliga tambem na sala (`OPCOES_DA_SALA`), e nao
 * so pela politica do tenant (ver `docs/entrega/lgpd.md`). E o `id` da reuniao tem 148 caracteres, base64
 * com `=`: vai para o caminho do PATCH e do DELETE por `encodeURIComponent`.
 *
 * Arnes de teste, e nao codigo de producao: fora da cobertura
 * (`jest.config.mjs`), e sem import nenhum.
 */

/** Tenant e conta organizadora ficticios, no formato do Entra. */
export const TENANT_FICTICIO = 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb';
export const ORGANIZADORA_FICTICIA = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

export const ID_DA_SALA_FICTICIA =
  'MSo5YThiN2M2ZC01ZTRmLTRhM2ItOGMyZC0xZTBmOWE4YjdjNmQqMCoqMTk6bWVldGluZ19abWxqZEdsamFXOHRjMkZzWVMxc1pYaHBiblJsWjNKaEB0aHJlYWQudjI=';

export const LINK_DA_SALA_FICTICIA =
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZmljdGljaW8tc2FsYS1sZXhpbnRlZ3Jh%40thread.v2/0' +
  `?context=%7b%22Tid%22%3a%22${TENANT_FICTICIO}%22%2c%22Oid%22%3a%22${ORGANIZADORA_FICTICIA}%22%7d`;

export const REUNIAO_NO_FORMATO_REAL: Readonly<Record<string, unknown>> = {
  '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#users('${ORGANIZADORA_FICTICIA}')/onlineMeetings/$entity`,
  creationDateTime: '2026-11-01T19:14:55.2569672Z',
  startDateTime: '2026-11-01T20:14:43.476469Z',
  endDateTime: '2026-11-01T20:44:43.476469Z',
  joinUrl: LINK_DA_SALA_FICTICIA,
  meetingCode: '2100000000000001',
  isBroadcast: false,
  autoAdmittedUsers: 'everyone',
  joinWebUrl: LINK_DA_SALA_FICTICIA,
  subject: 'Reunião LexIntegra — pedido fWCFnW-001',
  meetingType: 'scheduled',
  isEntryExitAnnounced: true,
  isEndToEndEncryptionEnabled: false,
  allowedPresenters: 'everyone',
  allowAttendeeToEnableMic: true,
  allowAttendeeToEnableCamera: true,
  allowMeetingChat: 'disabled',
  allowedLobbyAdmitters: 'organizerAndCoOrganizersAndPresenters',
  shareMeetingChatHistoryDefault: 'none',
  allowTeamworkReactions: true,
  anonymizeIdentityForRoles: [],
  allowParticipantsToChangeName: false,
  allowTranscription: true,
  allowRecording: true,
  allowWhiteboard: true,
  allowBreakoutRooms: true,
  allowLiveShare: 'enabled',
  allowPowerPointSharing: true,
  allowCopyingAndSharingMeetingContent: true,
  meetingOptionsWebUrl:
    `https://teams.microsoft.com/meetingOptions/?organizerId=${ORGANIZADORA_FICTICIA}` +
    `&tenantId=${TENANT_FICTICIO}` +
    '&threadId=19_meeting_ZmljdGljaW8tc2FsYS1sZXhpbnRlZ3Jh@thread.v2&messageId=0&language=pt-BR',
  expiryDateTime: '2026-12-31T20:44:43.476469Z',
  id: ID_DA_SALA_FICTICIA,
  participants: {
    organizer: {
      upn: 'operacional@escritorio.test',
      role: 'presenter',
      identity: {
        user: {
          '@odata.type': '#microsoft.graph.communicationsUserIdentity',
          id: ORGANIZADORA_FICTICIA,
          tenantId: TENANT_FICTICIO,
        },
      },
    },
    attendees: [],
  },
  chatInfo: {
    threadId: '19:meeting_ZmljdGljaW8tc2FsYS1sZXhpbnRlZ3Jh@thread.v2',
    messageId: '0',
  },
  joinInformation: {
    content:
      'data:text/html,%3cdiv%3eReuni%c3%a3o+do+Microsoft+Teams+(fict%c3%adcia)%3c%2fdiv%3e',
    contentType: 'html',
  },
  joinMeetingIdSettings: {
    isPasscodeRequired: true,
    joinMeetingId: '2100000000000001',
    passcode: 'Ab3dEf9h',
  },
  lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
  cloudVideoInteropInfo: {},
};

/** A resposta real, com campos trocados — para o caso que o teste quer provar. */
export function reuniaoNoFormatoReal(
  sobrescrever: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...structuredClone(REUNIAO_NO_FORMATO_REAL), ...sobrescrever };
}

/**
 * Os erros que o Graph e o Entra devolvem, no formato de cada um. O da policy
 * e o `{ error: { code, message } }` do Graph; o do segredo expirado e o OAuth
 * `{ error, error_description }` do endpoint de token, com o codigo AADSTS que
 * diz o que aconteceu. Os ids de correlacao e de rastreio sao ficticios.
 */
export const ERRO_SEM_POLICY = {
  error: {
    code: 'General',
    message: 'No application access policy found for this app.',
    innerError: {
      'request-id': '00000000-0000-4000-8000-00000000aaaa',
      date: '2026-11-01T19:14:55',
    },
  },
};

export const ERRO_SEGREDO_EXPIRADO = {
  error: 'invalid_client',
  error_description:
    "AADSTS7000222: The provided client secret keys for app '11111111-2222-4333-8444-555555555555' are expired. " +
    'Visit the Azure portal to create new keys for your app: https://aka.ms/NewClientSecret, ' +
    'or consider using certificate credentials for added security: https://aka.ms/certCreds. ' +
    'Trace ID: 00000000-0000-4000-8000-00000000bbbb Correlation ID: 00000000-0000-4000-8000-00000000cccc ' +
    'Timestamp: 2026-11-01 19:14:55Z',
  error_codes: [7000222],
  timestamp: '2026-11-01 19:14:55Z',
  trace_id: '00000000-0000-4000-8000-00000000bbbb',
  correlation_id: '00000000-0000-4000-8000-00000000cccc',
};
