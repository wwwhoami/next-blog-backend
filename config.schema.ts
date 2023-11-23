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
  REDIS_PASSWORD: Joi.string(),
  APP_CORE_PORT: Joi.number().default(3000),
  APP_WS_NOTIFICATION_PORT: Joi.number().default(3001),
  KAFKA_NODE_ID: Joi.number().default(1),
  KAFKA_HOST: Joi.string().required(),
  KAFKA_PORT: Joi.number().default(9092),
  ZOOKEEPER_PORT: Joi.number().default(2181),
  CLIENT_URL: Joi.string(),
});
