import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [ProductsController],
  providers: [ProductsService, JwtAuthGuard, PermissionsGuard],
})
export class ProductsModule {}
