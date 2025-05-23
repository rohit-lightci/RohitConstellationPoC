import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748027402589 implements MigrationInterface {
    name = 'Migration1748027402589'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "answers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "questionId" character varying NOT NULL, "participantId" character varying NOT NULL, "response" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "sessionId" uuid NOT NULL, CONSTRAINT "PK_9c32cec6c71e06da0254f2226c6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "answers"`);
        await queryRunner.query(`ALTER TABLE "answers" ADD CONSTRAINT "FK_f50933d09604c95d08cc7e020de" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "answers" DROP CONSTRAINT "FK_f50933d09604c95d08cc7e020de"`);
        await queryRunner.query(`ALTER TABLE "session" ADD "answers" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`DROP TABLE "answers"`);
    }

}
