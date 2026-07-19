import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * AuthController
 * Handles /auth endpoints (register, login).
 * TODO: implement routes.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
}
