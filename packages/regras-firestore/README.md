# Regras do Firestore

A suíte que exercita `firestore.rules` (na raiz do repositório) contra o emulador.

```bash
pnpm test:integration     # da raiz: sobe os emuladores e roda tudo
```

Precisa de **Java 11 ou mais novo** — os emuladores do Firebase rodam sobre a
JVM. É por isso que o script aqui se chama `test:integration` e não `test`:
`pnpm test` continua funcionando numa máquina sem JDK.

## O que a suíte prova

Que **ninguém** lê ou escreve no Firestore pelo SDK do navegador. Quatro perfis
(anônimo, cliente, advogado, admin) × doze caminhos do modelo de dados ×
cinco operações, tudo negado. São 244 asserções.

Isso é a forma final das regras, não um estado provisório. A justificativa está
no cabeçalho de `firestore.rules` e em `docs/arquitetura.md`, seção 6.1: a API
usa o Admin SDK, que **ignora** as regras, então um `allow` aqui seria uma porta
que nenhum caminho real do sistema atravessa — e que nenhum teste de aplicação
derrubaria se estivesse errada. A autorização por perfil vive em
`apps/api/src/autenticacao`.

## Duas coisas que parecem detalhe e não são

**O controle positivo.** Todos os outros casos afirmam que algo *falha*. Um
arnês quebrado — porta errada, emulador fora, contexto mal construído — faria
tudo falhar e a suíte passaria verde provando nada. Os dois testes de `arnês`
escrevem com as regras desligadas: se eles não passarem, a negação dos outros
244 não significa nada.

**O caminho `colecao-que-nao-existe`.** Testa o catch-all `/{document=**}`. Sem
ele, a suíte só provaria que as coleções que alguém lembrou de listar estão
negadas — e a coleção que a Etapa 5 criar amanhã não estaria na lista.

## Ao acrescentar uma coleção

Acrescente o caminho em `CAMINHOS`, em `src/regras.integration-spec.ts`. Não é
obrigatório para a regra valer (o catch-all já cobre), mas documenta o modelo de
dados no lugar onde ele é verificado.
