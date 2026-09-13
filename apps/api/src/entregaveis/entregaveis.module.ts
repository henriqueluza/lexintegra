import { Module } from '@nestjs/common';
import { EntregaveisService } from './entregaveis.service.js';
import { UploadDeEntregavelService } from './upload.service.js';

/**
 * Sem `controllers`: as rotas de evento de dominio vivem nos controladores por
 * perfil, em `pedidos/` — o mesmo lugar de onde o upload do entregavel e
 * disparado (Etapa 11). Um controlador aqui teria que escolher UM perfil, e os
 * eventos desta maquina de estados sao disparados por dois.
 */
@Module({
  providers: [EntregaveisService, UploadDeEntregavelService],
  exports: [EntregaveisService, UploadDeEntregavelService],
})
export class EntregaveisModule {}
