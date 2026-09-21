import type { Page } from '@playwright/test';
import { CONTAS, entrar, expect, test } from './pilha';

/**
 * Marcar, remarcar e cancelar uma reuniao, sobre a pilha inteira (Etapa 10).
 *
 * O QUE SO A JORNADA PROVA. Os servicos tem suite de integracao contra o
 * emulador e os componentes tem suite de unidade — mas entre eles ha uma
 * fronteira que nenhuma das duas atravessa: a tela pede horarios ao servidor, o
 * servidor responde com os slots que a SEMENTE publicou, e a tela os desenha.
 * Caminho de rota errado, campo com outro nome no JSON, relogios em desacordo
 * entre os dois lados — nada disso aparece nas outras suites.
 *
 * O RELOGIO E FIXO NOS TRES LADOS (`pilha.ts` para o navegador e a semente,
 * `playwright.pilha.config.ts` para a API). Sem isso esta jornada mudaria de
 * resultado todo dia: a lista de horarios so mostra a semana corrente e a
 * seguinte (ADR-06), e a tela decide com as MESMAS funcoes de
 * `shared/regras-reuniao` que o servidor usa — com relogios diferentes, ela
 * ofereceria remarcar num horario que o servidor recusa por estar dentro das 24
 * horas.
 *
 * O pedido `clara-contrato` ja nasce distribuido para a Ana, e e o que permite
 * marcar sem passar pela distribuicao. O outro pedido da Clara nao tem advogado,
 * entao o botao de marcar nao existe nele: `.first()` acha sempre o certo.
 */

/** O primeiro item de um `app-selecao`: o indice 0 e o marcador, desabilitado. */
const PRIMEIRO_HORARIO = { index: 1 };

async function comoClara(page: Page): Promise<void> {
  await entrar(page, CONTAS.cliente);
  await page.goto('/painel');
  await expect(page.getByRole('heading').first()).toBeVisible();
}

/**
 * Marca a primeira reuniao do pedido distribuido e espera a tela voltar.
 *
 * A REUNIAO NASCE SEM SALA, e e esse o estado que o cliente ve primeiro: a sala
 * e criada pelo outbox, e a tela recarrega antes de o despacho terminar. A regra
 * inviolavel 13 exige que a ausencia do link seja DITA — nunca um link vazio,
 * nunca o de outra reuniao —, e e isso que a espera afirma.
 */
async function marcar(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /Marcar reuni/i })
    .first()
    .click();

  const horario = page.getByLabel('Horário').first();
  await expect(horario).toBeVisible();
  await horario.selectOption(PRIMEIRO_HORARIO);
  await page.getByRole('button', { name: /Confirmar reuni/i }).click();

  await expect(
    page.getByText(/Link a caminho|Abrir sala/).first(),
  ).toBeVisible();
}

test.describe('reuniao', () => {
  test('o cliente marca, remarca e cancela', async ({ page }) => {
    await comoClara(page);

    /* O pedido contrata duas reunioes e comeca sem nenhuma usada. */
    await expect(page.getByText('0/2').first()).toBeVisible();

    await marcar(page);
    await expect(page.getByText('1/2').first()).toBeVisible();

    /* ---------------------------------------------------------------- */
    /* Remarcar                                                          */
    /* ---------------------------------------------------------------- */

    await page.getByRole('button', { name: 'Remarcar' }).first().click();
    const novo = page.getByLabel('Novo horário').first();
    await expect(novo).toBeVisible();
    await novo.selectOption(PRIMEIRO_HORARIO);
    await page.getByRole('button', { name: /Confirmar novo hor/i }).click();

    /*
     * A reuniao continua UMA, e o saldo continua o mesmo: remarcar ATUALIZA o
     * documento (ADR-21, decisao A). Se algum dia ela passar a ser apagada e
     * recriada, e aqui que aparece — com duas na lista, ou com 2/2 no saldo.
     */
    await expect(page.locator('.reuniao')).toHaveCount(1);
    await expect(page.getByText('1/2').first()).toBeVisible();

    /* ---------------------------------------------------------------- */
    /* Cancelar                                                          */
    /* ---------------------------------------------------------------- */

    /*
     * A tela diz ANTES do clique se o cancelamento devolve o credito. Os slots
     * da semente ficam a tres dias do relogio fixo, entao devolve — e a frase
     * inteira importa: a versao negativa contem a mesma cauda ("NAO devolve a
     * reuniao ao saldo") e casaria com um trecho mais curto.
     */
    await expect(
      page.getByText('Cancelar agora devolve a reunião ao saldo'),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /^Cancelar$/ })
      .first()
      .click();

    /* Some da lista, e o credito volta de verdade. */
    await expect(page.locator('.reuniao')).toHaveCount(0);
    await expect(page.getByText('0/2').first()).toBeVisible();
  });

  /**
   * O OUTRO LADO DA MESMA RESERVA. O advogado nao marca nada: ele ve na agenda o
   * que o cliente marcou, com o nome de quem marcou (item 2.6.2). E o unico
   * teste que atravessa os dois perfis pelo mesmo dado.
   */
  test('o advogado ve na agenda o que o cliente marcou', async ({ page }) => {
    await comoClara(page);
    await marcar(page);

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.advogado);
    await page.goto('/advogado/agenda');

    /* O nome vem de `clientes/{uid}`, com acento — nao do `displayName` do Auth. */
    await expect(page.getByText('Clara Nunes de Sá')).toBeVisible();
    /* Sem sala ainda: a agenda tambem diz, em vez de mostrar coluna vazia. */
    await expect(page.getByText(/Link a caminho|Abrir sala/)).toBeVisible();
  });
});
