import Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string().required(),
  ACCESS_JWT_SECRET: Joi.string().required(),
  ACCESS_JWT_EXPIRATION: Joi.number().required(),
  REFRESH_JWT_SECRET: Joi.string().required(),
  REFRESH_JWT_EXPIRATION: Joi.number().required(),
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().default(5432),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().required(),
  APP_CORE_PORT: Joi.number().default(3000),
  APP_WS_NOTIFICATION_PORT: Joi.number().default(3001),
});
