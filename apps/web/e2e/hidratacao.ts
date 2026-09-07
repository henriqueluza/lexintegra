import { expect, type Page } from '@playwright/test';

/**
 * Espera a aplicacao estar VIVA, provando isso por interacao.
 *
 * A pagina e pre-renderizada: os campos existem no HTML servido antes de o
 * Angular hidratar, e o que a pessoa digitar nessa janela e perdido — o
 * formulario reativo escreve o modelo vazio por cima quando inicializa.
 *
 * Duas tentativas anteriores nao resolveram, e vale registrar por que. Preencher
 * e conferir o valor falha porque a conferencia acontece contra o DOM
 * pre-hidratacao e o apagamento vem depois. Esperar por um marcador de hidratacao
 * tambem nao serve: o build de desenvolvimento nao emite `ngh`, entao nao ha
 * marcador estavel para depender.
 *
 * O que funciona e pedir a aplicacao para FAZER alguma coisa que so o codigo
 * hidratado faz — enviar o formulario vazio e ver a validacao responder. Depois
 * disso o Angular esta no controle e o preenchimento fica.
 *
 * O CLIQUE E REPETIDO, e essa e a parte que faltava. Um clique unico e uma aposta
 * de que a hidratacao ja aconteceu: quando ele cai antes, o evento se perde no
 * HTML estatico, nada responde, e nenhuma espera posterior conserta — o clique
 * nao volta a acontecer sozinho. O sintoma era falha intermitente em
 * `publico.spec.ts` e em `publico.a11y.spec.ts`, sempre nesta linha, sempre em
 * uma largura so, mudando de largura a cada execucao. Reproduzido rodando a suite
 * inteira em paralelo no conteiner, onde o servidor de desenvolvimento demora mais
 * a entregar o pacote.
 *
 * Clicar de novo e inofensivo: com o formulario vazio, o envio so aciona a
 * validacao e nao chega a tocar a rede — que e justamente o que os testes de
 * "nenhuma chamada a API" verificam logo depois.
 */
export async function esperarHidratacao(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: 'Criar acesso' });
  const aviso = page.getByText('Campo obrigatório.').first();

  await expect(async () => {
    await botao.click();
    await expect(aviso).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
}
