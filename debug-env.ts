import { privateEnv } from './config/private.test';
console.log('DEBUG ENV CHECK:');
console.log('DB_HOST:', privateEnv.DB_HOST);
console.log('DB_PORT:', privateEnv.DB_PORT);
console.log('DB_NAME:', privateEnv.DB_NAME);
console.log('DB_USER:', privateEnv.DB_USER ? '***' + privateEnv.DB_USER.slice(-1) : '(empty)');
console.log('DB_PASSWORD:', privateEnv.DB_PASSWORD ? '***' : '(empty)');
console.log('Full privateEnv:', JSON.stringify(privateEnv, null, 2));
