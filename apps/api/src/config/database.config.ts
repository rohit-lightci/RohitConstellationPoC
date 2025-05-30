import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.host || 'localhost',
  port: parseInt(process.env.port || '5432'),
  username: process.env.username || 'postgres',
  password: process.env.password || 'postgres',
  database: process.env.dbname || 'rohit_constellation',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
}; 