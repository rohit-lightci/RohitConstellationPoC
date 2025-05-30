import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const DB = process.env.DB ? JSON.parse(process.env.DB) : {};

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: DB.host || 'localhost',
  port: parseInt(DB.port || '54444'),
  username: DB.username || 'postgres',
  password: DB.password || 'postgres',
  database: process.env.dbname || 'rohit_constellation',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: false,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
}; 