/**
 * Normalizacao de texto para BUSCA, nao para exibicao.
 *
 * A arquitetura 5.5 resolve o item 2.5.8 (busca por nome, e-mail ou produto
 * contratado) com campos denormalizados no documento do cliente:
 * `nomeNormalizado` e `emailNormalizado`. Esta funcao e a unica que produz esses
 * valores, e ela vive em `shared` porque a mesma normalizacao precisa acontecer
 * nos DOIS lados — o servidor grava o campo, e o formulario de busca do
 * administrador normaliza o termo digitado antes de mandar. Duas implementacoes
 * divergiriam no primeiro acento.
 *
 * O QUE ELA FAZ, E POR QUE CADA PASSO EXISTE:
 *
 * - `NFD` mais remocao de marcas combinantes: "Jose" e "Jose" com acento agudo
 *   viram a mesma coisa. Sem isso, quem digita sem acento — que e a maioria, num
 *   campo de busca — nao encontra ninguem.
 * - minusculas: o Firestore compara string byte a byte, entao "Silva" e "silva"
 *   seriam registros distintos numa ordenacao.
 * - espacos colapsados: "Ana  Maria" colado de outra tela nao pode deixar de
 *   casar com "Ana Maria".
 *
 * O QUE ELA NAO FAZ: nao remove pontuacao nem hifen. "Sant'Ana" e "Sant Ana" sao
 * nomes diferentes para efeito de busca, e apagar a diferenca produziria falso
 * positivo sem pedido de ninguem.
 */
export function normalizarParaBusca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
