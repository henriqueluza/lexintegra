import { Module } from '@nestjs/common';
import { AutenticacaoModule } from './autenticacao/autenticacao.module.js';
import { FirebaseModule } from './firebase/firebase.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [FirebaseModule, AutenticacaoModule, HealthModule],
})
export class AppModule {}
