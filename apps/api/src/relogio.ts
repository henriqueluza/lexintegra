import { emEmulador } from './firebase/firebase.module.js';

/**
 * O relogio do servidor, com um valor fixo possivel SO sob emulador.
 *
 * POR QUE ISTO EXISTE. As telas da Etapa 10 dependem da data real: a lista de
 * horarios so mostra a semana corrente e a seguinte (ADR-06), e a agenda do
 * advogado so mostra o futuro. Uma jornada autenticada e uma imagem de
 * regressao visual construidas sobre `Date.now()` mudariam de resultado todo
 * dia — e a suite de paineis ja registra por que isso e inaceitavel: "um
 * baseline que precisa ser regravado por calendario treina a equipe a regravar
 * sem olhar, que e como uma suite de regressao visual morre".
 *
 * O navegador fixa o dele com `page.clock.setFixedTime`; este e o outro lado.
 * Os dois precisam concordar, senao a tela pede horarios de uma semana e o
 * servidor responde os de outra.
 *
 * SO SOB EMULADOR, E O BOOT CAI SE NAO FOR. Um relogio fixo em producao
 * congelaria a janela de validade das reunioes, a regra das 24 horas e a
 * antecedencia minima — todas as tres decidem coisas que valem dinheiro ou
 * compromisso. A variavel nao tem uso legitimo fora de teste, e um servico que
 * subisse "saudavel" com o tempo parado so apareceria quando um cliente
 * reclamasse de um horario que nao devia estar disponivel.
 *
 * Lido UMA VEZ e memoizado: o relogio nao muda no meio da execucao, e reler a
 * cada chamada so daria chance de ele mudar.
 */
const VARIAVEL = 'RELOGIO_FIXO';

let fixo: number | null | undefined;

export function agora(): number {
  if (fixo === undefined) fixo = lerRelogioFixo();
  return fixo ?? Date.now();
}

/** Para o teste do proprio relogio. Nenhum codigo de producao chama. */
export function esquecerRelogio(): void {
  fixo = undefined;
}

export function lerRelogioFixo(
  ambiente: NodeJS.ProcessEnv = process.env,
): number | null {
  const bruto = ambiente[VARIAVEL];
  if (bruto === undefined || bruto.trim() === '') return null;

  if (!emEmulador(ambiente)) {
    throw new Error(
      `${VARIAVEL} so e aceita sob emulador. Um relogio fixo congelaria a ` +
        'janela de validade das reunioes, a regra das 24 horas e a antecedencia ' +
        'minima — recusando subir com o tempo parado.',
    );
  }

  const ms = Date.parse(bruto.trim());
  if (Number.isNaN(ms)) {
    throw new Error(
      `${VARIAVEL} invalida: "${bruto}". Use um instante ISO 8601.`,
    );
  }

  return ms;
}
