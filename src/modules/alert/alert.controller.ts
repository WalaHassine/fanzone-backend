import { Controller } from '@nestjs/common';
import { AlertService } from './alert.service';

/**
 * AlertController
 * Handles /alerts endpoints.
 * TODO: implement routes.
 */
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}
}
