import { SetMetadata } from '@nestjs/common';

/**
 * @description Constant key for entity's ID type metadata
 */
export const ID_TYPE_KEY = 'idType';
/**
 * @description Decorator to specify that the entity's ID type is integer
 */
export const IntId = () => SetMetadata(ID_TYPE_KEY, 'int');
/**
 * @description Decorator to specify that the entity's ID type is UUID
 */
export const UuidId = () => SetMetadata(ID_TYPE_KEY, 'uuid');
