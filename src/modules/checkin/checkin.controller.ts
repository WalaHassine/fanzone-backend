import { Controller } from '@nestjs/common';
import { CheckinService } from './checkin.service';

/**
 * CheckinController
 * Handles /checkins endpoints.
 * TODO: implement routes.
 */
@Controller('checkins')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}
}
