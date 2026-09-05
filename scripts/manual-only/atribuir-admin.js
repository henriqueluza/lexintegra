/**
 * Script auditável para atribuição de custom claim de administrador.
 *
 * USO MANUAL APENAS — nunca executar a partir de uma sessão de agente
 * (Claude Code ou similar). Elevação de privilégio é a operação mais
 * sensível do sistema (ver Etapa 4 do plano de execução, item "Bloquear
 * ativamente").
 *
 * Pré-requisitos:
 *   1. npm install firebase-admin
 *   2. Baixar a chave de conta de serviço no console do Firebase
 *      (Configurações do projeto > Contas de serviço > Gerar nova chave privada)
 *   3. Guardar o arquivo baixado FORA do repositório (ex. ~/secrets/lexintegra-admin-key.json)
 *      e ajustar o caminho abaixo, em CAMINHO_DA_CHAVE.
 *
 * Execução:
 *   node atribuir-admin.js
 *
 * IMPORTANTE: confirme com a arquitetura/regras do Firestore qual é o
 * nome exato do campo e do valor esperado na claim antes de rodar.
 * O placeholder abaixo usa `role: 'admin'` — ajuste se a convenção do
 * projeto for outra (ex. `perfil: 'admin_global'`).
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const os = require('os');

// ADAPTE: caminho para a chave de conta de serviço, relativo à sua home.
// Mantenha esse arquivo FORA do repositório — nunca o commite.
const CAMINHO_DA_CHAVE = path.join(os.homedir(), 'secrets', 'lexintegra-admin-key.json');
const serviceAccount = require(CAMINHO_DA_CHAVE);

initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth();

// UID da conta temporária de admin (henriqueluza@gmail.com)
const UID_ADMIN_TEMPORARIO = 'vxLm7zQapcYEJpyBEAzNgKcMGkW2';

async function atribuirClaimAdmin(uid) {
  // ADAPTE: nome do campo e valor conforme a convenção definida na arquitetura
  await auth.setCustomUserClaims(uid, { role: 'admin' });

  // Confirma que a claim foi de fato gravada
  const usuario = await auth.getUser(uid);
  console.log('Claims atuais do usuário:', usuario.customClaims);

  if (usuario.customClaims?.role === 'admin') {
    console.log(`✅ UID ${uid} agora possui a claim de admin.`);
  } else {
    console.warn('⚠️  A claim não apareceu como esperado. Verifique o nome do campo.');
  }
}

atribuirClaimAdmin(UID_ADMIN_TEMPORARIO)
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error('Erro ao atribuir claim:', erro);
    process.exit(1);
  });
