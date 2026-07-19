import { Controller } from '@nestjs/common';
import { TeamService } from '../services/team.service';

/**
 * TeamController
 * Handles /teams endpoints.
 * TODO: implement routes.
 */
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}
}
