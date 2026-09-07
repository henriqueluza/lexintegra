/**
 * Centavos para reais, na forma que se le.
 *
 * Fora de `paginas/admin-produtos/valores.ts` porque agora tem dois consumidores
 * em lados opostos da fronteira de autenticacao: o painel administrativo e a
 * vitrine publica. Deixa-la la faria a home carregar o arquivo que sabe LER preco
 * digitado por administrador — codigo que a pagina publica nao tem por que
 * conhecer.
 *
 * O caminho inverso (texto digitado para centavos) continua sendo assunto do
 * formulario administrativo, e continua la.
 */
export function paraReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
