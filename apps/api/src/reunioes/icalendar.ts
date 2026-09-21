/**
 * O convite de calendario (RFC 5545), montado AQUI e sem servico externo.
 *
 * Regra inviolavel 12 e ADR-05. O que decide se isto funciona nao e o formato em
 * si, e o par `UID` + `SEQUENCE`: a remarcacao reenvia o MESMO `UID` com
 * `SEQUENCE` maior, e o calendario do destinatario ATUALIZA o evento em vez de
 * criar um segundo. O cancelamento manda `METHOD:CANCEL` com o mesmo `UID`.
 *
 * FUNCAO PURA, sem relogio proprio e sem ambiente: `dtstampMs` vem por parametro
 * e o endereco do organizador tambem. Sem isso, o teste que fixa a saida byte a
 * byte precisaria congelar `Date.now()`, e o `ORGANIZER` dependeria de uma
 * variavel de ambiente lida de dentro de uma funcao de formatacao.
 */

/** Uma hora inteira de deslocamento, em milissegundos. */
const MS_POR_HORA = 3_600_000;

/**
 * O fuso do escritorio, FIXO EM -03:00 (ADR-21, decisao E).
 *
 * O Brasil nao tem horario de verao hoje, e um bloco `DAYLIGHT` escrito "por
 * precaucao" descreveria uma regra que NAO EXISTE — os clientes de calendario a
 * aplicariam, e as reunioes andariam uma hora numa parte do ano.
 *
 * O DESLOCAMENTO E USADO NOS DOIS LUGARES, e isso nao e detalhe: `DTSTART` sai
 * como hora LOCAL com `TZID`, e quem converte essa hora local de volta para um
 * instante absoluto e o `VTIMEZONE` que vai no mesmo arquivo. Se a conversao
 * daqui usasse `Intl` com a base de fusos do sistema e o `VTIMEZONE` declarasse
 * -03:00 fixo, os dois discordariam no dia em que a base mudasse — e a reuniao
 * cairia na hora errada sem nada falhar.
 *
 * Se o horario de verao voltar, ESTE e o ponto unico a mudar, como o `hora + 3`
 * da grade de disponibilidade.
 */
const FUSO = {
  id: 'America/Sao_Paulo',
  deslocamentoHoras: -3,
  sufixo: '-0300',
} as const;

export interface Pessoa {
  readonly nome: string;
  readonly email: string;
}

export interface DadosDoConvite {
  /** Estavel por reuniao. A remarcacao reusa; o cancelamento tambem. */
  readonly uid: string;
  readonly sequence: number;
  /** ISO 8601 em UTC, como o slot guarda. */
  readonly inicio: string;
  readonly fim: string;
  readonly assunto: string;
  readonly descricao: string;
  readonly organizador: Pessoa;
  readonly participante: Pessoa;
  /** `DTSTAMP`: quando ESTA versao do convite foi produzida. */
  readonly dtstampMs: number;
}

/** O convite inicial e o de uma remarcacao — a diferenca esta so no `SEQUENCE`. */
export function conviteDeReuniao(
  dados: DadosDoConvite & { readonly link: string },
): string {
  return montar('REQUEST', dados, [
    'STATUS:CONFIRMED',
    linha('LOCATION', dados.link),
    linha('DESCRIPTION', `${dados.descricao}\n\n${dados.link}`),
    linha('URL', dados.link),
  ]);
}

/**
 * O cancelamento. Mesmo `UID`, `SEQUENCE` maior, `METHOD:CANCEL`.
 *
 * NAO LEVA O LINK. A sala continua existindo no Teams (ADR-21, decisao 7), e
 * repetir o link num evento cancelado convidaria a entrar nela.
 */
export function cancelamentoDeReuniao(dados: DadosDoConvite): string {
  return montar('CANCEL', dados, [
    'STATUS:CANCELLED',
    linha('DESCRIPTION', dados.descricao),
  ]);
}

function montar(
  metodo: 'REQUEST' | 'CANCEL',
  dados: DadosDoConvite,
  especificas: readonly string[],
): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LexIntegra//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    `METHOD:${metodo}`,
    ...blocoDeFuso(),
    'BEGIN:VEVENT',
    `UID:${dados.uid}`,
    `SEQUENCE:${String(dados.sequence)}`,
    `DTSTAMP:${emUtc(dados.dtstampMs)}`,
    `DTSTART;TZID=${FUSO.id}:${emHoraLocal(dados.inicio)}`,
    `DTEND;TZID=${FUSO.id}:${emHoraLocal(dados.fim)}`,
    linha('SUMMARY', dados.assunto),
    ...especificas,
    organizador(dados.organizador),
    participante(dados.participante),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  /* CRLF entre as linhas E no fim: o arquivo termina com quebra (RFC 5545). */
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
}

