import {
  cancelamentoDeReuniao,
  conviteDeReuniao,
  dobrar,
  enderecoDe,
  escaparTexto,
  type DadosDoConvite,
} from './icalendar.js';

/* 24/09/2026, quinta, 14h em Sao Paulo = 17h UTC. */
const BASE: DadosDoConvite & { link: string } = {
  uid: 'reuniao-pedido-1-r001@lexintegra.com.br',
  sequence: 0,
  inicio: '2026-09-24T17:00:00.000Z',
  fim: '2026-09-24T18:00:00.000Z',
  assunto: 'Reuniao: Revisao de contrato comercial',
  descricao: 'Reuniao do seu pedido na LexIntegra.',
  organizador: { nome: 'LexIntegra', email: 'onboarding@resend.dev' },
  participante: { nome: 'Clara Dias', email: 'clara@exemplo.test' },
  dtstampMs: Date.parse('2026-09-20T12:30:45.000Z'),
  link: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc',
};

function linhas(ics: string): string[] {
  return ics.split('\r\n');
}

/**
 * Desfaz a dobra e procura DENTRO do VEVENT.
 *
 * O recorte nao e zelo: o bloco `VTIMEZONE` tambem tem um `DTSTART`
 * (`19700101T000000`), e ele vem ANTES no arquivo. Uma busca na linha toda
 * encontraria aquele e o teste do horario da reuniao passaria a afirmar o
 * horario do fuso.
 */
function propriedade(ics: string, nome: string): string | undefined {
  const desdobrado = ics.replaceAll('\r\n ', '').split('\r\n');
  const evento = desdobrado.slice(
    desdobrado.indexOf('BEGIN:VEVENT'),
    desdobrado.indexOf('END:VEVENT'),
  );

  return evento.find(
    (l) => l.startsWith(`${nome}:`) || l.startsWith(`${nome};`),
  );
}

