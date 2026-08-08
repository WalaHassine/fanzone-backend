/**
 * Recommendation DTO barrel.
 *
 * Lets consumers import from '../dto' rather than reaching into individual files.
 */
export { RecommendationRequestDto } from './recommendation-request.dto';
export {
  AiRecommendationOutputDto,
  EXPLANATION_MAX_LENGTH,
  EXPLANATION_MIN_LENGTH,
  OCCUPANCY_MAX,
  OCCUPANCY_MIN,
  SCORE_MAX,
  SCORE_MIN,
} from './ai-recommendation-output.dto';
export {
  RecommendationDetailDto,
  RecommendationMatchInfoDto,
  RecommendationReasoningDto,
  RecommendationResponseDto,
  RecommendedFanzoneInfoDto,
} from './recommendation-response.dto';
export { RecommendationListDto } from './recommendation-list.dto';
export {
  MatchRecommendationSuggestionDto,
  SuggestedFanzoneDto,
} from './match-recommendation-suggestion.dto';
