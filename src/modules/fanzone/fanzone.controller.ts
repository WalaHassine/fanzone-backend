import { Controller } from '@nestjs/common';
import { FanzoneService } from './fanzone.service';

/**
 * FanzoneController
 * Handles /fanzones endpoints.
 * TODO: implement routes.
 */
@Controller('fanzones')
export class FanzoneController {
  constructor(private readonly fanzoneService: FanzoneService) {}
}
