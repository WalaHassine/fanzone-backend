import { Controller } from '@nestjs/common';
import { MatchService } from '../services/match.service';

/**
 * MatchController
 * Handles /matches endpoints.
 * TODO: implement routes.
 */
@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}
}
