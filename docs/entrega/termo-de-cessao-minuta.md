# Termo de cessão de direitos: MINUTA

> **MINUTA PARA REVISÃO JURÍDICA — NÃO ASSINAR NESTA FORMA.** Revista em
> 02/11/2026. Rascunho técnico preparado a partir da
> cláusula 8ª do contrato. Não é peça jurídica pronta. Todos os trechos entre
> `[PREENCHER]` dependem de dado que o repositório não tem, e o texto inteiro
> precisa ser revisado por advogado antes de qualquer assinatura.

## Partes

**CONTRATADO:** `[PREENCHER: qualificação completa do CONTRATADO]`

**CONTRATANTE:** `[PREENCHER: qualificação completa da CONTRATANTE]`

## 1. Fundamento

Este termo executa a cláusula 8ª do contrato firmado entre as partes
(`[PREENCHER: data e identificação do contrato]`), cujo texto é:

> 8.1. Quitado integralmente o valor previsto na Cláusula 6ª, a titularidade
> exclusiva do código-fonte, da documentação e de todo o produto desenvolvido é
> cedida à CONTRATANTE, de forma total, definitiva e irrevogável, para todo o
> território nacional e prazo indeterminado, incluindo o direito de cedê-la a
> terceiros.
>
> 8.2. A cessão prevista no item 8.1 abrange o direito de a CONTRATANTE
> transferir a titularidade da solução ao cliente final, nos termos do contrato
> por ela firmado.
>
> 8.3. O CONTRATADO poderá citar o projeto em seu portfólio, sem divulgação de
> código, dados de clientes ou informações sigilosas.

## 2. Condição

A cessão produz efeitos com a quitação integral do valor da Cláusula 6ª,
ocorrida em `[PREENCHER: data da quitação]`, comprovada por
`[PREENCHER: comprovante]`.

## 3. Objeto cedido

| Item | Identificação |
|---|---|
| Código-fonte | Repositório GitHub `henriqueluza/lexintegra` (ou o repositório de destino da transferência, `[PREENCHER: nome]`), no commit final `[PREENCHER: hash do commit final]` (último item da seção D do `CHECKLIST.md`) |
| Documentação | No mesmo commit: o índice `docs/README.md`, os documentos de `docs/entrega/`, os runbooks de `docs/runbooks/`, os manuais por perfil de `docs/manuais/` (com as capturas de tela, geradas com dados fictícios) e os demais de `docs/` |
| Projeto de nuvem | Projeto Google Cloud/Firebase de ID `plataforma-juridica-36bda`, região `southamerica-east1`, com os recursos descritos em `docs/entrega/inventario-custos.md` e `docs/entrega/transferencia.md`. `[PREENCHER: forma e data da transferência da titularidade do projeto e da conta de faturamento]` |
| Marca e domínio | Nome "LexIntegra". Domínio `lexintegra.com.br`. `[PREENCHER: confirmar se entram na cessão e em nome de quem estão registrados]` |
| Configurações em contas de terceiros | Não são cedidas, porque já pertencem ao escritório: o aplicativo da LexIntegra no Entra ID do tenant da B&C, as políticas `LexIntegra-Reunioes` e `LexIntegra-Organizadora` e a conta organizadora `operacional@`; o webhook e as chaves na conta do AbacatePay; o domínio verificado na conta do Resend. O termo registra que foram configuradas pelo CONTRATADO a pedido da CONTRATANTE |
| Credenciais | Não fazem parte do objeto. Segredos ficam no Secret Manager e são trocados conforme `docs/entrega/credenciais.md` |

## 4. Ressalva: componentes de terceiros

A cessão do item 3 alcança o que o CONTRATADO produziu. **Não alcança**
componentes de terceiros incorporados ou usados pelo produto, como
bibliotecas de código aberto, imagens de contêiner, fontes tipográficas, o
ClamAV e as bases de assinaturas, e os serviços contratados (Google Cloud,
Firebase, AbacatePay, Resend, Microsoft). Esses componentes seguem as
próprias licenças e termos, listados no **Anexo I**, e a CONTRATANTE os
recebe nas condições ali descritas.

Duas observações do anexo que a revisão jurídica precisa ler:

- o ClamAV é GPL-2.0, e as imagens de contêiner trazem software GPL do sistema
  operacional. As obrigações da GPL se ligam à **distribuição**, então a
  entrega de imagens construídas, além do código-fonte, precisa ser avaliada;
- **a documentação oficial do ClamAV não informa termos de uso da base de
  assinaturas.** O anexo registra a lacuna, e o termo não deve prometer nada
  sobre a base.

## 5. Portfólio (cláusula 8.3)

O CONTRATADO pode citar o projeto em seu portfólio, sem divulgar código, dados
de clientes ou informações sigilosas. `[PREENCHER: se a revisão quiser
detalhar o que pode ser citado, por exemplo nome, descrição e capturas de
tela]`.

## 6. Assinaturas

`[PREENCHER: local, data e assinaturas do CONTRATADO e da CONTRATANTE, com testemunhas se o contrato exigir]`

---

## Anexo I: licenças de terceiros

O anexo é o documento [`licencas-terceiros.md`](licencas-terceiros.md), na versão do
commit final. Ele lista as dependências por licença, as imagens de contêiner
e o ClamAV, as fontes tipográficas e os serviços externos. Deve ser
regenerado e conferido no commit final, antes da assinatura.
