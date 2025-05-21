import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSession1747861330116 implements MigrationInterface {
    name = 'AddSession1747861330116'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "session" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "template" character varying NOT NULL, "title" character varying NOT NULL, "description" character varying, "duration" integer NOT NULL, "anonymous" boolean NOT NULL, "participationRule" character varying NOT NULL, "permissions" jsonb NOT NULL, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "session"`);
    }

}
