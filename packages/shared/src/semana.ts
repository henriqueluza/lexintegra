/**
 * A semana de disponibilidade do advogado (item 2.6.3, ADR-06).
 *
 * O ADR-06 fixa que a plataforma e a fonte da verdade e que o advogado registra
 * seus dias e horarios SEMANALMENTE, as segundas. A arquitetura, secao 8,
 * acrescenta a consequencia de projeto: em vez de uma rotina agendada que "abre"
 * a semana toda segunda, o sistema CALCULA a semana corrente no momento da
 * leitura. Isso elimina uma peca movel — e os tres jobs gratuitos do Cloud
 * Scheduler ja estao ocupados.
 *
 * ESTE ARQUIVO E O CALCULO. E aritmetica de calendario pura, sem dependencia e
 * sem estado, e por isso testavel sozinho.
 *
 * O FUSO E EXPLICITO, E ISSO NAO E DETALHE. O Cloud Run roda em UTC. Numa noite
 * de domingo brasileira — 22h em Sao Paulo, ja segunda 01h em UTC — um calculo
 * que usasse o fuso do processo devolveria a semana SEGUINTE para o advogado que
 * ainda esta no domingo. Ele nao veria um erro: veria a grade da semana errada,
 * e marcaria disponibilidade em dias que nao pretendia.
 */
const FUSO = 'America/Sao_Paulo';

/** Segunda e 1, domingo e 7 — a numeracao da ISO 8601, nao a do `Date`, onde
 * domingo e 0 e a subtracao para achar a segunda vira caso especial. */
const NUMERO_DO_DIA: Readonly<Record<string, number>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/* `en-CA` porque o formato dele e exatamente `AAAA-MM-DD`. Montar a string a mao
 * a partir de `formatToParts` daria o mesmo resultado com mais codigo. */
const formatadorDeData = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatadorDeDia = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  weekday: 'short',
});

const MS_POR_DIA = 86_400_000;

/** A data civil brasileira de um instante, como `AAAA-MM-DD`. */
export function dataLocal(instante: Date): string {
  return formatadorDeData.format(instante);
}

/**
 * Soma (ou subtrai) dias de uma data civil.
 *
 * Passa por `Date.UTC` de proposito: e aritmetica de CALENDARIO sobre uma data
 * sem hora, nao deslocamento de um instante. Fazer a conta sobre um instante no
 * fuso de Sao Paulo daria errado duas vezes por ano — o dia do horario de verao
 * tem 23 ou 25 horas, e "somar 24 horas" deixaria de ser "somar um dia". O
 * Brasil nao tem horario de verao hoje, mas ja teve e pode voltar a ter, e essa
 * e a classe de defeito que so aparece em outubro.
 */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const deslocado = new Date(Date.UTC(ano, mes - 1, dia) + dias * MS_POR_DIA);
  return deslocado.toISOString().slice(0, 10);
}

/**
 * A semana a que um instante pertence, identificada pela SEGUNDA-FEIRA dela.
 *
 * A identidade da semana e a data da segunda, e nao um par ano/numero: `2026-09-07`
 * ordena, compara e soma sem nenhuma tabela de conversao, e nao tem a armadilha da
 * semana ISO 1, que pode comecar em dezembro do ano anterior.
 */
export function semanaDe(instante: Date): string {
  const numero = NUMERO_DO_DIA[formatadorDeDia.format(instante)];
  return somarDias(dataLocal(instante), -(numero - 1));
}

/** O domingo que fecha a semana. */
export function fimDaSemana(semana: string): string {
  return somarDias(semana, 6);
}

export function semanaSeguinte(semana: string): string {
  return somarDias(semana, 7);
}

/** `true` se a data civil de `instante`, no Brasil, cai dentro da semana. */
export function dentroDaSemana(instante: Date, semana: string): boolean {
  const data = dataLocal(instante);
  return data >= semana && data <= fimDaSemana(semana);
}

/**
 * As semanas que o advogado pode editar: a corrente e a seguinte.
 *
 * Duas, e nao uma, porque o registro acontece as segundas (ADR-06) e quem
 * registra na segunda de manha esta planejando a semana que comeca ali — mas
 * quem lembra na sexta precisa alcancar a proxima. Nao mais que duas: grade
 * aberta indefinidamente vira compromisso que ninguem lembra de ter assumido.
 */
export function semanasEditaveis(agora: Date): readonly [string, string] {
  const corrente = semanaDe(agora);
  return [corrente, semanaSeguinte(corrente)];
}
