import { Routes } from '@angular/router';
import { catalogoRoutes } from './catalogo/catalogo.routes';
import { exigirAutenticacao, exigirPerfil } from './autenticacao/guardas';

/**
 * Regra inviolavel 10: rota publica nao chama a API antes do pre-cadastro. E a
 * mitigacao de cold start do Cloud Run (arquitetura, secao 3.1) — quebrar isso
 * derruba a performance da pagina de captacao.
 *
 * As rotas PUBLICAS abaixo continuam sem resolver e sem guard, e `app.routes.spec.ts`
 * verifica isso nominalmente. As rotas autenticadas tem guard de proposito: elas
 * nao sao caminho de captacao, e o guard delas nao dispara HTTP nenhum — le a
 * sessao que o SDK do Firebase ja restaurou.
 */
export const ROTAS_PUBLICAS = [
  '',
  'entrar',
  'recuperar-senha',
  'definir-senha',
];

export const routes: Routes = [
  /*
   * O catalogo de componentes so existe em desenvolvimento: em producao o
   * angular.json troca `catalogo.routes.ts` por um arquivo que exporta lista
   * vazia, e o empacotador remove o catalogo do pacote publicado.
   */
  ...catalogoRoutes,
  {
    path: '',
    loadComponent: () =>
      import('./paginas/landing/landing').then((m) => m.Landing),
    title: 'LexIntegra',
  },
  {
    path: 'entrar',
    loadComponent: () =>
      import('./paginas/entrar/entrar').then((m) => m.Entrar),
    title: 'Entrar — LexIntegra',
  },
  {
    path: 'recuperar-senha',
    loadComponent: () =>
      import('./paginas/recuperar-senha/recuperar-senha').then(
        (m) => m.RecuperarSenha,
      ),
    title: 'Redefinir senha — LexIntegra',
  },
  {
    path: 'definir-senha',
    loadComponent: () =>
      import('./paginas/definir-senha/definir-senha').then(
        (m) => m.DefinirSenha,
      ),
    title: 'Definir senha — LexIntegra',
  },

  /*
   * Area autenticada. A shell e quem declara `data-direcao="pauta"`, entao tudo
   * abaixo dela troca de direcao visual por heranca de custom property.
   *
   * `canMatch` e nao `canActivate`: com `canMatch`, a rota que nao casa nem
   * carrega o chunk do componente. O ganho nao e de seguranca — o pacote inteiro
   * esta no navegador de qualquer jeito — e sim nao baixar o codigo do painel
   * administrativo para quem nunca vai abri-lo.
   */
  /*
   * AREA DO CLIENTE e AREA DO ADVOGADO sao arvores SEPARADAS desde a Etapa 9.
   *
   * Ate a Etapa 6 `/painel` servia aos dois perfis com uma tela de espera. As
   * areas de verdade nao se parecem: uma tem cartoes de pedido, a outra tem
   * demandas distribuidas e grade de disponibilidade. Um `/painel` compartilhado
   * teria que ramificar por perfil dentro do componente — e ramificacao por
   * perfil dentro de tela e como uma delas acaba mostrando o que a outra deveria.
   */
  {
    path: 'painel',
    canMatch: [exigirAutenticacao, exigirPerfil('cliente')],
    loadComponent: () =>
      import('./shell/shell-autenticada').then((m) => m.ShellAutenticada),
    title: 'Meus pedidos — LexIntegra',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./paginas/cliente-pedidos/cliente-pedidos').then(
            (m) => m.ClientePedidos,
          ),
        title: 'Meus pedidos — LexIntegra',
      },
    ],
  },
  {
    path: 'advogado',
    canMatch: [exigirAutenticacao, exigirPerfil('advogado')],
    loadComponent: () =>
      import('./shell/shell-autenticada').then((m) => m.ShellAutenticada),
    title: 'Minhas demandas — LexIntegra',
    children: [
      {
        path: '',
        redirectTo: 'demandas',
        pathMatch: 'full',
      },
      {
        path: 'demandas',
        loadComponent: () =>
          import('./paginas/advogado-demandas/advogado-demandas').then(
            (m) => m.AdvogadoDemandas,
          ),
        title: 'Minhas demandas — LexIntegra',
      },
      {
        path: 'disponibilidade',
        loadComponent: () =>
          import('./paginas/advogado-disponibilidade/advogado-disponibilidade').then(
            (m) => m.AdvogadoDisponibilidade,
          ),
        title: 'Disponibilidade — LexIntegra',
      },
    ],
  },
  {
    path: 'admin',
    canMatch: [exigirAutenticacao, exigirPerfil('admin')],
    loadComponent: () =>
      import('./shell/shell-autenticada').then((m) => m.ShellAutenticada),
    title: 'Administracao — LexIntegra',
    children: [
      {
        path: '',
        redirectTo: 'advogados',
        pathMatch: 'full',
      },
      {
        path: 'advogados',
        loadComponent: () =>
          import('./paginas/admin-advogados/admin-advogados').then(
            (m) => m.AdminAdvogados,
          ),
        title: 'Advogados — LexIntegra',
      },
      {
        path: 'produtos',
        loadComponent: () =>
          import('./paginas/admin-produtos/admin-produtos').then(
            (m) => m.AdminProdutos,
          ),
        title: 'Produtos — LexIntegra',
      },
      {
        path: 'distribuicao',
        loadComponent: () =>
          import('./paginas/admin-distribuicao/admin-distribuicao').then(
            (m) => m.AdminDistribuicao,
          ),
        title: 'Distribuicao — LexIntegra',
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./paginas/admin-clientes/admin-clientes').then(
            (m) => m.AdminClientes,
          ),
        title: 'Clientes — LexIntegra',
      },
    ],
  },

  {
    path: '**',
    loadComponent: () =>
      import('./paginas/nao-encontrado/nao-encontrado').then(
        (m) => m.NaoEncontrado,
      ),
    title: 'Pagina nao encontrada — LexIntegra',
  },
];
