import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto, QueryUserDto, UpdateUserDto } from './dto/user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Post('create')
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
  @Get('getUserlist')
  getlist() {
    return this.userService.getUserlist();
  }
  @Get('getUserById/:id')
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }
  @Delete('deleteUser/:id')
  deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }
  @Put('updateUser')
  updateUser(@Body() updateUserDto: UpdateUserDto) {
    return this.userService.updateUser(updateUserDto);
  }
  @Get('searchUser')
  searchUser(@Query() queryUserDto: QueryUserDto) {
    return this.userService.searchUser(queryUserDto);
  }
}
