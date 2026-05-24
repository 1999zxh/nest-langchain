export class CreateUserDto {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export class UpdateUserDto {
  id: number;
  name?: string;
  email?: string;
  password?: string;
  role?: string;
}

export class QueryUserDto {
  page?: string;
  pageSize?: string;
  name?: string;
  email?: string;
  role?: string;
}
