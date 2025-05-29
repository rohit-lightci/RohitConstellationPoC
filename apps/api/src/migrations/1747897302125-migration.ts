import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1747897302125 implements MigrationInterface {
    name = 'Migration1747897302125'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "duration"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "anonymous"`);
        await queryRunner.query(`CREATE TYPE "public"."session_type_enum" AS ENUM('RETRO')`);
        await queryRunner.query(`ALTER TABLE "session" ADD "type" "public"."session_type_enum" NOT NULL DEFAULT 'RETRO'`);
        await queryRunner.query(`CREATE TYPE "public"."session_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED')`);
        await queryRunner.query(`ALTER TABLE "session" ADD "status" "public"."session_status_enum" NOT NULL DEFAULT 'DRAFT'`);
        await queryRunner.query(`ALTER TABLE "session" ADD "globalTimeLimit" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "session" ADD "expiresAt" TIMESTAMP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session" ADD "createdBy" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session" ADD "isAnonymous" boolean NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session" ADD "participants" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "session" ADD "sections" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "sections"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "participants"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "isAnonymous"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "createdBy"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "expiresAt"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "globalTimeLimit"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."session_status_enum"`);
        await queryRunner.query(`ALTER TABLE "session" DROP COLUMN "type"`);
        await queryRunner.query(`DROP TYPE "public"."session_type_enum"`);
        await queryRunner.query(`ALTER TABLE "session" ADD "anonymous" boolean NOT NULL`);
        await queryRunner.query(`ALTER TABLE "session" ADD "duration" integer NOT NULL`);
    }

}
