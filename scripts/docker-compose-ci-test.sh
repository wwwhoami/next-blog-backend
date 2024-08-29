docker compose -f docker-compose-ci.yml --env-file .env.docker-compose up -d && docker exec -it next-blog-core-app pnpm test:e2e