describe('conviteDeReuniao', () => {
  const ics = conviteDeReuniao(BASE);

  it('e um VCALENDAR com METHOD:REQUEST', () => {
    expect(linhas(ics)[0]).toBe('BEGIN:VCALENDAR');
    expect(ics).toContain('METHOD:REQUEST\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
  });

  /** Toda linha termina em CRLF, inclusive a ultima (RFC 5545). */
  it('usa CRLF em toda quebra, inclusive no fim', () => {
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('leva o UID e o SEQUENCE recebidos', () => {
    expect(propriedade(ics, 'UID')).toBe(`UID:${BASE.uid}`);
    expect(propriedade(ics, 'SEQUENCE')).toBe('SEQUENCE:0');
  });

  /**
   * DTSTART sai como hora LOCAL com TZID — 14h em Sao Paulo, nao 17h UTC. O
   * `Z` aqui seria outro instante para quem le pelo TZID.
   */
  it('escreve DTSTART e DTEND em hora local, com TZID', () => {
    expect(propriedade(ics, 'DTSTART')).toBe(
      'DTSTART;TZID=America/Sao_Paulo:20260924T140000',
    );
    expect(propriedade(ics, 'DTEND')).toBe(
      'DTEND;TZID=America/Sao_Paulo:20260924T150000',
    );
  });

  /** DTSTAMP e o unico campo de data em UTC, com o `Z`. */
  it('escreve DTSTAMP em UTC', () => {
    expect(propriedade(ics, 'DTSTAMP')).toBe('DTSTAMP:20260920T123045Z');
  });

  /**
   * ADR-21, decisao E: `VTIMEZONE` fixo em -03:00 e SEM bloco `DAYLIGHT`. O
   * Brasil nao tem horario de verao hoje, e um bloco escrito "por precaucao"
   * descreveria uma regra que nao existe — os clientes a aplicariam, e as
   * reunioes andariam uma hora numa parte do ano.
   */
  it('traz um VTIMEZONE de -0300, sem DAYLIGHT', () => {
    expect(ics).toContain('BEGIN:VTIMEZONE\r\n');
    expect(ics).toContain('TZID:America/Sao_Paulo\r\n');
    expect(ics).toContain('TZOFFSETFROM:-0300\r\n');
    expect(ics).toContain('TZOFFSETTO:-0300\r\n');
    expect(ics).not.toContain('DAYLIGHT');
  });

  it('o bloco de fuso sai exatamente nesta forma', () => {
    const desdobrado = ics.replaceAll('\r\n ', '').split('\r\n');
    const inicio = desdobrado.indexOf('BEGIN:VTIMEZONE');
    const fim = desdobrado.indexOf('END:VTIMEZONE');

    expect(desdobrado.slice(inicio, fim + 1)).toEqual([
      'BEGIN:VTIMEZONE',
      'TZID:America/Sao_Paulo',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:-0300',
      'TZOFFSETTO:-0300',
      'TZNAME:-03',
      'END:STANDARD',
      'END:VTIMEZONE',
    ]);
  });

  it('poe o organizador e o participante como mailto', () => {
    expect(propriedade(ics, 'ORGANIZER')).toBe(
      'ORGANIZER;CN=LexIntegra:mailto:onboarding@resend.dev',
    );
    expect(propriedade(ics, 'ATTENDEE')).toContain(
      'mailto:clara@exemplo.test',
    );
    expect(propriedade(ics, 'ATTENDEE')).toContain('RSVP=TRUE');
  });

  /** Regra inviolavel 13: o link vem da Graph API e aparece inteiro. */
  it('leva o link na descricao, na localizacao e na URL', () => {
    expect(propriedade(ics, 'DESCRIPTION')).toContain(BASE.link);
    expect(propriedade(ics, 'LOCATION')).toContain(BASE.link);
    expect(propriedade(ics, 'URL')).toContain(BASE.link);
  });

  it('marca o evento como confirmado', () => {
    expect(ics).toContain('STATUS:CONFIRMED\r\n');
  });

  it('recusa instante ilegivel em vez de escrever data invalida', () => {
    expect(() => conviteDeReuniao({ ...BASE, inicio: 'quinta' })).toThrow(
      /ilegivel/,
    );
  });
});

describe('cancelamentoDeReuniao', () => {
  /**
   * O CRITERIO DE ACEITE DA ETAPA, do lado do formato: o cancelamento usa o
   * MESMO `UID` com `SEQUENCE` maior. Com `UID` diferente, o calendario do
   * destinatario cancelaria um evento que nao existe e deixaria o real na
   * agenda.
   */
  it('reusa o UID e sobe o SEQUENCE', () => {
    const ics = cancelamentoDeReuniao({ ...BASE, sequence: 3 });

    expect(propriedade(ics, 'UID')).toBe(`UID:${BASE.uid}`);
    expect(propriedade(ics, 'SEQUENCE')).toBe('SEQUENCE:3');
    expect(ics).toContain('METHOD:CANCEL\r\n');
    expect(ics).toContain('STATUS:CANCELLED\r\n');
  });

  /** A sala continua existindo (ADR-21, decisao 7); repetir o link convidaria
   * a entrar nela. */
  it('nao leva o link', () => {
    const ics = cancelamentoDeReuniao(BASE);
    expect(ics).not.toContain('teams.microsoft.com');
  });
});

describe('a remarcacao atualiza em vez de duplicar', () => {
  it('mesmo UID, SEQUENCE maior, horario novo', () => {
    const primeiro = conviteDeReuniao(BASE);
    const segundo = conviteDeReuniao({
      ...BASE,
      sequence: 1,
      inicio: '2026-10-01T17:00:00.000Z',
      fim: '2026-10-01T18:00:00.000Z',
    });

    expect(propriedade(segundo, 'UID')).toBe(propriedade(primeiro, 'UID'));
    expect(propriedade(primeiro, 'SEQUENCE')).toBe('SEQUENCE:0');
    expect(propriedade(segundo, 'SEQUENCE')).toBe('SEQUENCE:1');
    expect(propriedade(segundo, 'DTSTART')).toBe(
      'DTSTART;TZID=America/Sao_Paulo:20261001T140000',
    );
  });
});

describe('escaparTexto', () => {
  /**
   * A BARRA PRIMEIRO. Escapando o ponto e virgula antes, a barra que ele
   * introduz seria escapada de novo e viraria `\\;` — uma barra literal no
   * lugar do separador.
   */
  it('escapa a barra antes de tudo', () => {
    expect(escaparTexto('a\\b;c')).toBe('a\\\\b\\;c');
  });

  it.each([
    [';', '\\;'],
    [',', '\\,'],
    ['\n', '\\n'],
    ['\r\n', '\\n'],
    ['\r', '\\n'],
  ])('escapa %j', (entrada, esperado) => {
    expect(escaparTexto(entrada)).toBe(esperado);
  });

  /** Dois-pontos e literal em TEXT: e o que faz um link passar inteiro. */
  it('nao toca nos dois-pontos', () => {
    expect(escaparTexto('https://x.test/a')).toBe('https://x.test/a');
  });

  it('escapa dentro de uma descricao de verdade', () => {
    const ics = conviteDeReuniao({
      ...BASE,
      descricao: 'Pauta: clausula 7a; prazos, riscos\ne a minuta C:\\contrato',
    });

    expect(propriedade(ics, 'DESCRIPTION')).toContain(
      'Pauta: clausula 7a\\; prazos\\, riscos\\ne a minuta C:\\\\contrato',
    );
  });
});

describe('dobrar', () => {
  it('deixa linha curta intacta', () => {
    expect(dobrar('SUMMARY:curta')).toBe('SUMMARY:curta');
  });

  it('deixa linha de exatamente 75 octetos intacta', () => {
    const linha = 'X'.repeat(75);
    expect(dobrar(linha)).toBe(linha);
  });

  it('dobra a partir de 76 octetos', () => {
    const dobrada = dobrar('X'.repeat(76));

    expect(dobrada).toBe(`${'X'.repeat(75)}\r\n X`);
  });

  /**
   * A CONTINUACAO GASTA UM OCTETO com o espaco que a marca. Sem descontar,
   * saem linhas de 76 octetos — o erro exato que a dobra existe para evitar.
   */
  it('nenhuma linha passa de 75 octetos, contando o espaco da continuacao', () => {
    const dobrada = dobrar(`DESCRIPTION:${'a'.repeat(400)}`);

    for (const linha of dobrada.split('\r\n')) {
      expect(Buffer.byteLength(linha, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  /**
   * DOBRA EM OCTETOS, NAO EM CARACTERES, e sem cortar sequencia UTF-8 ao meio.
   * Um corte no meio de um caractere produz bytes invalidos, e o cliente mostra
   * um losango preto — ou recusa o arquivo.
   */
  it('nao corta caractere multibyte ao meio', () => {
    const dobrada = dobrar(`SUMMARY:${'ç'.repeat(80)}`);

    for (const linha of dobrada.split('\r\n')) {
      expect(Buffer.byteLength(linha, 'utf8')).toBeLessThanOrEqual(75);
      expect(linha).not.toContain('\uFFFD');
    }
  });

  /** Desdobrar (tirar CRLF + espaco) devolve exatamente o original. */
  it.each([
    ['ascii longo', `DESCRIPTION:${'a'.repeat(300)}`],
    ['acentos', `SUMMARY:${'çãé'.repeat(60)}`],
    ['emoji (4 octetos)', `SUMMARY:${'🙂'.repeat(40)}`],
    ['limite exato', 'Y'.repeat(75)],
    ['um a mais', 'Y'.repeat(76)],
  ])('e reversivel: %s', (_caso, original) => {
    expect(dobrar(original).replaceAll('\r\n ', '')).toBe(original);
  });

  it('o convite inteiro respeita o limite em toda linha', () => {
    const ics = conviteDeReuniao({
      ...BASE,
      assunto: `Reuniao: ${'Revisao de contrato comercial e societario '.repeat(3)}`,
      participante: { nome: 'Joao Gonçalves de Assunção', email: 'j@x.test' },
    });

    for (const linha of linhas(ics)) {
      expect(Buffer.byteLength(linha, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});

describe('enderecoDe', () => {
  /**
   * `mailto:LexIntegra <x@y.z>` e endereco invalido: o cliente descarta o
   * organizador inteiro, e o botao de responder vai junto.
   */
  it.each([
    ['endereco nu', 'onboarding@resend.dev', 'onboarding@resend.dev'],
    ['com nome', 'LexIntegra <nao-responda@x.test>', 'nao-responda@x.test'],
    ['com espacos', '  a@b.test  ', 'a@b.test'],
  ])('%s', (_caso, entrada, esperado) => {
    expect(enderecoDe(entrada)).toBe(esperado);
  });
});
