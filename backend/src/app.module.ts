import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CameraModule } from './camera/camera.module';
import { DatabaseModule } from './database/database.module';
import { InspectionsModule } from './inspections/inspections.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProductsModule } from './products/products.module';
import { RolesModule } from './roles/roles.module';
import { SetupModule } from './setup/setup.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    CameraModule,
    RolesModule,
    PermissionsModule,
    ProductsModule,
    InspectionsModule,
    SystemModule,
    SetupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
