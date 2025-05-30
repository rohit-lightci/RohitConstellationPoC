import { join } from "path";

import { DataSource } from "typeorm";
import "dotenv/config";

const DB_HOST = process.env.host ?? "localhost";
const DB_PORT = parseInt(process.env.port ?? "5432", 10);
const DB_USERNAME = process.env.username ?? "postgres";
const DB_PASSWORD = process.env.password ?? "postgres";
const DB_DATABASE = process.env.dbname ?? "rohit_constellation";

console.log("DB CONFIG:", DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE);

const AppDataSource = new DataSource({
  type: "postgres",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  synchronize: false,
  entities: [join(__dirname, "**", "*.entity.{ts,js}")],
  migrations: [join(__dirname, "src", "migrations", "*.{ts,js}")],
  migrationsRun: false,
  logging: true,
});

// Test the connection
AppDataSource.initialize()
  .then(() => {
    console.log('Data Source has been initialized!');
  })
  .catch((err) => {
    console.error('Error during Data Source initialization:', err);
  });

export default AppDataSource; 