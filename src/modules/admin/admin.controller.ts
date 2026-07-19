import { Controller } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * AdminController
 * Handles /admin endpoints.
 * TODO: implement routes.
 */
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
}
