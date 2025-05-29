import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1748369620051 implements MigrationInterface {
    name = 'Migration1748369620051'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Enable the vector extension (idempotent - won't fail if already exists)
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

        // 2. Check if the column 'embedding' exists.
        // This is a bit more involved with plain queryRunner, but let's assume a common path.
        // A simpler way for this migration is to try dropping it if it exists as 'text'
        // and then add it with the correct type, or alter it.

        // Option A: Drop if exists as wrong type, then add correctly.
        // This is cleaner if you are unsure of the previous state or if it was 'text'.
        // await queryRunner.query(`ALTER TABLE "answers" DROP COLUMN IF EXISTS "embedding"`);
        // await queryRunner.query(`ALTER TABLE "answers" ADD COLUMN "embedding" vector(1536) NULL`);

        // Option B: Try to add if not exists, or alter if it exists (and hope it's alterable from text to vector).
        // Altering from 'text' to 'vector' directly might require a USING clause if there's data.
        // If the column is new or empty, it's simpler.

        // Let's go with a common robust approach:
        // First, attempt to drop the column if it exists (handles case where it was added as 'text' incorrectly)
        // Then, add it with the correct 'vector(1536)' type.
        // This makes the migration idempotent regarding the column definition for 'embedding'.

        const table = await queryRunner.getTable("answers");
        const embeddingColumnExists = table?.columns.find(column => column.name === "embedding");

        if (embeddingColumnExists) {
            // If it exists, we assume it might be the wrong type (e.g., 'text') and try to change it.
            // Directly changing from 'text' to 'vector' might fail if there's incompatible data.
            // A safer approach if data exists is to add a new column, migrate data, drop old, rename new.
            // But if the column is freshly added as 'text' and is empty, or if we are sure there's no data:
            this.log(`Altering column "embedding" on "answers" table to type vector(1536).`);
            await queryRunner.query(`ALTER TABLE "answers" ALTER COLUMN "embedding" TYPE vector(1536) USING "embedding"::vector`);
            // The USING "embedding"::vector part is crucial if there's any data that PostgreSQL can cast.
            // If the column was 'text' and contained e.g. '[1,2,3]', this might work.
            // If it was 'text' and contained "hello", it would fail.
            // If you are certain the column is empty or doesn't exist yet with conflicting data,
            // you could simplify, but the USING clause makes it more robust for type changes with existing data.
            // However, for a fresh setup, or if the 'text' column is known to be empty or contain valid vector strings:
            // await queryRunner.query(`ALTER TABLE "answers" ALTER COLUMN "embedding" TYPE vector(1536)`);
            // To make it nullable as per our entity:
            await queryRunner.query(`ALTER TABLE "answers" ALTER COLUMN "embedding" SET NULL`); // To ensure it's nullable
        } else {
            // If the column doesn't exist at all, add it.
            this.log(`Adding column "embedding" to "answers" table with type vector(1536).`);
            await queryRunner.query(`ALTER TABLE "answers" ADD COLUMN "embedding" vector(1536) NULL`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This assumes it was either added as vector(1536) or altered to it.
        // Dropping the column is a safe reversal.
        await queryRunner.query(`ALTER TABLE "answers" DROP COLUMN IF EXISTS "embedding"`);
    }

    // Helper log method
    private log(message: string) {
        console.log(`[Migration1748369620051] ${message}`);
    }
}
