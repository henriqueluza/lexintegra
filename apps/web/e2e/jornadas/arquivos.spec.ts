import { CONTAS, entrar, estadoDoArquivo, expect, test } from './pilha';

/**
 * Upload do entregavel, varredura e a REGRA INVIOLAVEL 6 (Etapa 11).
 *
 * "Nenhum arquivo e servido com status diferente de `limpo`." A suite de unidade
 * prova que o portao recusa e a de integracao prova o ciclo dentro da API. O que
 * so esta jornada prova e o caminho completo com navegador: pedido de URL
 * assinada, PUT do arquivo, confirmacao, veredito, e a tela do cliente do outro
 * lado — que e onde a regra vira consequencia visivel.
 *
 * NADA DE EICAR AQUI. O plano reserva o teste com EICAR para validacao humana, e
 * nenhum byte dele existe neste repositorio (decisao da Etapa 11). O que reprova
 * o arquivo e um marcador do PROJETO, que so o dublê de desenvolvimento conhece
 * (`MARCADOR_DE_REPROVACAO`, em `varredura/scanner.ts`) — em producao o dublê nem
 * existe, porque a API recusa subir sem `URL_SCANNER`.
 */
const PDF_LIMPO = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
);

/** PDF de verdade nos primeiros bytes — passa nos magic bytes — com o marcador. */
const PDF_COM_MARCADOR = Buffer.from(
  `%PDF-1.4\n% LEXINTEGRA-ARQUIVO-DE-TESTE-REPROVAR\ntrailer<<>>\n%%EOF\n`,
);

/** Nem finge ser PDF: e a segunda conferencia, a dos magic bytes. */
const HTML_DISFARCADO = Buffer.from('<!doctype html><p>nao sou um pdf</p>');

async function iniciarTrabalho(
  page: Parameters<typeof entrar>[0],
): Promise<void> {
  await entrar(page, CONTAS.advogado);
  await page.getByRole('button', { name: 'Iniciar trabalho' }).first().click();
  await expect(page.getByText('Enviar entregavel').first()).toBeVisible();
}

test.describe('arquivos', () => {
  test('o entregavel limpo chega ao cliente', async ({ page }) => {
    await iniciarTrabalho(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'parecer.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_LIMPO,
    });

    await expect
      .poll(() => estadoDoArquivo('clara-contrato', '001'), { timeout: 15_000 })
      .toBe('limpo');

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.cliente);

    await expect(
      page.getByRole('button', { name: 'Aceitar termos e baixar' }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  /**
   * O CASO QUE A REGRA 6 EXISTE PARA IMPEDIR. O arquivo reprovado nao pode
   * aparecer como baixavel em momento nenhum — e a tela do cliente e onde isso
   * se ve.
   */
  test('o arquivo reprovado nunca vira download', async ({ page }) => {
    await iniciarTrabalho(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'parecer.pdf',
      mimeType: 'application/pdf',
      buffer: PDF_COM_MARCADOR,
    });

    /*
     * O ESTADO PRIMEIRO, E A TELA DEPOIS. A tela mostra "em verificacao" tanto
     * para `pendente_scan` quanto para `infectado`, entao so olhar para ela
     * deixaria este teste verde mesmo com a varredura sem rodar — foi o que
     * aconteceu enquanto o upload em desenvolvimento estava quebrado.
     */
    await expect
      .poll(() => estadoDoArquivo('clara-contrato', '001'), { timeout: 15_000 })
      .toBe('infectado');

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.cliente);

    await expect(
      page.getByText('Arquivo em verificacao de seguranca.').first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Aceitar termos e baixar' }),
    ).toHaveCount(0);
  });

  /**
   * A SEGUNDA CONFERENCIA, que o antivirus nao faz: "isto e mesmo um PDF?". Um
   * HTML com extensao `.pdf` passa limpo por qualquer ClamAV — e continua sendo
   * um arquivo que o navegador executaria como pagina.
   */
  test('o que nao e PDF e recusado pelos magic bytes', async ({ page }) => {
    await iniciarTrabalho(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'parecer.pdf',
      mimeType: 'application/pdf',
      buffer: HTML_DISFARCADO,
    });

    await expect
      .poll(() => estadoDoArquivo('clara-contrato', '001'), { timeout: 15_000 })
      .toBe('rejeitado');

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.cliente);

    await expect(
      page.getByRole('button', { name: 'Aceitar termos e baixar' }),
    ).toHaveCount(0);
  });
});
