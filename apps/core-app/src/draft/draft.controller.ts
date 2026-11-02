import { GetUser } from '@core/src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DraftService } from './draft.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

@Controller('draft')
@ApiTags('draft')
@ApiBearerAuth('accessToken')
@UseGuards(AccessTokenGuard)
export class DraftController {
  constructor(private readonly service: DraftService) {}

  @Post()
  create(@GetUser('id') ownerId: string, @Body() dto: CreateDraftDto) {
    return this.service.create(ownerId, dto);
  }

  @Get()
  list(@GetUser('id') ownerId: string) {
    return this.service.list(ownerId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @GetUser('id') ownerId: string) {
    return this.service.get(id, ownerId);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.service.update(id, ownerId, dto);
  }

  @Post(':id/publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
  ) {
    return this.service.publish(id, ownerId);
  }
}
