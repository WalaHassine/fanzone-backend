import { Controller } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';

/**
 * RecommendationController
 * Handles /recommendations endpoints.
 * TODO: implement routes.
 */
@Controller('recommendations')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}
}
