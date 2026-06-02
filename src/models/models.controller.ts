import { Body, Controller, Post, Res } from '@nestjs/common';
import { ModelsService } from './models.service';
import { Response } from 'express';

@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}
  @Post('bastChat')
  bastChat(@Body() body: { message: string }) {
    return this.modelsService.bastChat(body.message);
  }
  @Post('chatWithSystem')
  chatWithSystem(@Body() body: { system: string; message: string }) {
    return this.modelsService.chatWithSystem(body.system, body.message);
  }
  @Post('chatStream')
  streamChat(@Body() body: { message: string }, @Res() res: Response) {
    return this.modelsService.streamChat(body.message, res);
  }

  @Post('chatParser')
  chatWithParser(@Body() body: { message: string }) {
    return this.modelsService.chatWithParser(body.message);
  }
}
