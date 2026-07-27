/**
 * Match DTO barrel.
 *
 * Lets consumers import from '../dto' rather than reaching into individual files.
 */
export { CreateMatchDto, STADIUM_MAX_LENGTH } from './create-match.dto';
export { MatchResponseDto, TeamSummaryDto } from './match-response.dto';
export { MatchFilterDto } from './match-filter.dto';
export { UpdateMatchDto } from './update-match.dto';
export {
  CreateTeamDto,
  TEAM_CODE_LENGTH,
  TEAM_CODE_PATTERN,
  TEAM_FLAG_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
  TEAM_NAME_PATTERN,
} from './create-team.dto';
export { UpdateTeamDto } from './update-team.dto';
export { TeamResponseDto } from './team-response.dto';
