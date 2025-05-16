import { ApiProperty } from '@nestjs/swagger';

export class HealthResponse {
    @ApiProperty({
        description: 'Application health status',
        example: 'ok',
    })
    status: string;

    @ApiProperty({
        description: 'Application version number',
        example: '0.0.1',
    })
    version: string;
} 