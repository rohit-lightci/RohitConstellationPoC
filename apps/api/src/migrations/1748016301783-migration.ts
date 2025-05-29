import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748016301783 implements MigrationInterface {
    name = 'Migration1748016301783'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" ADD "answers" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "answers"`);
    }

}
