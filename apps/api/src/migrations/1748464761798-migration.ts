import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748464761798 implements MigrationInterface {
    name = 'Migration1748464761798'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" ADD "generatedReportJson" text`);
        await queryRunner.query(`ALTER TABLE "answers" DROP COLUMN "embedding"`);
        await queryRunner.query(`ALTER TABLE "answers" ADD "embedding" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "answers" DROP COLUMN "embedding"`);
        await queryRunner.query(`ALTER TABLE "answers" ADD "embedding" vector`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "generatedReportJson"`);
    }

}
