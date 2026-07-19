import { Controller } from '@nestjs/common';
import { UserService } from './user.service';

/**
 * UserController
 * Handles /users endpoints.
 * TODO: implement routes.
 */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}
}
