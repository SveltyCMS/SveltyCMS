@echo off
echo Starting local MongoDB for testing...
docker-compose -f docker-compose.test.yml up -d

echo Waiting for MongoDB to be ready...
timeout /t 10

echo MongoDB is ready! You can now run:
echo.
echo   npm run dev --env-file=.env.test
echo.
echo Or run tests with:
echo   npx playwright test tests/playwright/login.spec.ts --project=chromium --headed
echo.
echo To stop MongoDB later, run:
echo   docker-compose -f docker-compose.test.yml down