/** So `STANDARD`. Ver a nota sobre o bloco `DAYLIGHT` que NAO existe. */
function blocoDeFuso(): readonly string[] {
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${FUSO.id}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${FUSO.sufixo}`,
    `TZOFFSETTO:${FUSO.sufixo}`,
    'TZNAME:-03',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** `AAAAMMDDTHHMMSS`, a partir das partes UTC de um instante deslocado. */
function formatar(data: Date): string {
  return (
    `${String(data.getUTCFullYear()).padStart(4, '0')}` +
    `${doisDigitos(data.getUTCMonth() + 1)}` +
    `${doisDigitos(data.getUTCDate())}T` +
    `${doisDigitos(data.getUTCHours())}` +
    `${doisDigitos(data.getUTCMinutes())}` +
    `${doisDigitos(data.getUTCSeconds())}`
  );
}

/** `DTSTAMP` vai em UTC, com o `Z` — e o unico campo de data que nao usa `TZID`. */
function emUtc(ms: number): string {
  return `${formatar(new Date(ms))}Z`;
}

/**
 * A hora LOCAL do escritorio, sem `Z`, para acompanhar o `TZID`.
 *
 * Desloca com a constante deste arquivo, e nao com `Intl`: e o mesmo
 * deslocamento que o `VTIMEZONE` declara, e e o que garante que os dois
 * concordem. Ver a nota em `FUSO`.
 */
function emHoraLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Instante ilegivel no convite: "${iso}".`);
  }
  return formatar(new Date(ms + FUSO.deslocamentoHoras * MS_POR_HORA));
}

/* -------------------------------------------------------------------------- */
/* Texto                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Escape de valor TEXT (RFC 5545, 3.3.11).
 *
 * A BARRA VEM PRIMEIRO, sempre. Escapando o ponto e virgula antes, a barra que
 * ele introduz seria escapada de novo no passo seguinte e viraria `\\;` — um
 * convite com uma barra literal no lugar do separador.
 *
 * Os dois-pontos NAO sao escapados em TEXT: sao literais, e e por isso que um
 * link `https://...` na descricao passa inteiro.
 */
export function escaparTexto(valor: string): string {
  return valor
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n');
}

function linha(propriedade: string, valor: string): string {
  return `${propriedade}:${escaparTexto(valor)}`;
}

/**
 * Valor de PARAMETRO (`CN=`), que tem regra propria: nao usa barra invertida.
 * Um valor com `,`, `;` ou `:` precisa de aspas, e aspas nao podem aparecer
 * dentro — a unica saida do RFC e nao as ter.
 */
function parametro(valor: string): string {
  const limpo = valor.replaceAll('"', '').replaceAll(/[\r\n]/gu, ' ').trim();
  return /[,;:]/u.test(limpo) ? `"${limpo}"` : limpo;
}

function organizador(pessoa: Pessoa): string {
  return `ORGANIZER;CN=${parametro(pessoa.nome)}:mailto:${pessoa.email}`;
}

function participante(pessoa: Pessoa): string {
  return (
    `ATTENDEE;CN=${parametro(pessoa.nome)};ROLE=REQ-PARTICIPANT;` +
    `PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${pessoa.email}`
  );
}

/* -------------------------------------------------------------------------- */
/* Dobra de linha                                                              */
/* -------------------------------------------------------------------------- */

const LIMITE_OCTETOS = 75;

/**
 * Dobra em 75 OCTETOS, e nao em 75 caracteres (RFC 5545, 3.1).
 *
 * A diferenca aparece no primeiro nome com acento: "Joao Goncalves" tem menos
 * caracteres que octetos, e uma dobra contada em caracteres passaria do limite.
 * Pior, cortar no meio de uma sequencia UTF-8 produz bytes invalidos — e o
 * cliente de calendario mostra um losango preto no nome de quem convidou, ou
 * recusa o arquivo inteiro.
 *
 * A CONTINUACAO GASTA UM OCTETO com o espaco que a marca, entao da segunda linha
 * em diante cabem 74. Esquecer isso produz linhas de 76 octetos, que e
 * exatamente o erro que a dobra existe para evitar.
 */
export function dobrar(linhaCompleta: string): string {
  const bytes = Buffer.from(linhaCompleta, 'utf8');
  if (bytes.length <= LIMITE_OCTETOS) return linhaCompleta;

  const partes: string[] = [];
  let inicio = 0;

  while (inicio < bytes.length) {
    const cabem = partes.length === 0 ? LIMITE_OCTETOS : LIMITE_OCTETOS - 1;
    let fim = Math.min(inicio + cabem, bytes.length);

    /* Recua enquanto `fim` apontar para a continuacao (10xxxxxx) de um caractere. */
    while (fim > inicio && fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) {
      fim -= 1;
    }

    partes.push(bytes.subarray(inicio, fim).toString('utf8'));
    inicio = fim;
  }

  return partes.join('\r\n ');
}

/**
 * O endereco nu de dentro de `EMAIL_FROM`, que pode vir como `Nome <a@b.c>`.
 *
 * O `ORGANIZER` do iCalendar e um `mailto:` e nao aceita a forma com nome — um
 * `mailto:LexIntegra <x@y.z>` e endereco invalido, e o cliente de calendario
 * descarta o organizador inteiro, o que leva junto o botao de responder.
 */
export function enderecoDe(remetente: string): string {
  const comNome = /<([^>]+)>/u.exec(remetente);
  return (comNome?.[1] ?? remetente).trim();
}
