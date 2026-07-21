import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Replaces the caller's set of favourite teams.
 *
 * Requirement: EF-03 — "Sélectionner une ou plusieurs équipes favorites".
 *
 * Teams are referenced by their UUID (the `id` of TeamEntity). The array must
 * hold at least one ID; existence of each team is checked by the service layer,
 * not here, since class-validator has no database access.
 */
export class SetFavoriteTeamsDto {
  @ApiProperty({
    description: 'UUIDs of the teams to mark as favourites (one or more)',
    type: [String],
    format: 'uuid',
    example: [
      '3f0c9b7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
      '7a1e2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    ],
  })
  @IsArray({ message: 'teamIds must be an array' })
  @ArrayNotEmpty({ message: 'At least one team ID is required' })
  @IsUUID('all', { each: true, message: 'Each team ID must be a valid UUID' })
  teamIds!: string[];
}
