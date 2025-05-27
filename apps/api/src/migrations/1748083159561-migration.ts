import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748083159561 implements MigrationInterface {
    name = 'Migration1748083159561'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" ADD "version" integer NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "version"`);
    }

}
