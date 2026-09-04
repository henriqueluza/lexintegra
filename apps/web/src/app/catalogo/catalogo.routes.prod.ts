import type { Routes } from '@angular/router';

/**
 * Substituto de `catalogo.routes.ts` no build de producao, via `fileReplacements`
 * no angular.json.
 *
 * Uma lista vazia, e nao um `if (isDevMode())` dentro do arquivo real: a diferenca
 * e que aqui o `import()` de cada secao deixa de existir no grafo de modulos, e o
 * empacotador remove o catalogo inteiro. Com uma guarda em tempo de execucao, o
 * codigo continuaria no pacote publicado, so inalcancavel.
 */
export const catalogoRoutes: Routes = [];
